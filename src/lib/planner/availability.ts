import { eventsOn, toMin, windowsOn, ymd } from "../calendar";
import type { CalEvent, StudyWindow } from "../types";

/** Minutes from local midnight, end exclusive. */
export interface Interval {
  start: number;
  end: number;
}
export interface Slot extends Interval {
  /** yyyy-MM-dd */
  date: string;
}

export interface AvailabilityOptions {
  onlineBufferMin: number;
  physicalBufferMin: number;
  minSlotMin: number;
  snapMin: number;
}

export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list
    .filter((i) => i.end > i.start)
    .map((i) => ({ ...i }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Interval[] = [];
  for (const cur of sorted) {
    const last = out[out.length - 1];
    if (last && cur.start <= last.end) last.end = Math.max(last.end, cur.end);
    else out.push(cur);
  }
  return out;
}

/** `base` minus `cuts`. Both may overlap internally; the result is sorted and disjoint. */
export function subtractIntervals(base: Interval[], cuts: Interval[]): Interval[] {
  const cutList = mergeIntervals(cuts);
  const out: Interval[] = [];
  for (const b of mergeIntervals(base)) {
    let cursor = b.start;
    for (const c of cutList) {
      if (c.end <= cursor) continue;
      if (c.start >= b.end) break;
      if (c.start > cursor) out.push({ start: cursor, end: c.start });
      cursor = Math.max(cursor, c.end);
      if (cursor >= b.end) break;
    }
    if (cursor < b.end) out.push({ start: cursor, end: b.end });
  }
  return out;
}

/** The time an event keeps clear: its own span plus a travel / log-on buffer on both sides. */
export function eventBlocker(e: CalEvent, o: AvailabilityOptions): Interval {
  const buf = e.mode === "physical" ? o.physicalBufferMin : o.onlineBufferMin;
  return { start: Math.max(0, toMin(e.start) - buf), end: Math.min(1440, toMin(e.end) + buf) };
}

/** Total study-window minutes on a date (overlapping windows counted once). */
export function windowMinutes(date: Date, windows: StudyWindow[]): number {
  return mergeIntervals(
    windowsOn(windows, date).map((w) => ({ start: toMin(w.start), end: toMin(w.end) })),
  ).reduce((sum, i) => sum + (i.end - i.start), 0);
}

/**
 * Free study slots for one day: study windows minus fixed events (with buffers), minus anything
 * already `occupied` (locked blocks), minus the past when the day is today. Starts snap up and
 * ends snap down to the grid; gaps shorter than `minSlotMin` are dropped.
 *
 * Classes, exams and other events are never scheduled over: that is the "protect fixed class
 * times" guarantee, and it lives here so no later stage can bypass it.
 */
export function buildDaySlots(args: {
  date: Date;
  windows: StudyWindow[];
  events: CalEvent[];
  occupied?: Interval[];
  now: Date;
  opts: AvailabilityOptions;
}): Slot[] {
  const { date, windows, events, occupied = [], now, opts } = args;
  const day = ymd(date);
  const base = windowsOn(windows, date).map((w) => ({ start: toMin(w.start), end: toMin(w.end) }));
  const cuts: Interval[] = [
    ...eventsOn(events, date).map((e) => eventBlocker(e, opts)),
    ...occupied,
  ];
  if (day === ymd(now)) {
    const nowMin = now.getHours() * 60 + now.getMinutes();
    cuts.push({ start: 0, end: nowMin });
  }
  const snap = opts.snapMin;
  return subtractIntervals(base, cuts)
    .map((i) => ({
      start: Math.ceil(i.start / snap) * snap,
      end: Math.floor(i.end / snap) * snap,
    }))
    .filter((i) => i.end - i.start >= opts.minSlotMin)
    .map((i) => ({ date: day, ...i }));
}
