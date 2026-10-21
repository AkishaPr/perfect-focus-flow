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

export interface XY {
  x: number;
  y: number;
}

/**
 * An SVG path through the points as a gentle curve (monotone cubic, Fritsch-Carlson). Unlike a
 * generic spline it never overshoots: between two marks the line stays between their heights, and
 * a high or low mark is a peak or valley with a flat tangent, so the curve can't suggest a score
 * that was never got. Points must be sorted by x; two points sharing an x are joined by a straight
 * step. The curve passes exactly through every point.
 */
export function smoothPath(points: XY[]): string {
  const n = points.length;
  if (n === 0) return "";
  const f = (v: number) => String(Math.round(v * 100) / 100);
  let d = `M${f(points[0]!.x)},${f(points[0]!.y)}`;
  if (n === 1) return d;

  // Slope of each segment (0 for a vertical step, which is drawn straight).
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const w = points[i + 1]!.x - points[i]!.x;
    dx.push(w);
    m.push(w > 0 ? (points[i + 1]!.y - points[i]!.y) / w : 0);
  }
  // Tangent at each point: the average of the slopes either side, or flat at a peak or valley.
  const t = new Array<number>(n);
  t[0] = m[0]!;
  t[n - 1] = m[n - 2]!;
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1]! * m[i]! <= 0 ? 0 : (m[i - 1]! + m[i]!) / 2;
  // Keep every tangent short enough that a segment never bulges past its own endpoints.
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i]! / m[i]!;
    const b = t[i + 1]! / m[i]!;
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      t[i] = k * a * m[i]!;
      t[i + 1] = k * b * m[i]!;
    }
  }

  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i]!;
    const p1 = points[i + 1]!;
    if (dx[i]! <= 0) {
      d += `L${f(p1.x)},${f(p1.y)}`;
      continue;
    }
    const h = dx[i]! / 3;
    d += `C${f(p0.x + h)},${f(p0.y + t[i]! * h)} ${f(p1.x - h)},${f(p1.y - t[i + 1]! * h)} ${f(p1.x)},${f(p1.y)}`;
  }
  return d;
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
