import { isRealDate } from "./schema";
import { recentAverage, subjectWeakness } from "./planner/scoring";
import { SUBJECTS, type PaperMark, type Subject } from "./types";

/**
 * Paper-mark statistics for the Progress page (Stage 8). Pure: no React, no store, no clock.
 *
 * "Recent average" is the planner's own number (`recentAverage`), and `plannerBoost` reads the
 * planner's own weakness map, so what the page says about a subject is what the planner does.
 */

export const markPercent = (m: Pick<PaperMark, "score" | "max">): number =>
  m.max > 0 ? (m.score / m.max) * 100 : 0;

/** Oldest first; marks on the same day keep a stable order by id. */
export const oldestFirst = (a: PaperMark, z: PaperMark) =>
  a.date.localeCompare(z.date) || a.id.localeCompare(z.id);
export const newestFirst = (a: PaperMark, z: PaperMark) => oldestFirst(z, a);

export interface SubjectMarks {
  subject: Subject;
  count: number;
  latest: PaperMark | null;
  latestPct: number | null;
  /** Latest paper minus the one before it, in percentage points. Null with fewer than two. */
  change: number | null;
  /** Average % of the latest `RECENT_PAPERS` papers: the planner's number. Null with none. */
  recentAvg: number | null;
  bestPct: number | null;
  /** Points behind the strongest subject's recent average (0 for the strongest). Null unless at
   *  least two subjects have marks, which is also when the planner can compare them. */
  gapToBest: number | null;
  /** The planner is currently giving this subject's tasks extra priority because of its marks. */
  plannerBoost: boolean;
}

/** One entry per subject, including subjects with no marks yet. */
export function marksBySubject(marks: PaperMark[]): SubjectMarks[] {
  const weakness = subjectWeakness(marks);
  const withMarks = SUBJECTS.filter((s) => marks.some((m) => m.subject === s));
  const avgs = new Map<Subject, number>(
    withMarks.map((s) => [s, recentAverage(marks.filter((m) => m.subject === s))]),
  );
  const best = Math.max(...avgs.values());
  return SUBJECTS.map((subject): SubjectMarks => {
    const list = marks.filter((m) => m.subject === subject).sort(newestFirst);
    const [latest, previous] = list;
    return {
      subject,
      count: list.length,
      latest: latest ?? null,
      latestPct: latest ? markPercent(latest) : null,
      change: latest && previous ? markPercent(latest) - markPercent(previous) : null,
      recentAvg: avgs.get(subject) ?? null,
      bestPct: list.length ? Math.max(...list.map(markPercent)) : null,
      gapToBest: withMarks.length >= 2 && avgs.has(subject) ? best - avgs.get(subject)! : null,
      plannerBoost: (weakness.get(subject) ?? 0) > 0,
    };
  });
}

/** What's wrong with a mark being entered, or null if it can be saved. Numbers arrive parsed. */
export function markError(m: {
  paperName: string;
  date: string;
  score: number;
  max: number;
}): string | null {
  if (!m.paperName.trim()) return "Add the paper's name.";
  if (!isRealDate(m.date)) return "Pick the date you sat the paper.";
  if (!Number.isFinite(m.max) || m.max <= 0) return "Enter what the paper was marked out of.";
  if (!Number.isFinite(m.score)) return "Enter your score.";
  if (m.score < 0) return "Score can't be negative.";
  if (m.score > m.max) return "Score can't be more than the total.";
  return null;
}

// ---- trend chart geometry: plain numbers, so it can be tested without rendering ----

export interface ChartPoint {
  id: string;
  subject: Subject;
  /** 0 (earliest date) to 1 (latest). */
  x: number;
  /** 0 (bottom of the scale) to 1 (top). */
  y: number;
  pct: number;
  mark: PaperMark;
}

export interface ChartGeometry {
  /** The % scale shown, always inside 0–100 and at least 20 points tall. */
  domain: { min: number; max: number };
  ticks: number[];
  points: ChartPoint[];
}

const DAY_MS = 86_400_000;
const dayNumber = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);

export function chartGeometry(marks: PaperMark[]): ChartGeometry {
  const sorted = [...marks].sort(oldestFirst);
  const pcts = sorted.map(markPercent);
  const lo = pcts.length ? Math.min(...pcts) : 0;
  const hi = pcts.length ? Math.max(...pcts) : 100;
  let min = Math.max(0, Math.floor((lo - 10) / 10) * 10);
  let max = Math.min(100, Math.ceil((hi + 5) / 10) * 10);
  if (max - min < 20) {
    min = Math.max(0, max - 20);
    max = Math.min(100, min + 20);
  }
  const step = max - min <= 50 ? 10 : 20;
  // Line the scale up with the gridlines so the top and bottom edges are labelled. 0 and 100 are
  // multiples of both steps, so this never leaves 0–100.
  min = Math.floor(min / step) * step;
  max = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = min; t <= max; t += step) ticks.push(t);

  const first = sorted.length ? dayNumber(sorted[0]!.date) : 0;
  const last = sorted.length ? dayNumber(sorted[sorted.length - 1]!.date) : 0;
  const span = last - first;
  return {
    domain: { min, max },
    ticks,
    points: sorted.map((mark, i) => ({
      id: mark.id,
      subject: mark.subject,
      x: span === 0 ? 0.5 : (dayNumber(mark.date) - first) / span,
      y: (pcts[i]! - min) / (max - min),
      pct: pcts[i]!,
      mark,
    })),
  };
}

/**
 * Nudges label positions (top to bottom, in px) apart so labels that would land on the same spot
 * stay readable. Order is kept; each label moves as little as it can, within [lo, hi].
 */
export function spreadLabels(ys: number[], minGap: number, lo: number, hi: number): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y || a.i - b.i);
  const placed = order.map((o) => Math.min(hi, Math.max(lo, o.y)));
  for (let k = 1; k < placed.length; k++) {
    placed[k] = Math.max(placed[k]!, placed[k - 1]! + minGap);
  }
  // If pushing down ran past the bottom edge, pull the stack back up.
  for (let k = placed.length - 1; k >= 0; k--) {
    const limit = k === placed.length - 1 ? hi : placed[k + 1]! - minGap;
    placed[k] = Math.min(placed[k]!, limit);
  }
  const out = new Array<number>(ys.length);
  order.forEach((o, k) => {
    out[o.i] = placed[k]!;
  });
  return out;
}
