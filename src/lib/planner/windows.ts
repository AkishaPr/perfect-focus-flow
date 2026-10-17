import { blocksOn, eventsOn, toMin, windowsOn } from "../calendar";
import type { CalEvent, PlanBlock, Settings } from "../types";

/** A half-open interval of minutes since midnight: [start, end). */
export interface Interval {
  start: number;
  end: number;
}

/** Minutes kept free around every fixed event (travel, getting ready). */
export const EVENT_BUFFER_MIN = 10;

/** Merge overlapping or touching intervals; drops empty ones. */
export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

/** `base` minus every interval in `cut`. */
export function subtractIntervals(base: Interval[], cut: Interval[]): Interval[] {
  const cuts = mergeIntervals(cut);
  let out = mergeIntervals(base);
  for (const c of cuts) {
    out = out.flatMap((b) => {
      if (c.end <= b.start || c.start >= b.end) return [b];
      const parts: Interval[] = [];
      if (c.start > b.start) parts.push({ start: b.start, end: c.start });
      if (c.end < b.end) parts.push({ start: c.end, end: b.end });
      return parts;
    });
  }
  return out;
}

export interface FreeWindowOptions {
  /** Ignore time before this minute of the day (used when planning "from now"). */
  fromMin?: number;
  bufferMin?: number;
}

/**
 * Free study time on a date = study windows ∩ [wake, sleep]
 * − fixed events (± buffer) − blocks already done or partly done.
 * Windows that cross midnight (end ≤ start) are ignored, as in V1.
 */
export function freeWindows(
  date: Date,
  settings: Settings,
  events: CalEvent[],
  blocks: PlanBlock[],
  opts: FreeWindowOptions = {},
): Interval[] {
  const buffer = opts.bufferMin ?? EVENT_BUFFER_MIN;
  const wake = toMin(settings.wake);
  const sleep = toMin(settings.sleep);
  const lower = Math.max(wake, opts.fromMin ?? 0);

  const study = windowsOn(settings.studyWindows, date)
    .map((w) => ({ start: toMin(w.start), end: toMin(w.end) }))
    .filter((w) => w.end > w.start)
    .map((w) => ({ start: Math.max(w.start, lower), end: Math.min(w.end, sleep) }));

  const busy: Interval[] = [
    ...eventsOn(events, date).map((e) => ({
      start: toMin(e.start) - buffer,
      end: toMin(e.end) + buffer,
    })),
    ...blocksOn(blocks, date)
      .filter((b) => b.status === "done" || b.status === "partial")
      .map((b) => ({ start: toMin(b.start), end: toMin(b.end) })),
  ];

  return subtractIntervals(study, busy);
}
