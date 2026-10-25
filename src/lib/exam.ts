import { studyDayStart } from "./calendar";
import { daysBetween, parseYmd } from "./planner/dates";
import { recentAverage } from "./planner/scoring";
import { SUBJECTS, type PaperMark, type Settings, type Subject } from "./types";

/**
 * Exam countdown and gap-to-target maths (Upgrade 1). Pure: no React, no store, no clock.
 *
 * "Where you are" is the planner's own `recentAverage`, never a second definition, so the Progress
 * page, the planner and this module always agree about a subject's current level.
 */

const DAYS_PER_MONTH = 30.44;

export interface Countdown {
  /** Whole days from today (the study day) to the exam date. Zero on the day, negative after. */
  days: number;
  /** Whole weeks left, rounded down. Zero once under a week away or after the date. */
  weeks: number;
  status: "upcoming" | "today" | "started";
}

export function examCountdown(now: Date, examDate: string): Countdown {
  const days = daysBetween(studyDayStart(now), parseYmd(examDate));
  return {
    days,
    weeks: Math.max(0, Math.floor(days / 7)),
    status: days > 0 ? "upcoming" : days === 0 ? "today" : "started",
  };
}

export interface SubjectTarget {
  subject: Subject;
  /** The mark being aimed for, as a percentage. */
  target: number;
  /** Average % of the latest papers (the planner's number), or null with no marks yet. */
  current: number | null;
  /** Points still to gain: target minus current, never below zero. Null with no marks. */
  gap: number | null;
  /** Points to gain each month to reach the target by exam day. Null with no marks, or once the
   *  exam date has arrived or passed; zero when the target is already met. */
  perMonth: number | null;
}

/** One entry per subject, including subjects with no marks yet. */
export function subjectTargets(
  marks: PaperMark[],
  targets: Settings["targets"],
  now: Date,
  examDate: string,
): SubjectTarget[] {
  const { days } = examCountdown(now, examDate);
  const months = days / DAYS_PER_MONTH;
  return SUBJECTS.map((subject): SubjectTarget => {
    const list = marks.filter((m) => m.subject === subject);
    const target = targets[subject];
    if (list.length === 0) return { subject, target, current: null, gap: null, perMonth: null };
    const current = recentAverage(list);
    const gap = Math.max(0, target - current);
    const perMonth = gap === 0 ? 0 : months > 0 ? gap / months : null;
    return { subject, target, current, gap, perMonth };
  });
}
