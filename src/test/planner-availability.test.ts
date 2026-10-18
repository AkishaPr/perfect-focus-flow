import { describe, expect, it } from "vitest";
import {
  buildDaySlots,
  mergeIntervals,
  subtractIntervals,
  windowMinutes,
} from "@/lib/planner/availability";
import { at, dailyWindow, makeEvent, MON_9AM } from "./planner-fixtures";

const OPTS = { onlineBufferMin: 5, physicalBufferMin: 30, minSlotMin: 20, snapMin: 5 };
const mins = (h: number, m = 0) => h * 60 + m;
const slotsFor = (over: Partial<Parameters<typeof buildDaySlots>[0]> = {}) =>
  buildDaySlots({
    date: new Date(2026, 9, 19),
    windows: dailyWindow("16:00", "21:00"),
    events: [],
    now: MON_9AM,
    opts: OPTS,
    ...over,
  });

describe("interval helpers", () => {
  it("merges overlapping and touching intervals and drops empty ones", () => {
    expect(
      mergeIntervals([
        { start: 10, end: 20 },
        { start: 15, end: 30 },
        { start: 30, end: 40 },
        { start: 50, end: 50 },
        { start: 60, end: 70 },
      ]),
    ).toEqual([
      { start: 10, end: 40 },
      { start: 60, end: 70 },
    ]);
  });

  it("subtracts cuts from the middle, the edges, and whole intervals", () => {
    expect(
      subtractIntervals(
        [{ start: 0, end: 100 }],
        [
          { start: 20, end: 30 },
          { start: 90, end: 120 },
        ],
      ),
    ).toEqual([
      { start: 0, end: 20 },
      { start: 30, end: 90 },
    ]);
    expect(subtractIntervals([{ start: 10, end: 20 }], [{ start: 0, end: 50 }])).toEqual([]);
    expect(subtractIntervals([{ start: 10, end: 20 }], [])).toEqual([{ start: 10, end: 20 }]);
  });
});

describe("windowMinutes", () => {
  it("counts overlapping windows once", () => {
    const w = [
      { day: 1, start: "16:00", end: "18:00" },
      { day: 1, start: "17:00", end: "19:00" },
    ];
    expect(windowMinutes(new Date(2026, 9, 19), w)).toBe(180);
    expect(windowMinutes(new Date(2026, 9, 20), w)).toBe(0);
  });
});

describe("buildDaySlots", () => {
  it("returns the whole window when nothing is in the way", () => {
    expect(slotsFor()).toEqual([{ date: "2026-10-19", start: mins(16), end: mins(21) }]);
  });

  it("keeps a physical class and its 30-minute travel buffers clear", () => {
    const slots = slotsFor({ events: [makeEvent({ start: "17:00", end: "18:30" })] });
    expect(slots).toEqual([
      { date: "2026-10-19", start: mins(16), end: mins(16, 30) },
      { date: "2026-10-19", start: mins(19), end: mins(21) },
    ]);
  });

  it("uses the small buffer for online classes and snaps to the grid", () => {
    const slots = slotsFor({
      events: [makeEvent({ mode: "online", start: "17:00", end: "18:30" })],
    });
    expect(slots).toEqual([
      { date: "2026-10-19", start: mins(16), end: mins(16, 55) },
      { date: "2026-10-19", start: mins(18, 35), end: mins(21) },
    ]);
  });

  it("protects exams and 'other' events too, and one-time events only on their date", () => {
    const exam = makeEvent({
      id: "x",
      kind: "exam",
      recurrence: "none",
      date: "2026-10-19",
      start: "19:00",
      end: "20:00",
    });
    expect(slotsFor({ events: [exam] })[0]).toEqual({
      date: "2026-10-19",
      start: mins(16),
      end: mins(18, 30),
    });
    // same event, different date: untouched
    expect(slotsFor({ events: [exam], date: new Date(2026, 9, 20) })).toEqual([
      { date: "2026-10-20", start: mins(16), end: mins(21) },
    ]);
  });

  it("drops gaps shorter than the minimum slot", () => {
    // window 16:00–21:00, class 16:40–17:00 + 30 min buffers → only 16:00–16:10 would remain
    const slots = slotsFor({ events: [makeEvent({ start: "16:40", end: "17:00" })] });
    expect(slots.every((s) => s.end - s.start >= 20)).toBe(true);
    expect(slots.some((s) => s.start < mins(16, 30))).toBe(false);
  });

  it("clamps today to the current time, snapped up", () => {
    const slots = slotsFor({ now: at(19, 17, 12) });
    expect(slots).toEqual([{ date: "2026-10-19", start: mins(17, 15), end: mins(21) }]);
  });

  it("returns nothing once today's windows have passed", () => {
    expect(slotsFor({ now: at(19, 22, 0) })).toEqual([]);
  });

  it("treats occupied intervals (locked blocks) like events", () => {
    const slots = slotsFor({ occupied: [{ start: mins(16), end: mins(17) }] });
    expect(slots).toEqual([{ date: "2026-10-19", start: mins(17), end: mins(21) }]);
  });
});
