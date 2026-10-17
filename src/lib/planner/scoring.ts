import { addDays } from "../calendar";
import { goalProgress } from "../goals";
import type { Goal, PaperMark, Session, Settings, Subject, Task } from "../types";
import { clamp01, daysBetween, parseYmd, startOfDay, ymd } from "./dates";
import type { FactorKey, Factors, ScoreBreakdown } from "./types";

export const FACTOR_KEYS: FactorKey[] = [
  "deadline",
  "overdue",
  "importance",
  "weakTopic",
  "goal",
  "carryOver",
];

/** A task is "stuck" once it has been carried over this many times. */
export const STUCK_CARRY_OVER = 3;
/** Percentage-point gap to the strongest subject that counts as "fully weak". */
const WEAK_SUBJECT_GAP = 30;
/** A weak *subject* (from marks) counts for this much of a weak *topic* (named by the user). */
const SUBJECT_WEAKNESS_SHARE = 0.6;

export interface ScoringContext {
  today: Date;
  weights: Settings["weights"];
  weakTopics: Settings["weakTopics"];
  /** goalId -> share of this week's goal still to do (0–1). Only goals active this week. */
  goalNeed: Map<string, number>;
  /** subject -> 0–1, from recent marks. Missing when there isn't enough data. */
  subjectWeakness: Map<Subject, number>;
}

/** Minutes already studied on a task, from logged sessions. */
export const spentMin = (task: Pick<Task, "id">, sessions: Session[]) =>
  sessions.filter((s) => s.taskId === task.id).reduce((sum, s) => sum + s.actualMin, 0);

/** Work left on a task. Whole minutes, never negative. */
export const remainingMin = (task: Pick<Task, "id" | "estimateMin">, sessions: Session[]) =>
  Math.max(0, Math.ceil(task.estimateMin - spentMin(task, sessions)));

/**
 * Per-subject weakness from marks: average % of the last three papers, compared with the
 * strongest subject. A gap of 30+ points is 1. Needs marks in at least two subjects, otherwise
 * there's nothing to compare and the map is empty.
 */
export function subjectWeakness(marks: PaperMark[]): Map<Subject, number> {
  const bySubject = new Map<Subject, PaperMark[]>();
  for (const m of marks) bySubject.set(m.subject, [...(bySubject.get(m.subject) ?? []), m]);
  if (bySubject.size < 2) return new Map();
  const avg = new Map<Subject, number>();
  for (const [subject, list] of bySubject) {
    const recent = [...list]
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
      .slice(0, 3);
    avg.set(subject, recent.reduce((s, m) => s + (m.score / m.max) * 100, 0) / recent.length);
  }
  const best = Math.max(...avg.values());
  const out = new Map<Subject, number>();
  for (const [subject, a] of avg) out.set(subject, clamp01((best - a) / WEAK_SUBJECT_GAP));
  return out;
}

export function buildScoringContext(args: {
  now: Date;
  settings: Settings;
  tasks: Task[];
  goals: Goal[];
  marks: PaperMark[];
}): ScoringContext {
  const today = startOfDay(args.now);
  const todayStr = ymd(today);
  const goalNeed = new Map<string, number>();
  for (const g of args.goals) {
    const weekEnd = ymd(addDays(parseYmd(g.weekStart), 6));
    if (g.weekStart > todayStr || weekEnd < todayStr) continue;
    const p = goalProgress(g, args.tasks);
    goalNeed.set(g.id, clamp01((g.target - p.done) / g.target));
  }
  return {
    today,
    weights: args.settings.weights,
    weakTopics: args.settings.weakTopics,
    goalNeed,
    subjectWeakness: subjectWeakness(args.marks),
  };
}

const norm = (s: string) => s.trim().toLowerCase();

/** True when the user has flagged this task's topic as weak in Settings. */
export const isWeakTopic = (task: Task, ctx: Pick<ScoringContext, "weakTopics">) =>
  norm(task.topic) !== "" &&
  ctx.weakTopics.some((w) => w.subject === task.subject && norm(w.topic) === norm(task.topic));

/**
 * Score one task, 0–100, as the weighted mean of six 0–1 factors using `settings.weights`.
 *
 * `capacityLeftMin` is the free study time left between now and the task's deadline. The
 * deadline factor is slack-based, 1 / (capacity ÷ work left), so "3h left and 3h free" is as
 * urgent as it gets. It looks at each task alone: it doesn't know other tasks are competing
 * for the same free time.
 */
export function scoreTask(
  task: Task,
  remaining: number,
  capacityLeftMin: number,
  ctx: ScoringContext,
): ScoreBreakdown {
  const f: Factors = {
    deadline: 0,
    overdue: 0,
    importance: clamp01((task.importance - 1) / 4),
    weakTopic: 0,
    goal: 0,
    carryOver: clamp01(task.carryOverCount / STUCK_CARRY_OVER),
  };

  if (task.deadline) {
    const daysLeft = daysBetween(ctx.today, parseYmd(task.deadline));
    if (daysLeft < 0) {
      f.overdue = clamp01(0.5 + 0.1 * -daysLeft);
      f.deadline = 1;
    } else {
      const ratio = capacityLeftMin / Math.max(remaining, 1);
      f.deadline = ratio <= 1 ? 1 : clamp01(1 / ratio);
    }
  }

  const subjectWeak = ctx.subjectWeakness.get(task.subject) ?? 0;
  f.weakTopic = Math.max(isWeakTopic(task, ctx) ? 1 : 0, SUBJECT_WEAKNESS_SHARE * subjectWeak);
  if (task.goalId) f.goal = ctx.goalNeed.get(task.goalId) ?? 0;

  const total = FACTOR_KEYS.reduce((s, k) => s + ctx.weights[k], 0);
  const score =
    total > 0 ? (FACTOR_KEYS.reduce((s, k) => s + ctx.weights[k] * f[k], 0) / total) * 100 : 0;
  return { score, factors: f };
}
