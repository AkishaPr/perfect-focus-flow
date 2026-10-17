import { addDays, fromMin, toMin, ymd } from "../calendar";
import type { CalEvent, Goal, PlanBlock, Settings, Task } from "../types";
import { length, totalLength, type Interval } from "./intervals";
import { rankTasks, type RankedTask } from "./score";
import { freeWindows, lockedIntervals } from "./windows";

export type UnscheduledReason = "no_free_time" | "daily_cap" | "too_long" | "no_fit" | "partial";

export const REASON_LABEL: Record<UnscheduledReason, string> = {
  no_free_time: "No free study time on this day",
  daily_cap: "Daily study limit reached",
  too_long: "Longer than any free window and cannot be split",
  no_fit: "Free windows already filled by higher-priority work",
  partial: "Only part of it fits",
};

export interface Unscheduled {
  task: Task;
  reason: UnscheduledReason;
  remainingMin: number;
  plannedMin: number;
}

export interface DayPlan {
  date: string;
  blocks: PlanBlock[];
  breaks: Interval[];
  unscheduled: Unscheduled[];
  ranked: RankedTask[];
  free: Interval[];
  freeMin: number;
  plannedMin: number;
  capacityMin: number;
}

export interface PlanInput {
  date: Date;
  settings: Settings;
  events: CalEvent[];
  tasks: Task[];
  goals: Goal[];
  blocks: PlanBlock[];
  nowMin?: number | undefined;
  bufferMin?: number | undefined;
  /** Minutes still needed per task id; defaults to estimate minus completed blocks. */
  remaining?: Map<string, number> | undefined;
}

const blockMin = (b: PlanBlock) => toMin(b.end) - toMin(b.start);

/** Estimate minus minutes already completed in done or partial blocks. */
export function remainingMinutes(tasks: Task[], blocks: PlanBlock[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of tasks) {
    const done = blocks
      .filter((b) => b.taskId === t.id && (b.status === "done" || b.status === "partial"))
      .reduce((s, b) => s + blockMin(b), 0);
    out.set(t.id, Math.max(0, t.estimateMin - done));
  }
  return out;
}

/** Choose a chunk size for a splittable task in a slot, or 0 when nothing valid fits. */
function chunkFor(need: number, slotLen: number, cap: number, focusMin: number, minChunk: number) {
  let c = Math.min(focusMin, need, slotLen, cap);
  if (c <= 0) return 0;
  if (c === need) return c;
  if (c < minChunk) return 0;
  const rest = need - c;
  if (rest > 0 && rest < minChunk) {
    const shrunk = need - minChunk;
    c = shrunk >= minChunk ? Math.min(c, shrunk) : 0;
  }
  return c;
}

export function planDay(input: PlanInput): DayPlan {
  const { date, settings, events, tasks, goals, blocks, nowMin, bufferMin } = input;
  const key = ymd(date);
  const free = freeWindows(date, settings, events, blocks, { nowMin, bufferMin });
  const slots = free.map((i) => ({ ...i }));
  const longest = Math.max(0, ...free.map(length));
  const doneToday = totalLength(lockedIntervals(blocks, date));
  const capacityMin = Math.max(0, settings.maxDailyStudyMin - doneToday);
  const remaining = input.remaining ?? remainingMinutes(tasks, blocks);
  const ranked = rankTasks(tasks, { date, settings, goals, tasks });

  const out: PlanBlock[] = [];
  const breaks: Interval[] = [];
  const unscheduled: Unscheduled[] = [];
  let cap = capacityMin;

  const place = (task: Task, slot: Interval, min: number) => {
    const start = slot.start;
    out.push({
      id: `${key}:${task.id}:${start}`,
      taskId: task.id,
      date: key,
      start: fromMin(start),
      end: fromMin(start + min),
      status: "planned",
    });
    slot.start += min;
    cap -= min;
    const brk = Math.min(settings.breakMin, length(slot));
    if (brk > 0) {
      breaks.push({ start: slot.start, end: slot.start + brk });
      slot.start += brk;
    }
  };

  for (const { task } of ranked) {
    let need = remaining.get(task.id) ?? task.estimateMin;
    if (need <= 0) continue;
    let planned = 0;

    if (!task.splittable) {
      const slot = cap >= need ? slots.find((s) => length(s) >= need) : undefined;
      if (slot) {
        place(task, slot, need);
        planned = need;
        need = 0;
      }
    } else {
      while (need > 0 && cap > 0) {
        let placedChunk = false;
        for (const slot of slots) {
          const c = chunkFor(need, length(slot), cap, settings.focusMin, task.minChunkMin);
          if (c > 0) {
            place(task, slot, c);
            planned += c;
            need -= c;
            placedChunk = true;
            break;
          }
        }
        if (!placedChunk) break;
      }
    }

    if (need > 0) {
      const reason: UnscheduledReason =
        planned > 0
          ? "partial"
          : free.length === 0
            ? "no_free_time"
            : !task.splittable && need > longest
              ? "too_long"
              : cap < Math.min(need, task.splittable ? task.minChunkMin : need)
                ? "daily_cap"
                : "no_fit";
      unscheduled.push({ task, reason, remainingMin: need, plannedMin: planned });
    }
  }

  out.sort((a, b) => toMin(a.start) - toMin(b.start));
  const starts = new Set(out.map((b) => toMin(b.start)));
  const plannedMin = out.reduce((s, b) => s + blockMin(b), 0);

  return {
    date: key,
    blocks: out,
    // A break only matters if study resumes right after it.
    breaks: breaks.filter((b) => starts.has(b.end)),
    unscheduled,
    ranked,
    free,
    freeMin: totalLength(free),
    plannedMin,
    capacityMin,
  };
}

