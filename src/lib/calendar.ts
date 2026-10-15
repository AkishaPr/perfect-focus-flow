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

export const blocksOn = (blocks: PlanBlock[], date: Date) => blocks.filter((b) => b.date === ymd(date));

/** Ids of events that overlap another event on the same day. */
export function overlappingIds(evs: CalEvent[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < evs.length; i++)
    for (let j = i + 1; j < evs.length; j++) {
      const a = evs[i]!, b = evs[j]!;
      if (toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end)) {
        out.add(a.id);
        out.add(b.id);
      }
    }
  return out;
}
