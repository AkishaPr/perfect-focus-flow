/** Half-open minute interval [start, end) within a single day. */
export interface Interval {
  start: number;
  end: number;
}

export const length = (i: Interval) => i.end - i.start;

export const totalLength = (list: Interval[]) => list.reduce((sum, i) => sum + length(i), 0);

/** Sort, drop empty intervals and merge overlapping or touching ones. */
export function normalize(list: Interval[]): Interval[] {
  const sorted = list
    .filter((i) => i.end > i.start)
    .map((i) => ({ start: i.start, end: i.end }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Interval[] = [];
  for (const cur of sorted) {
    const last = out[out.length - 1];
    if (last && cur.start <= last.end) last.end = Math.max(last.end, cur.end);
    else out.push(cur);
  }
  return out;
}

export function intersect(a: Interval[], b: Interval[]): Interval[] {
  const A = normalize(a);
  const B = normalize(b);
  const out: Interval[] = [];
  let i = 0;
  let j = 0;
  while (i < A.length && j < B.length) {
    const x = A[i]!;
    const y = B[j]!;
    const start = Math.max(x.start, y.start);
    const end = Math.min(x.end, y.end);
    if (end > start) out.push({ start, end });
    if (x.end < y.end) i++;
    else j++;
  }
  return out;
}

export function subtract(base: Interval[], cuts: Interval[]): Interval[] {
  const C = normalize(cuts);
  const out: Interval[] = [];
  for (const b of normalize(base)) {
    let cursor = b.start;
    for (const c of C) {
      if (c.end <= cursor || c.start >= b.end) continue;
      if (c.start > cursor) out.push({ start: cursor, end: c.start });
      cursor = Math.max(cursor, c.end);
      if (cursor >= b.end) break;
    }
    if (cursor < b.end) out.push({ start: cursor, end: b.end });
  }
  return out;
}
