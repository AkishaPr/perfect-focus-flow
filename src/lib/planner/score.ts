import { weekStart, ymd } from "../calendar";
import type { Goal, Settings, Task, Weights } from "../types";

export type FactorKey = keyof Weights;

export const FACTORS: FactorKey[] = ["deadline", "overdue", "importance", "weakTopic", "goal", "carryOver"];

export const FACTOR_LABEL: Record<FactorKey, string> = {
  deadline: "Deadline",
  overdue: "Overdue",
  importance: "Importance",
  weakTopic: "Weak topic",
  goal: "Weekly goal",
  carryOver: "Carry-over",
};

export interface Factor {
  /** Signal strength from 0 to 1. */
  raw: number;
  /** raw × weight. */
  points: number;
}

export interface ScoreBreakdown {
  /** Weighted sum of all factors. */
  total: number;
  /** Total rescaled to 0–100 against the sum of weights. */
  normalized: number;
  factors: Record<FactorKey, Factor>;
  daysLeft: number | null;
  daysOverdue: number;
  goal: Goal | null;
  weakMatch: boolean;
}

export interface ScoreContext {
  date: Date;
  settings: Settings;
  goals: Goal[];
  tasks: Task[];
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

const dayNumber = (key: string) => {
  const [y = 1970, m = 1, d = 1] = key.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};

/** Whole days from `from` to `to` (yyyy-MM-dd). Negative when `to` is earlier. */
export const daysBetween = (from: string, to: string) => dayNumber(to) - dayNumber(from);

const norm = (s: string) => s.trim().toLowerCase();

export function isWeakTopic(task: Task, settings: Settings) {
  const topic = norm(task.topic);
  return settings.weakTopics.some(
    (w) => w.subject === task.subject && (norm(w.topic) === "" || (topic !== "" && norm(w.topic) === topic)),
  );
}

/** Goal for the scored week that this task counts toward and that is not yet met. */
export function activeGoal(task: Task, ctx: ScoreContext): Goal | null {
  if (!task.goalId) return null;
  const goal = ctx.goals.find((g) => g.id === task.goalId);
  if (!goal || goal.weekStart !== ymd(weekStart(ctx.date))) return null;
  const done = ctx.tasks.filter((t) => t.goalId === goal.id && t.status === "done").length;
  return done < goal.target ? goal : null;
}

export function scoreTask(task: Task, ctx: ScoreContext): ScoreBreakdown {
  const today = ymd(ctx.date);
  const w = ctx.settings.weights;
  const daysLeft = task.deadline ? daysBetween(today, task.deadline) : null;
  const daysOverdue = daysLeft !== null && daysLeft < 0 ? -daysLeft : 0;

  // Urgency grows as the deadline nears and with the size of the job. Due today or overdue = 1.
  const deadline =
    daysLeft === null ? 0 : daysLeft <= 0 ? 1 : clamp01((1 + task.estimateMin / 120) / (daysLeft + 1));
  const overdue = clamp01(daysOverdue / 5);
  const importance = clamp01((task.importance - 1) / 4);
  const weakMatch = isWeakTopic(task, ctx.settings);
  const goal = activeGoal(task, ctx);
  const carryOver = clamp01(task.carryOverCount / 3);

  const raw: Record<FactorKey, number> = {
    deadline,
    overdue,
    importance,
    weakTopic: weakMatch ? 1 : 0,
    goal: goal ? 1 : 0,
    carryOver,
  };

  const factors = {} as Record<FactorKey, Factor>;
  let total = 0;
  let weightSum = 0;
  for (const k of FACTORS) {
    const weight = Math.max(0, w[k]);
    const points = raw[k] * weight;
    factors[k] = { raw: raw[k], points };
    total += points;
    weightSum += weight;
  }

  return {
    total,
    normalized: weightSum > 0 ? (total / weightSum) * 100 : 0,
    factors,
    daysLeft,
    daysOverdue,
    goal,
    weakMatch,
  };
}

export const isOpen = (t: Task) => t.status === "todo" || t.status === "in_progress" || t.status === "missed";

export interface RankedTask {
  task: Task;
  score: ScoreBreakdown;
  rank: number;
}

/** Open tasks by score; ties go to the earlier deadline (none sorts last), then id, so order is stable. */
export function rankTasks(tasks: Task[], ctx: ScoreContext): RankedTask[] {
  return tasks
    .filter(isOpen)
    .map((task) => ({ task, score: scoreTask(task, ctx) }))
    .sort(
      (a, b) =>
        b.score.total - a.score.total ||
        (a.task.deadline ?? "9999-99-99").localeCompare(b.task.deadline ?? "9999-99-99") ||
        a.task.id.localeCompare(b.task.id),
    )
    .map((r, i) => ({ ...r, rank: i + 1 }));
}
