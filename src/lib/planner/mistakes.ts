import { addDays, studyDayStart } from "../calendar";
import { isRealDate } from "../schema";
import type { Mistake, Settings, Subject } from "../types";
import { SUBJECTS } from "../types";
import { ymd } from "./dates";

/**
 * Turns the mistake log into weak topics (Upgrade 2). Pure: no React, no store, no clock; `now`
 * is always passed in.
 *
 * What counts as a weak topic: in the last `MISTAKE_WINDOW_DAYS` days, a topic where at least
 * `MIN_MARKS_LOST` marks went to *concept* gaps or *time pressure*. Careless slips are left out on
 * purpose: they are a checking habit, not a hole in a topic, so boosting the topic would not help.
 * Each subject contributes at most `TOPICS_PER_SUBJECT`, worst first, so one bad subject cannot
 * crowd the others out.
 */

export const MISTAKE_WINDOW_DAYS = 28;
export const MIN_MARKS_LOST = 3;
export const TOPICS_PER_SUBJECT = 3;

type WeakTopic = Settings["weakTopics"][number];

/** How topics are compared everywhere (planner scoring included): trimmed, case-insensitive. */
export const normTopic = (s: string) => s.trim().toLowerCase();

export interface TopicLoss {
  subject: Subject;
  /** The spelling from the most recent entry, so the list reads the way the user typed it. */
  topic: string;
  marksLost: number;
  count: number;
}

/** First day (inclusive) of the window that ends on the study day containing `now`. */
export const windowStart = (now: Date) =>
  ymd(addDays(studyDayStart(now), -(MISTAKE_WINDOW_DAYS - 1)));

/** Mistakes inside the recent window, newest first. */
export function recentMistakes(mistakes: Mistake[], now: Date): Mistake[] {
  const from = windowStart(now);
  return mistakes
    .filter((m) => m.date >= from)
    .sort((a, z) => z.date.localeCompare(a.date) || z.id.localeCompare(a.id));
}

/**
 * Marks lost per (subject, topic) in the recent window, worst first. `causes` limits which kinds of
 * mistake are counted (all of them by default, which is what the Progress page shows).
 */
export function topicLosses(
  mistakes: Mistake[],
  now: Date,
  causes?: ReadonlySet<Mistake["cause"]>,
): TopicLoss[] {
  const byKey = new Map<string, TopicLoss>();
  // Newest first, so the first entry seen for a topic supplies its display spelling.
  for (const m of recentMistakes(mistakes, now)) {
    if (causes && !causes.has(m.cause)) continue;
    const key = `${m.subject}\u0000${normTopic(m.topic)}`;
    const seen = byKey.get(key);
    if (seen) {
      seen.marksLost += m.marksLost;
      seen.count += 1;
    } else {
      byKey.set(key, {
        subject: m.subject,
        topic: m.topic.trim(),
        marksLost: m.marksLost,
        count: 1,
      });
    }
  }
  return [...byKey.values()].sort(
    (a, z) => z.marksLost - a.marksLost || a.topic.localeCompare(z.topic),
  );
}

const WEAK_CAUSES: ReadonlySet<Mistake["cause"]> = new Set(["concept", "time"]);

/** The topics the planner should treat as weak because of the mistake log. */
export function autoWeakTopics(mistakes: Mistake[], now: Date): WeakTopic[] {
  const losses = topicLosses(mistakes, now, WEAK_CAUSES).filter(
    (t) => t.marksLost >= MIN_MARKS_LOST,
  );
  return SUBJECTS.flatMap((subject) =>
    losses
      .filter((t) => t.subject === subject)
      .slice(0, TOPICS_PER_SUBJECT)
      .map((t) => ({ subject: t.subject, topic: t.topic })),
  );
}

/** Topics named in Settings plus the ones found from mistakes, without repeats. */
export function mergeWeakTopics(manual: WeakTopic[], auto: WeakTopic[]): WeakTopic[] {
  const seen = new Set<string>();
  return [...manual, ...auto].filter((t) => {
    const key = `${t.subject}\u0000${normTopic(t.topic)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** What's wrong with a mistake being entered, or null if it can be saved. Numbers arrive parsed. */
export function mistakeError(m: { topic: string; date: string; marksLost: number }): string | null {
  if (!m.topic.trim()) return "Add the topic the question was about.";
  if (!isRealDate(m.date)) return "Pick the date you sat the paper.";
  if (!Number.isFinite(m.marksLost)) return "Enter how many marks you lost.";
  if (m.marksLost <= 0) return "Marks lost must be more than zero.";
  return null;
}
