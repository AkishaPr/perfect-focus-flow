import { blocksOn, eventsOn, toMin, windowsOn } from "../calendar";
import type { CalEvent, PlanBlock, Settings } from "../types";
import { intersect, normalize, subtract, type Interval } from "./intervals";

export const DAY_MIN = 24 * 60;
export const DEFAULT_BUFFER_MIN = 10;

export interface WindowOptions {
  /** Minutes kept clear before and after every fixed event. */
  bufferMin?: number | undefined;
  /** Minutes since midnight; time before this is no longer available. */
  nowMin?: number | undefined;
  /** Free gaps shorter than this are discarded as unusable. */
  minUsableMin?: number | undefined;
}

/** Awake span for a day. A sleep time at or before wake means sleeping after midnight. */
export function awakeSpan(s: Settings): Interval {
  const start = toMin(s.wake);
  const end = toMin(s.sleep);
  return { start, end: end > start ? end : DAY_MIN };
}

/** Study windows for the date. Windows crossing midnight are not supported in V1, so they are dropped. */
export function studyIntervals(s: Settings, date: Date): Interval[] {
  return normalize(
    windowsOn(s.studyWindows, date)
      .map((w) => ({ start: toMin(w.start), end: toMin(w.end) }))
      .filter((w) => w.end > w.start),
  );
}

export function busyIntervals(events: CalEvent[], date: Date, bufferMin = DEFAULT_BUFFER_MIN): Interval[] {
  return normalize(
    eventsOn(events, date).map((e) => ({
      start: Math.max(0, toMin(e.start) - bufferMin),
      end: Math.min(DAY_MIN, toMin(e.end) + bufferMin),
    })),
  );
}

/** Blocks that already happened and therefore occupy their time for good. */
export function lockedIntervals(blocks: PlanBlock[], date: Date): Interval[] {
  return normalize(
    blocksOn(blocks, date)
      .filter((b) => b.status === "done" || b.status === "partial")
      .map((b) => ({ start: toMin(b.start), end: toMin(b.end) })),
  );
}

/**
 * Free time for a date: study windows within wake and sleep, minus fixed events (with a buffer),
 * minus blocks already done, minus time that has passed.
 */
export function freeWindows(
  date: Date,
  settings: Settings,
  events: CalEvent[],
  blocks: PlanBlock[],
  opts: WindowOptions = {},
): Interval[] {
  const { bufferMin = DEFAULT_BUFFER_MIN, nowMin, minUsableMin = 10 } = opts;
  let free = intersect(studyIntervals(settings, date), [awakeSpan(settings)]);
  free = subtract(free, busyIntervals(events, date, bufferMin));
  free = subtract(free, lockedIntervals(blocks, date));
  if (nowMin !== undefined) free = subtract(free, [{ start: 0, end: Math.ceil(nowMin) }]);
  return free.filter((i) => i.end - i.start >= minUsableMin);
}
