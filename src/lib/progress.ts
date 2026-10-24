import { addDays, studyDayKey, studyDayStart, weekStart, ymd } from "./calendar";
import { goalProgress, type GoalProgress } from "./goals";
import { STUCK_CARRY_OVER } from "./planner/scoring";
import { studiedMinOn } from "./planner/studied";
import {
  SUBJECTS,
  TASK_TYPES,
  type Goal,
  type StoreData,
  type Subject,
  type Task,
  type TaskType,
} from "./types";

/**
 * Numbers for the Progress page (Stage 8). Pure: no React, no store, no clock. Weeks run Monday
 * to Sunday, like goals and the Week page, and every date is the user's local date.
 *
 * Study time only ever comes from `studiedMinOn` (see AGENTS.md): blocks and sessions are never
 * added up here, so a timed block can't be counted twice.
 */

export type SubjectMinutes = Record<Subject, number>;

const zeroSubjects = (): SubjectMinutes => ({ maths: 0, physics: 0, ict: 0 });
const sumSubjects = (m: SubjectMinutes) => m.maths + m.physics + m.ict;

export interface DayStudy {
  /** yyyy-MM-dd */
  date: string;
  totalMin: number;
  bySubject: SubjectMinutes;
  /** Time on tasks that no longer exist, so the subject can't be known. */
  otherMin: number;
  /** After today: nothing can have been studied yet. */
  isFuture: boolean;
}

export interface WeekStudy {
  /** The Monday, yyyy-MM-dd. */
  weekStart: string;
  /** Monday to Sunday. */
  days: DayStudy[];
  totalMin: number;
  bySubject: SubjectMinutes;
  otherMin: number;
  /** Days up to and including today (7 for a past week). */
  daysElapsed: number;
  /** Elapsed days with any study. */
  daysStudied: number;
  weeklyGoalMin: number;
  dailyGoalMin: number;
  /** Share of the weekly goal, uncapped (150 means 50% over). 0 if no goal is set. */
  goalPct: number;
}

type StudyData = Pick<StoreData, "tasks" | "blocks" | "sessions" | "settings">;

export function studyForWeek(data: StudyData, anchor: Date, now: Date): WeekStudy {
  const monday = weekStart(anchor);
  const today = studyDayKey(now);
  const subjectOf = new Map(data.tasks.map((t) => [t.id, t.subject]));
  // The same definition as everywhere else, restricted to one subject's blocks and sessions
  // (exactly how `studiedMinForTaskOn` restricts it to one task).
  const slices = SUBJECTS.map((subject) => ({
    subject,
    blocks: data.blocks.filter((b) => subjectOf.get(b.taskId) === subject),
    sessions: data.sessions.filter((s) => subjectOf.get(s.taskId) === subject),
  }));

  const days = Array.from({ length: 7 }, (_, i): DayStudy => {
    const date = ymd(addDays(monday, i));
    const isFuture = date > today;
    const bySubject = zeroSubjects();
    let totalMin = 0;
    if (!isFuture) {
      totalMin = studiedMinOn(date, data.blocks, data.sessions);
      for (const s of slices) bySubject[s.subject] = studiedMinOn(date, s.blocks, s.sessions);
    }
    // Whatever the subjects don't account for belongs to deleted tasks. Defined as the
    // remainder so the parts always add up to the total.
    return {
      date,
      totalMin,
      bySubject,
      otherMin: Math.max(0, totalMin - sumSubjects(bySubject)),
      isFuture,
    };
  });

  const bySubject = zeroSubjects();
  for (const d of days) for (const s of SUBJECTS) bySubject[s] += d.bySubject[s];
  const totalMin = days.reduce((sum, d) => sum + d.totalMin, 0);
  const elapsed = days.filter((d) => !d.isFuture);
  const goal = data.settings.weeklyGoalMin;
  return {
    weekStart: ymd(monday),
    days,
    totalMin,
    bySubject,
    otherMin: days.reduce((sum, d) => sum + d.otherMin, 0),
    daysElapsed: elapsed.length,
    daysStudied: elapsed.filter((d) => d.totalMin > 0).length,
    weeklyGoalMin: goal,
    dailyGoalMin: data.settings.dailyGoalMin,
    goalPct: goal > 0 ? Math.round((totalMin / goal) * 100) : 0,
  };
}

