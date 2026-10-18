import { toMin } from "../calendar";
import type { PlanBlock, StoreData, Task } from "../types";
import { findMissedBlocks } from "./index";
import { STUCK_CARRY_OVER } from "./scoring";
import { studiedMinForTaskOn } from "./studied";
import type { PlanResult } from "./types";

/**
 * Missed-task recovery (Stage 7). Pure: no React, no store, no clock.
 *
 * The plan is derived, so by tomorrow nothing remembers what today's plan promised. A small
 * snapshot of each day's plan (`snapshotDay`) is kept so the next day can compare promise against
 * what was actually studied (`buildReview`) and ask the user what to do about the gap
 * (`resolveMissedState`). Carry-overs feed the planner's staleness boost and "stuck" warning.
 */

export interface PlanItem {
  taskId: string;
  /** Minutes the plan gave this task that day. */
  plannedMin: number;
}

export interface DayPlan {
  /** yyyy-MM-dd */
  date: string;
  items: PlanItem[];
}

/** A task counts as missed on a day when it got less than this share of its planned time. */
export const MISSED_BELOW = 0.5;

export interface MissedItem {
  task: Task;
  /** Days it was planned but not done, oldest first. */
  days: string[];
  plannedMin: number;
  studiedMin: number;
  /** One more carry-over would make this task "stuck". */
  stuck: boolean;
}

export interface Review {
  items: MissedItem[];
  /** Days before today that have a snapshot (reviewed or not): safe to clear once handled. */
  pastDates: string[];
}

export type RecoveryAction = "carry" | "skip" | "defer" | "done";

export interface Decision {
  taskId: string;
  action: RecoveryAction;
}

const lengthOf = (b: { start: string; end: string }) => toMin(b.end) - toMin(b.start);

/** What the plan promised for `date`, or null if it planned nothing. */
export function snapshotDay(plan: PlanResult, date: string): DayPlan | null {
  const byTask = new Map<string, number>();
  for (const b of plan.blocks) {
    if (b.date === date) byTask.set(b.taskId, (byTask.get(b.taskId) ?? 0) + lengthOf(b));
  }
  const items = [...byTask]
    .map(([taskId, plannedMin]) => ({ taskId, plannedMin }))
    .sort((a, z) => a.taskId.localeCompare(z.taskId));
  return items.length > 0 ? { date, items } : null;
}

/**
 * Tasks planned on an earlier day that got under half their planned time and aren't done or
 * deferred. A task missed on several days is listed once. Stuck-risk tasks sort first.
 */
export function buildReview(
  logs: DayPlan[],
  data: Pick<StoreData, "tasks" | "blocks" | "sessions">,
  today: string,
): Review {
  const tasksById = new Map(data.tasks.map((t) => [t.id, t]));
  const past = logs.filter((l) => l.date < today).sort((a, z) => a.date.localeCompare(z.date));
  const byTask = new Map<string, MissedItem>();

  for (const log of past) {
    for (const item of log.items) {
      const task = tasksById.get(item.taskId);
      if (!task || task.status === "done" || task.status === "deferred") continue;
      const studied = studiedMinForTaskOn(log.date, item.taskId, data.blocks, data.sessions);
      if (studied >= MISSED_BELOW * item.plannedMin) continue;
      const prev = byTask.get(task.id);
      byTask.set(task.id, {
        task,
        days: [...(prev?.days ?? []), log.date],
        plannedMin: (prev?.plannedMin ?? 0) + item.plannedMin,
        studiedMin: (prev?.studiedMin ?? 0) + studied,
        stuck: task.carryOverCount + 1 >= STUCK_CARRY_OVER,
      });
    }
  }

  const items = [...byTask.values()].sort(
    (a, z) =>
      Number(z.stuck) - Number(a.stuck) ||
      z.days.length - a.days.length ||
      z.plannedMin - z.studiedMin - (a.plannedMin - a.studiedMin) ||
      a.task.title.localeCompare(z.task.title) ||
      a.task.id.localeCompare(z.task.id),
  );
  return { items, pastDates: past.map((l) => l.date) };
}

type RecoveryState = Pick<StoreData, "tasks" | "blocks">;

/**
 * Apply the user's choices.
 *  - carry: one more carry-over (raises priority); a to-do task is flagged "missed".
 *  - skip:  no change, no penalty (e.g. they just edited the task).
 *  - defer: take it out of planning until they bring it back; drops its pinned blocks.
 *  - done:  they did it off the app; stamp it complete and drop its pinned blocks.
 */
export function applyRecovery(s: RecoveryState, decisions: Decision[], now: Date): RecoveryState {
  const action = new Map(decisions.map((d) => [d.taskId, d.action]));
  const clearPinned = new Set(
    decisions.filter((d) => d.action === "defer" || d.action === "done").map((d) => d.taskId),
  );
  return {
    tasks: s.tasks.map((t): Task => {
      switch (action.get(t.id)) {
        case "carry":
          return {
            ...t,
            carryOverCount: t.carryOverCount + 1,
            status: t.status === "todo" ? "missed" : t.status,
          };
        case "defer":
          return { ...t, status: "deferred" };
        case "done":
          return { ...t, status: "done", completedAt: now.toISOString() };
        default:
          return t;
      }
    }),
    blocks: s.blocks.filter((b) => !(b.status === "planned" && clearPinned.has(b.taskId))),
  };
}

/**
 * Pinned blocks whose time has passed with nothing in progress on them were never done: mark
 * them missed so they stop looking like live commitments. Unfinished in-progress work is left
 * alone: Today shows it as "past its planned time" and asks what to do.
 */
export function closeStaleBlocks(blocks: PlanBlock[], tasks: Task[], now: Date): PlanBlock[] {
  const status = new Map(tasks.map((t) => [t.id, t.status]));
  const stale = new Set(
    findMissedBlocks(blocks, now)
      .filter((b) => status.get(b.taskId) !== "in_progress")
      .map((b) => b.id),
  );
  return stale.size === 0
    ? blocks
    : blocks.map((b): PlanBlock => (stale.has(b.id) ? { ...b, status: "missed" } : b));
}

/** The store transition for resolving missed work: apply the choices, then close stale blocks. */
export function resolveMissedState(
  s: RecoveryState,
  decisions: Decision[],
  now: Date,
): RecoveryState {
  const next = applyRecovery(s, decisions, now);
  return { tasks: next.tasks, blocks: closeStaleBlocks(next.blocks, next.tasks, now) };
}
