import { weekStart, ymd } from "../calendar";
import { goalProgress } from "../goals";
import type { Goal, Settings, Task } from "../types";

export interface ScoreContext {
  /** The day being planned. */
  date: Date;
  settings: Settings;
  goals: Goal[];
  /** All tasks — needed to know whether a goal is already finished. */
  tasks: Task[];
}

export interface ScoreBreakdown {
  deadline: number;
  overdue: number;
  importance: number;
  weakTopic: number;
  goal: number;
  carryOver: number;
  /** Weighted total, 0–100. */
  total: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const DAY_MS = 86_400_000;

/** Whole days from `date` to the `deadline` day (negative when overdue). */
export function daysUntil(deadline: string, date: Date): number {
  const d = new Date(`${deadline}T00:00:00`);
  const from = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((d.getTime() - from.getTime()) / DAY_MS);
}

/** Tasks the planner may schedule. Done and deferred tasks are left alone. */
export const isOpen = (t: Task) =>
  t.status === "todo" || t.status === "in_progress" || t.status === "missed";

/**
 * Score a task 0–100. Each factor is normalised to 0–1, multiplied by its
 * weight from settings, and the sum is scaled so all weights together = 100.
 */
export function scoreTask(task: Task, ctx: ScoreContext): ScoreBreakdown {
  const { settings, date } = ctx;
  const days = task.deadline ? daysUntil(task.deadline, date) : null;

  // Deadline urgency: compare the days left with the days the work needs.
  let deadline = 0;
  if (days !== null) {
    if (days < 0) deadline = 1;
    else {
      const daysNeeded = task.estimateMin / Math.max(1, settings.maxDailyStudyMin);
      deadline = clamp01(1 - (days - daysNeeded) / 14);
    }
  }

  const overdue = days !== null && days < 0 ? clamp01(-days / 7) : 0;
  const importance = clamp01((task.importance - 1) / 4);

  const topic = task.topic.trim().toLowerCase();
  const weakTopic =
    topic &&
    settings.weakTopics.some(
      (w) => w.subject === task.subject && w.topic.trim().toLowerCase() === topic,
    )
      ? 1
      : 0;

  const thisWeek = ymd(weekStart(date));
  const g = task.goalId ? ctx.goals.find((x) => x.id === task.goalId) : undefined;
  const goal =
    g && g.weekStart === thisWeek && goalProgress(g, ctx.tasks).done < g.target ? 1 : 0;

  const carryOver = clamp01(task.carryOverCount / 5);

  const w = settings.weights;
  const weightSum =
    w.deadline + w.overdue + w.importance + w.weakTopic + w.goal + w.carryOver;
  const raw =
    deadline * w.deadline +
    overdue * w.overdue +
    importance * w.importance +
    weakTopic * w.weakTopic +
    goal * w.goal +
    carryOver * w.carryOver;
  const total = weightSum > 0 ? Math.round((raw / weightSum) * 1000) / 10 : 0;

  return { deadline, overdue, importance, weakTopic, goal, carryOver, total };
}

/** Deterministic order: score desc, then earlier deadline, then id. */
export function compareScored(
  a: { task: Task; score: ScoreBreakdown },
  b: { task: Task; score: ScoreBreakdown },
): number {
  if (b.score.total !== a.score.total) return b.score.total - a.score.total;
  const da = a.task.deadline ?? "9999-12-31";
  const db = b.task.deadline ?? "9999-12-31";
  if (da !== db) return da < db ? -1 : 1;
  return a.task.id < b.task.id ? -1 : a.task.id > b.task.id ? 1 : 0;
}
