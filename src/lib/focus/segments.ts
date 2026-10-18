import { fromMin, toMin, ymd } from "../calendar";
import type { PlanBlock, Session, Task } from "../types";

/**
 * Pure state transitions for finished focus segments (Stage 6), in the same style as the
 * Stage 5 block transitions in store.ts: slice in, slice out, no store, no clock.
 */
export type FocusSlice = { tasks: Task[]; blocks: PlanBlock[]; sessions: Session[] };

export interface SegmentInput {
  /** Becomes the session id. Logging the same id twice is a no-op (double-click safe). */
  sessionId: string;
  taskId: string;
  /** The committed block the segment came from, if it is still planned. */
  blockId: string | null;
  startedAtMs: number;
  endedAtMs: number;
  /** Minutes studied: already edited or rounded by the caller. Under 1 logs no time. */
  minutes: number;
  /** The phase's planned length. Reaching it makes the block "done", stopping short "partial". */
  plannedMin: number;
  taskDone: boolean;
}

const hhmm = (d: Date) => fromMin(d.getHours() * 60 + d.getMinutes());
const LAST_MINUTE = 23 * 60 + 59;

/** The clock span of the segment on its start day. A span crossing midnight is cut at 23:59. */
function spanOf(startedAtMs: number, endedAtMs: number, minutes: number) {
  const start = new Date(startedAtMs);
  const end = new Date(Math.max(startedAtMs, endedAtMs));
  const startMin = toMin(hhmm(start));
  const sameDay = ymd(end) === ymd(start);
  const endMin = Math.min(
    LAST_MINUTE,
    // Never shorter than the minutes studied, whatever rounding did to the clock times.
    Math.max(sameDay ? toMin(hhmm(end)) : LAST_MINUTE, startMin + minutes),
  );
  return { date: ymd(start), start: fromMin(startMin), end: fromMin(endMin) };
}

/**
 * Log a finished focus segment: a session for the task's time, plus a done or partial block so
 * the day's timeline shows it. The two point at each other so study time is counted once.
 *
 * - The committed block it came from (if any) is turned into that block; otherwise one is made.
 * - A task with time logged is at least "in progress". "Task done" finishes it and drops its
 *   other pending commitments, like `completeBlock` does.
 * - A task that no longer exists, or a segment already logged, changes nothing.
 */
export function recordFocusSegment(s: FocusSlice, seg: SegmentInput): FocusSlice {
  const task = s.tasks.find((t) => t.id === seg.taskId);
  if (!task || s.sessions.some((x) => x.id === seg.sessionId)) return s;

  const minutes = Number.isFinite(seg.minutes) ? Math.max(0, Math.round(seg.minutes)) : 0;
  const committed = seg.blockId
    ? s.blocks.find((b) => b.id === seg.blockId && b.status === "planned")
    : undefined;
  const endedIso = new Date(seg.endedAtMs).toISOString();

  let blocks = s.blocks;
  let sessions = s.sessions;
  if (minutes >= 1) {
    const blockId = committed?.id ?? `focus:${seg.sessionId}`;
    const block: PlanBlock = {
      id: blockId,
      taskId: task.id,
      ...spanOf(seg.startedAtMs, seg.endedAtMs, minutes),
      status: seg.taskDone || minutes >= seg.plannedMin ? "done" : "partial",
    };
    blocks = committed
      ? blocks.map((b) => (b.id === committed.id ? block : b))
      : [...blocks, block];
    sessions = [
      ...sessions,
      {
        id: seg.sessionId,
        taskId: task.id,
        start: new Date(seg.startedAtMs).toISOString(),
        end: endedIso,
        actualMin: minutes,
        blockId,
      },
    ];
  } else if (committed) {
    // Nothing worth logging: the commitment is over, so release it instead of leaving it dangling.
    blocks = blocks.filter((b) => b.id !== committed.id);
  }

  let nextTask: Task = task;
  if (seg.taskDone) {
    blocks = blocks.filter((b) => b.taskId !== task.id || b.status !== "planned");
    nextTask = {
      ...task,
      status: "done",
      completedAt: task.status === "done" ? (task.completedAt ?? endedIso) : endedIso,
    };
  } else if (minutes >= 1 && task.status !== "in_progress" && task.status !== "done") {
    nextTask = { ...task, status: "in_progress" };
  }

  return {
    tasks: nextTask === task ? s.tasks : s.tasks.map((t) => (t.id === task.id ? nextTask : t)),
    blocks,
    sessions,
  };
}

/** Delete a session and the block it produced, so the minutes disappear from every total. */
export function deleteSessionState(s: FocusSlice, sessionId: string): FocusSlice {
  const session = s.sessions.find((x) => x.id === sessionId);
  if (!session) return s;
  return {
    tasks: s.tasks,
    sessions: s.sessions.filter((x) => x.id !== sessionId),
    // Only the finished block it made; a still-planned commitment is never removed from here.
    blocks: s.blocks.filter((b) => b.id !== session.blockId || b.status === "planned"),
  };
}

/** Make a task "in progress" when a timer starts on it, unless it is done. */
export function markInProgress(tasks: Task[], taskId: string): Task[] {
  return tasks.map((t) =>
    t.id === taskId && t.status !== "done" && t.status !== "in_progress"
      ? { ...t, status: "in_progress" }
      : t,
  );
}
