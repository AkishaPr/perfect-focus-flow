import { blocksOn, fromMin, toMin, ymd } from "../calendar";
import type { CalEvent, Goal, PlanBlock, Settings, Task } from "../types";
import { compareScored, isOpen, scoreTask, type ScoreBreakdown } from "./score";
import { freeWindows, type Interval } from "./windows";

export type UnscheduledReason =
  | "no_free_time" // nothing left in the day's windows
  | "daily_limit" // max daily study minutes reached
  | "too_long" // not splittable and no window is long enough
  | "chunk_too_small" // splittable, but every gap is shorter than minChunkMin
  | "partial"; // some of it was scheduled, the rest did not fit

export interface Unscheduled {
  task: Task;
  reason: UnscheduledReason;
  /** Minutes of the task that did not get a block. */
  remainingMin: number;
}

export interface PlanInput {
  date: Date;
  settings: Settings;
  events: CalEvent[];
  tasks: Task[];
  goals: Goal[];
  blocks: PlanBlock[];
  /** When planning today, the current time; nothing is placed before it. */
  now?: Date;
}

export interface PlanResult {
  /** New planned blocks for the date (replace the date's old "planned" blocks). */
  blocks: PlanBlock[];
  unscheduled: Unscheduled[];
  /** Score of every open task, highest first — useful for "Start Next Task". */
  ranked: { task: Task; score: ScoreBreakdown }[];
}

const blockMin = (b: PlanBlock) => toMin(b.end) - toMin(b.start);
const ROUND = 5;
const roundUp = (m: number) => Math.ceil(m / ROUND) * ROUND;

/** Minutes of a task already covered by done/partial blocks (any day). */
export function minutesDone(taskId: string, blocks: PlanBlock[]): number {
  return blocks
    .filter((b) => b.taskId === taskId && (b.status === "done" || b.status === "partial"))
    .reduce((s, b) => s + blockMin(b), 0);
}

/**
 * Build the plan for one day. Pure and deterministic: the same input
 * always gives the same output, and nothing is mutated.
 */
export function planDay(input: PlanInput): PlanResult {
  const { date, settings, events, tasks, goals, blocks, now } = input;
  const dateKey = ymd(date);

  const fromMinute =
    now && ymd(now) === dateKey ? roundUp(now.getHours() * 60 + now.getMinutes()) : undefined;
  const free: Interval[] = freeWindows(date, settings, events, blocks, { fromMin: fromMinute });

  const studiedToday = blocksOn(blocks, date)
    .filter((b) => b.status === "done" || b.status === "partial")
    .reduce((s, b) => s + blockMin(b), 0);
  let capLeft = Math.max(0, settings.maxDailyStudyMin - studiedToday);

  const ranked = tasks
    .filter(isOpen)
    .map((task) => ({ task, score: scoreTask(task, { date, settings, goals, tasks }) }))
    .sort(compareScored);

  const out: PlanBlock[] = [];
  const unscheduled: Unscheduled[] = [];
  const focus = Math.max(1, settings.focusMin);
  const brk = Math.max(0, settings.breakMin);

  const place = (seg: Interval, task: Task, len: number) => {
    out.push({
      id: `plan-${dateKey}-${task.id}-${out.length}`,
      taskId: task.id,
      date: dateKey,
      start: fromMin(seg.start),
      end: fromMin(seg.start + len),
      status: "planned",
    });
    seg.start += len + brk; // break after every focus chunk
    capLeft -= len;
  };

  for (const { task } of ranked) {
    let remaining = Math.max(0, task.estimateMin - minutesDone(task.id, blocks));
    if (remaining === 0) continue;
    const start = remaining;
    const anyFree = free.some((s) => s.end > s.start);

    if (!task.splittable) {
      const seg = free.find((s) => s.end - s.start >= remaining);
      if (seg && capLeft >= remaining) {
        place(seg, task, remaining);
      } else {
        const reason: UnscheduledReason = !anyFree
          ? "no_free_time"
          : capLeft < remaining
            ? "daily_limit"
            : "too_long";
        unscheduled.push({ task, reason, remainingMin: remaining });
      }
      continue;
    }

    const minChunk = Math.max(1, Math.min(task.minChunkMin, remaining));
    for (const seg of free) {
      while (remaining > 0 && capLeft > 0) {
        const room = seg.end - seg.start;
        const chunk = Math.min(remaining, focus, room, capLeft);
        // A chunk shorter than minChunkMin is only allowed when it finishes the task.
        if (chunk <= 0 || (chunk < minChunk && chunk < remaining)) break;
        place(seg, task, chunk);
        remaining -= chunk;
      }
      if (remaining === 0 || capLeft <= 0) break;
    }

    if (remaining > 0) {
      const reason: UnscheduledReason =
        remaining < start
          ? "partial"
          : !anyFree
            ? "no_free_time"
            : capLeft < minChunk
              ? "daily_limit"
              : "chunk_too_small";
      unscheduled.push({ task, reason, remainingMin: remaining });
    }
  }

  out.sort((a, b) => toMin(a.start) - toMin(b.start));
  return { blocks: out, unscheduled, ranked };
}

/**
 * Merge a day's plan into the stored blocks: drops that date's old
 * "planned" blocks and keeps everything done, partial or missed.
 */
export function applyPlan(existing: PlanBlock[], date: Date, plan: PlanBlock[]): PlanBlock[] {
  const key = ymd(date);
  return [...existing.filter((b) => !(b.date === key && b.status === "planned")), ...plan];
}