export interface LateBlock {
  block: PlanBlock;
  task: Task;
}

export interface RangePlan {
  days: DayPlan[];
  /** Tasks with time still left after the last day of the range. */
  unscheduled: Unscheduled[];
  /** Blocks placed after their task's deadline. */
  late: LateBlock[];
  plannedMin: number;
  freeMin: number;
}

export interface RangeInput extends Omit<PlanInput, "date" | "remaining" | "nowMin"> {
  start: Date;
  days: number;
  /** Real current time; only applied to the day matching its date. */
  now?: Date | undefined;
}

/** Plan consecutive days, carrying each task's remaining minutes forward from day to day. */
export function planRange(input: RangeInput): RangePlan {
  const { start, days, now, ...rest } = input;
  const remaining = remainingMinutes(rest.tasks, rest.blocks);
  const todayKey = now ? ymd(now) : null;
  const startKey = ymd(start);

  // Future work already saved before this range still counts as committed.
  for (const b of rest.blocks) {
    if (b.status !== "planned" || b.date >= startKey || (todayKey && b.date < todayKey)) continue;
    remaining.set(b.taskId, Math.max(0, (remaining.get(b.taskId) ?? 0) - blockMin(b)));
  }

  const out: DayPlan[] = [];
  const late: LateBlock[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    const key = ymd(date);
    const nowMin = todayKey === key && now ? now.getHours() * 60 + now.getMinutes() : undefined;
    const day = planDay({ ...rest, date, nowMin, remaining: new Map(remaining) });
    for (const b of day.blocks) {
      remaining.set(b.taskId, Math.max(0, (remaining.get(b.taskId) ?? 0) - blockMin(b)));
      const task = rest.tasks.find((t) => t.id === b.taskId);
      if (task?.deadline && key > task.deadline) late.push({ block: b, task });
    }
    out.push(day);
  }

  const last = out[out.length - 1];
  const unscheduled: Unscheduled[] = rest.tasks
    .filter((t) => (remaining.get(t.id) ?? 0) > 0 && last?.ranked.some((r) => r.task.id === t.id))
    .map((task) => {
      const left = remaining.get(task.id) ?? 0;
      const lastReason = [...out].reverse().flatMap((d) => d.unscheduled).find((u) => u.task.id === task.id);
      const planned = out.flatMap((d) => d.blocks).filter((b) => b.taskId === task.id).reduce((s, b) => s + blockMin(b), 0);
      return {
        task,
        reason: planned > 0 ? "partial" : (lastReason?.reason ?? "no_fit"),
        remainingMin: left,
        plannedMin: planned,
      } satisfies Unscheduled;
    });

  return {
    days: out,
    unscheduled,
    late,
    plannedMin: out.reduce((s, d) => s + d.plannedMin, 0),
    freeMin: out.reduce((s, d) => s + d.freeMin, 0),
  };
}

export interface PlanDiff {
  added: number;
  removed: number;
  kept: number;
}

const sig = (b: PlanBlock) => `${b.date}|${b.taskId}|${b.start}|${b.end}`;

/**
 * A saved block the planner may replace: still planned, inside the planned dates, and not already
 * in the past. Past planned blocks are left for missed-task detection.
 */
export function isReplaceable(b: PlanBlock, dates: Set<string>, now?: Date) {
  if (b.status !== "planned" || !dates.has(b.date)) return false;
  if (!now) return true;
  const today = ymd(now);
  if (b.date < today) return false;
  return b.date > today || toMin(b.end) > now.getHours() * 60 + now.getMinutes();
}

/** Saved blocks with the replaceable ones swapped for the proposed plan. Nothing else is touched. */
export function mergePlan(saved: PlanBlock[], proposed: PlanBlock[], dates: string[], now?: Date): PlanBlock[] {
  const scope = new Set(dates);
  const kept = saved.filter((b) => !isReplaceable(b, scope, now));
  const taken = new Set(kept.map((b) => b.id));
  return [...kept, ...proposed.filter((b) => !taken.has(b.id))];
}

/** Compare a proposed set of blocks with the saved planned blocks it would replace. */
export function diffPlan(saved: PlanBlock[], proposed: PlanBlock[], dates: string[], now?: Date): PlanDiff {
  const scope = new Set(dates);
  const before = new Set(saved.filter((b) => isReplaceable(b, scope, now)).map(sig));
  const after = new Set(proposed.map(sig));
  let kept = 0;
  for (const s of after) if (before.has(s)) kept++;
  return { added: after.size - kept, removed: before.size - kept, kept };
}
