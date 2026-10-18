import { eventsOn, toMin, ymd } from "../calendar";
import type { CalEvent, PlanBlock, StoreData, Task } from "../types";
import { startOfDay } from "./dates";
import { generatePlan } from "./index";
import type {
  PlanResult,
  PlannerOptions,
  PlannerWarning,
  ScheduledBlock,
  UnscheduledTask,
} from "./types";

/** Everything the Today page needs, derived from store data and the clock. No React. */
export type TodayData = Pick<
  StoreData,
  "settings" | "events" | "tasks" | "goals" | "blocks" | "sessions" | "marks"
>;

export type BlockState = "planned" | "active" | "pinned";

export type TimelineEntry =
  | { kind: "event"; key: string; start: string; end: string; event: CalEvent }
  | {
      kind: "block";
      key: string;
      start: string;
      end: string;
      state: BlockState;
      block: PlanBlock;
      task: Task | undefined;
      reasons: string[];
    }
  | {
      kind: "done";
      key: string;
      start: string;
      end: string;
      block: PlanBlock;
      task: Task | undefined;
    };

export interface ActiveWork {
  block: PlanBlock;
  task: Task;
  /** Past its planned end (or from an earlier day) and still marked in progress. */
  overrun: boolean;
}

export interface NextUp {
  block: ScheduledBlock;
  task: Task;
  /** The block is today, so it can be started. */
  isToday: boolean;
  /** Minutes until it starts, today only (0 when it's already time). */
  startsInMin: number | null;
}

export interface TodayStats {
  /** Study still planned for the rest of today. */
  plannedMin: number;
  /** Study finished today, from completed blocks. */
  doneMin: number;
  dailyGoalMin: number;
  dueToday: number;
  overdue: number;
}

export interface TodayView {
  date: string;
  plan: PlanResult;
  active: ActiveWork | null;
  next: NextUp | null;
  timeline: TimelineEntry[];
  stats: TodayStats;
  warnings: PlannerWarning[];
  /** Tasks that didn't fit before their deadline or in the planning window. */
  didNotFit: UnscheduledTask[];
}

const length = (b: { start: string; end: string }) => toMin(b.end) - toMin(b.start);
const KIND_ORDER = { event: 0, block: 1, done: 2 } as const;

/**
 * Build the Today view. Blocks saved in the store with status "planned" are things the user
 * committed to ("Start"), so they are passed to the planner as locked and it plans around them.
 */
export function buildToday(data: TodayData, now: Date, options: PlannerOptions = {}): TodayView {
  const todayStr = ymd(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const tasksById = new Map(data.tasks.map((t) => [t.id, t]));

  const committed = data.blocks.filter((b) => b.status === "planned");
  const plan = generatePlan({
    ...data,
    now,
    options: {
      ...options,
      lockedBlockIds: [...(options.lockedBlockIds ?? []), ...committed.map((b) => b.id)],
    },
  });

  // The block being worked on: a committed block whose task is in progress. It can outlive its
  // planned time (the planner drops past blocks), so it is read from the store, not the plan.
  const activeBlock = committed
    .filter((b) => b.date <= todayStr && tasksById.get(b.taskId)?.status === "in_progress")
    .sort((a, z) => z.date.localeCompare(a.date) || z.start.localeCompare(a.start))[0];
  const activeTask = activeBlock ? tasksById.get(activeBlock.taskId) : undefined;
  const active: ActiveWork | null =
    activeBlock && activeTask
      ? {
          block: activeBlock,
          task: activeTask,
          overrun: activeBlock.date < todayStr || toMin(activeBlock.end) <= nowMin,
        }
      : null;

  const nextBlock = plan.blocks.find((b) => !b.locked);
  const nextTask = nextBlock ? tasksById.get(nextBlock.taskId) : undefined;
  const next: NextUp | null =
    nextBlock && nextTask
      ? {
          block: nextBlock,
          task: nextTask,
          isToday: nextBlock.date === todayStr,
          startsInMin:
            nextBlock.date === todayStr ? Math.max(0, toMin(nextBlock.start) - nowMin) : null,
        }
      : null;

  // ---- today's timeline: classes, finished work, active work, and what's planned ----
  const timeline: TimelineEntry[] = [];
  for (const e of eventsOn(data.events, startOfDay(now))) {
    timeline.push({ kind: "event", key: `event:${e.id}`, start: e.start, end: e.end, event: e });
  }
  const doneToday = data.blocks.filter(
    (b) => b.date === todayStr && (b.status === "done" || b.status === "partial"),
  );
  for (const b of doneToday) {
    timeline.push({
      kind: "done",
      key: `done:${b.id}`,
      start: b.start,
      end: b.end,
      block: b,
      task: tasksById.get(b.taskId),
    });
  }
  const inPlan = new Set<string>();
  for (const b of plan.blocks) {
    if (b.date !== todayStr) continue;
    inPlan.add(b.id);
    const isActive = active?.block.id === b.id;
    timeline.push({
      kind: "block",
      key: `block:${b.id}`,
      start: b.start,
      end: b.end,
      state: isActive ? "active" : b.locked ? "pinned" : "planned",
      block: b,
      task: tasksById.get(b.taskId),
      reasons: b.reasons,
    });
  }
  if (active && active.block.date === todayStr && !inPlan.has(active.block.id)) {
    timeline.push({
      kind: "block",
      key: `block:${active.block.id}`,
      start: active.block.start,
      end: active.block.end,
      state: "active",
      block: active.block,
      task: active.task,
      reasons: [],
    });
  }
  timeline.sort(
    (a, z) =>
      a.start.localeCompare(z.start) ||
      KIND_ORDER[a.kind] - KIND_ORDER[z.kind] ||
      a.key.localeCompare(z.key),
  );

  // ---- numbers ----
  const open = data.tasks.filter((t) => t.status !== "done" && t.status !== "deferred");
  const stats: TodayStats = {
    plannedMin: plan.capacity[0]?.plannedMin ?? 0,
    doneMin: doneToday.reduce((s, b) => s + length(b), 0),
    dailyGoalMin: data.settings.dailyGoalMin,
    dueToday: open.filter((t) => t.deadline === todayStr).length,
    overdue: open.filter((t) => t.deadline !== undefined && t.deadline < todayStr).length,
  };

  return {
    date: todayStr,
    plan,
    active,
    next,
    timeline,
    stats,
    warnings: plan.warnings,
    didNotFit: plan.unscheduled.filter(
      (u) =>
        u.reason === "deadline-at-risk" ||
        u.reason === "not-enough-time" ||
        u.reason === "too-long-for-any-slot",
    ),
  };
}
