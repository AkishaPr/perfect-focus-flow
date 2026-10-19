import type { CalEvent, PlanBlock, StudyWindow } from "./types";

export const toMin = (t: string) => {
  const [h = 0, m = 0] = t.split(":").map(Number);
  return h * 60 + m;
};
export const fromMin = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Monday of the week containing d. */
export function weekStart(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - diff);
  return x;
}

export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Fixed events occurring on a date (one-time by date, weekly by weekday). */
export function eventsOn(events: CalEvent[], date: Date): CalEvent[] {
  const key = ymd(date);
  const wd = date.getDay();
  return events
    .filter((e) => (e.recurrence === "weekly" ? e.weekday === wd : e.date === key))
    .sort((a, b) => toMin(a.start) - toMin(b.start));
}

export const windowsOn = (windows: StudyWindow[], date: Date) =>
  windows.filter((w) => w.day === date.getDay());

export const blocksOn = (blocks: PlanBlock[], date: Date) =>
  blocks.filter((b) => b.date === ymd(date));

/** Ids of events that overlap another event on the same day. */
export function overlappingIds(evs: CalEvent[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < evs.length; i++)
    for (let j = i + 1; j < evs.length; j++) {
      const a = evs[i]!,
        b = evs[j]!;
      if (toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end)) {
        out.add(a.id);
        out.add(b.id);
      }
    }
  return out;
}

export interface EventSlot {
  /** Which column (0-based) the event sits in when overlapping events share the day. */
  col: number;
  /** How many columns its cluster of overlapping events needs. 1 means it has the day to itself. */
  cols: number;
}

/**
 * Side-by-side layout for events that overlap in time, so none is hidden behind another.
 * Events that chain together by overlap form a cluster; each cluster is split into as few
 * columns as it needs, and every event in it gets the same column count (equal widths).
 */
export function layoutOverlaps(evs: CalEvent[]): Map<string, EventSlot> {
  const out = new Map<string, EventSlot>();
  const sorted = [...evs].sort(
    (a, b) => toMin(a.start) - toMin(b.start) || toMin(a.end) - toMin(b.end),
  );
  let cluster: { ev: CalEvent; col: number }[] = [];
  let colEnds: number[] = [];
  let clusterEnd = -1;

  const flush = () => {
    for (const { ev, col } of cluster) out.set(ev.id, { col, cols: colEnds.length });
    cluster = [];
    colEnds = [];
    clusterEnd = -1;
  };

  for (const ev of sorted) {
    const start = toMin(ev.start);
    const end = Math.max(toMin(ev.end), start);
    if (cluster.length > 0 && start >= clusterEnd) flush();
    let col = colEnds.findIndex((e) => e <= start);
    if (col === -1) col = colEnds.length;
    colEnds[col] = end;
    cluster.push({ ev, col });
    clusterEnd = Math.max(clusterEnd, end);
  }
  flush();
  return out;
}
