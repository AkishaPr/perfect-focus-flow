import type { CalEvent, PlanBlock, StudyWindow } from "./types";

export const toMin = (t: string) => {
  const [h = 0, m = 0] = t.split(":").map(Number);
  return h * 60 + m;
};
export const fromMin = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * The study day ends at 03:00, not midnight: the time before then still belongs to the day before.
 * Everything that asks "what day is it?" or "what time is it?" for study purposes goes through the
 * four helpers below, so the app never rolls over to a new day while you are still working.
 */
export const STUDY_DAY_END_MIN = 3 * 60;
const DAY_MIN = 24 * 60;

/** The study day a moment belongs to, as "yyyy-MM-dd". */
export function studyDayKey(d: Date): string {
  const day = new Date(d);
  if (day.getHours() * 60 + day.getMinutes() < STUDY_DAY_END_MIN) day.setDate(day.getDate() - 1);
  return ymd(day);
}

/** Local midnight at the start of the study day a moment belongs to. */
export const studyDayStart = (d: Date): Date => new Date(`${studyDayKey(d)}T00:00:00`);

/** Minutes into the study day: 00:00-02:59 counts as 24:00-26:59, so it comes after the evening. */
export const studyMinute = (d: Date): number => {
  const m = d.getHours() * 60 + d.getMinutes();
  return m < STUDY_DAY_END_MIN ? m + DAY_MIN : m;
};

/** A stored "HH:MM" as a position in the study day (late-night times sort after the evening). */
export const dayMin = (t: string): number => {
  const m = toMin(t);
  return m < STUDY_DAY_END_MIN ? m + DAY_MIN : m;
};

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

/** Calendar span relative to the midnight on which an event starts. */
export function eventRange(e: CalEvent) {
  const start = toMin(e.start);
  const end = toMin(e.end);
  return { start, end: end < start ? end + DAY_MIN : end };
}

/** Occurrences near a date, including yesterday's overnight tail and tomorrow's buffers. */
export function eventOccurrences(events: CalEvent[], date: Date) {
  return [-1, 0, 1].flatMap((offset) =>
    eventsOn(events, addDays(date, offset)).map((event) => {
      const range = eventRange(event);
      return {
        event,
        start: range.start + offset * DAY_MIN,
        end: range.end + offset * DAY_MIN,
      };
    }),
  );
}

/** Project calendar events into a study-day column, without changing their saved dates. */
export function studyDayEvents(events: CalEvent[], date: Date) {
  return eventOccurrences(events, date)
    .filter((e) => e.start < DAY_MIN + STUDY_DAY_END_MIN && e.end > STUDY_DAY_END_MIN)
    .map(({ event, start, end }) => ({
      ...event,
      event,
      start: fromMin(Math.max(STUDY_DAY_END_MIN, start)),
      end: fromMin(Math.min(DAY_MIN + STUDY_DAY_END_MIN, end)),
    }));
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
      const ar = eventRange(a);
      const br = eventRange(b);
      if (ar.start < br.end && br.start < ar.end) {
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
    (a, b) => eventRange(a).start - eventRange(b).start || eventRange(a).end - eventRange(b).end,
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
    const { start, end } = eventRange(ev);
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
