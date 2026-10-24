import { studyDayKey } from "@/lib/calendar";
import { studyForWeek } from "@/lib/progress";

/**
 * Goal milestones: the moment study time crosses the daily or weekly goal. Pure, so the rules are
 * testable without rendering anything. Study minutes come from `studyForWeek`, which in turn uses
 * `studiedMinOn`, the one definition of "minutes studied": never add blocks and sessions here.
 */

export type Milestone = "daily" | "weekly";

export interface GoalSnapshot {
  /** yyyy-MM-dd of the day measured. */
  dayKey: string;
  /** The Monday of the week measured, yyyy-MM-dd. */
  weekKey: string;
  dayMin: number;
  weekMin: number;
  dailyGoalMin: number;
  weeklyGoalMin: number;
}

export function goalSnapshot(data: Parameters<typeof studyForWeek>[0], now: Date): GoalSnapshot {
  const week = studyForWeek(data, now, now);
  const dayKey = studyDayKey(now);
  return {
    dayKey,
    weekKey: week.weekStart,
    dayMin: week.days.find((d) => d.date === dayKey)?.totalMin ?? 0,
    weekMin: week.totalMin,
    dailyGoalMin: week.dailyGoalMin,
    weeklyGoalMin: week.weeklyGoalMin,
  };
}

/**
 * One action (saving a session, finishing a block) adds minutes, not days. A jump bigger than this
 * means the data was replaced wholesale (a restored backup, an import), which isn't an achievement.
 */
export const BULK_JUMP_MIN = 8 * 60;

/**
 * The milestone reached between two snapshots, if any. At most one: when a single change crosses
 * both goals, the weekly one wins because it is the bigger moment and includes the daily one.
 *
 * A milestone needs a real crossing (below the goal, then at or above it), under the same goal,
 * in the same day or week, and it fires once per day or week (`fired` holds the keys already used).
 * The first snapshot after the app opens has nothing to compare with, so opening the app on a day
 * you already hit your goal doesn't celebrate again.
 */
export function newMilestone(
  prev: GoalSnapshot | null,
  next: GoalSnapshot,
  fired: ReadonlySet<string>,
): { kind: Milestone; key: string } | null {
  if (!prev || prev.weekKey !== next.weekKey) return null;
  if (next.weekMin - prev.weekMin > BULK_JUMP_MIN) return null;

  const weeklyKey = `weekly:${next.weekKey}`;
  const weeklyGoal = next.weeklyGoalMin;
  if (
    weeklyGoal > 0 &&
    prev.weeklyGoalMin === weeklyGoal &&
    prev.weekMin < weeklyGoal &&
    next.weekMin >= weeklyGoal &&
    !fired.has(weeklyKey)
  ) {
    return { kind: "weekly", key: weeklyKey };
  }

  const dailyKey = `daily:${next.dayKey}`;
  const dailyGoal = next.dailyGoalMin;
  if (
    dailyGoal > 0 &&
    prev.dayKey === next.dayKey &&
    prev.dailyGoalMin === dailyGoal &&
    prev.dayMin < dailyGoal &&
    next.dayMin >= dailyGoal &&
    !fired.has(dailyKey)
  ) {
    return { kind: "daily", key: dailyKey };
  }
  return null;
}