export interface WeekTotal {
  weekStart: string;
  totalMin: number;
}

/** Total minutes studied in each of the last `count` weeks, oldest first, ending with this week. */
export function weeklyTotals(
  data: Pick<StoreData, "blocks" | "sessions">,
  now: Date,
  count = 6,
): WeekTotal[] {
  const thisMonday = weekStart(studyDayStart(now));
  const today = studyDayKey(now);
  return Array.from({ length: count }, (_, i): WeekTotal => {
    const monday = addDays(thisMonday, -7 * (count - 1 - i));
    let totalMin = 0;
    for (let d = 0; d < 7; d++) {
      const date = ymd(addDays(monday, d));
      if (date <= today) totalMin += studiedMinOn(date, data.blocks, data.sessions);
    }
    return { weekStart: ymd(monday), totalMin };
  });
}

// ---- completed and missed work ----

export interface WorkWeek {
  weekStart: string;
  /** Tasks marked done during the week (by `completedAt`; tasks done before that was recorded
   *  have no date and can't be placed in a week). */
  done: number;
  /** Only task types with at least one, in `TASK_TYPES` order. */
  doneByType: { type: TaskType; count: number }[];
  /** Done tasks that had a deadline… */
  withDeadline: number;
  /** …and were finished on or before it. */
  onTime: number;
  /** Goals set for this week, with how far along they are. */
  goals: { goal: Goal; progress: GoalProgress }[];
  /** Pinned blocks whose time passed with nothing done on them, dated in this week. */
  missedBlocks: number;
  missedBlockMin: number;
}

type WorkData = Pick<StoreData, "tasks" | "goals" | "blocks">;

const minutesBetween = (start: string, end: string) => {
  const [sh = 0, sm = 0] = start.split(":").map(Number);
  const [eh = 0, em = 0] = end.split(":").map(Number);
  return Math.max(0, eh * 60 + em - (sh * 60 + sm));
};

export function workForWeek(data: WorkData, anchor: Date): WorkWeek {
  const monday = weekStart(anchor);
  const dates = new Set(Array.from({ length: 7 }, (_, i) => ymd(addDays(monday, i))));
  const completedOn = (t: Task): string | null => {
    if (t.status !== "done" || !t.completedAt) return null;
    const d = new Date(t.completedAt);
    return Number.isNaN(d.getTime()) ? null : ymd(d);
  };
  const doneTasks = data.tasks.filter((t) => {
    const day = completedOn(t);
    return day !== null && dates.has(day);
  });
  const withDeadline = doneTasks.filter((t) => t.deadline !== undefined);
  const missed = data.blocks.filter((b) => b.status === "missed" && dates.has(b.date));
  return {
    weekStart: ymd(monday),
    done: doneTasks.length,
    doneByType: TASK_TYPES.map((type) => ({
      type,
      count: doneTasks.filter((t) => t.type === type).length,
    })).filter((x) => x.count > 0),
    withDeadline: withDeadline.length,
    onTime: withDeadline.filter((t) => completedOn(t)! <= t.deadline!).length,
    goals: data.goals
      .filter((g) => g.weekStart === ymd(monday))
      .map((goal) => ({ goal, progress: goalProgress(goal, data.tasks) })),
    missedBlocks: missed.length,
    missedBlockMin: missed.reduce((sum, b) => sum + minutesBetween(b.start, b.end), 0),
  };
}

export interface Attention {
  /** Not done and not deferred. */
  open: number;
  /** Open with a deadline before today. */
  overdue: number;
  /** Carried over from a day it was planned but not done (status "missed"). */
  missed: number;
  /** Open and carried over at least `STUCK_CARRY_OVER` times. */
  stuck: number;
  deferred: number;
}

/** How things stand right now (not tied to a week). Uses the same "open" as the Today page. */
export function attentionNow(tasks: Task[], now: Date): Attention {
  const today = studyDayKey(now);
  const open = tasks.filter((t) => t.status !== "done" && t.status !== "deferred");
  return {
    open: open.length,
    overdue: open.filter((t) => t.deadline !== undefined && t.deadline < today).length,
    missed: tasks.filter((t) => t.status === "missed").length,
    stuck: open.filter((t) => t.carryOverCount >= STUCK_CARRY_OVER).length,
    deferred: tasks.filter((t) => t.status === "deferred").length,
  };
}
