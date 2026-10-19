import { describe, expect, it } from "vitest";
import {
  addDays,
  blocksOn,
  eventsOn,
  fromMin,
  layoutOverlaps,
  overlappingIds,
  toMin,
  weekStart,
  windowsOn,
  ymd,
} from "@/lib/calendar";
import type { CalEvent, PlanBlock, StudyWindow } from "@/lib/types";

const ev = (over: Partial<CalEvent>): CalEvent => ({
  id: "e",
  title: "x",
  kind: "class",
  mode: "physical",
  recurrence: "weekly",
  weekday: 1,
  start: "14:00",
  end: "16:00",
  ...over,
});

describe("time helpers", () => {
  it("toMin / fromMin round-trip", () => {
    expect(toMin("00:00")).toBe(0);
    expect(toMin("05:30")).toBe(330);
    expect(toMin("23:59")).toBe(1439);
    expect(fromMin(330)).toBe("05:30");
    expect(fromMin(toMin("16:05"))).toBe("16:05");
  });
});

describe("weekStart (Monday-based)", () => {
  // 2026-10-12 is a Monday
  it.each([
    ["Monday", new Date(2026, 9, 12), "2026-10-12"],
    ["Wednesday", new Date(2026, 9, 14), "2026-10-12"],
    [
      "Sunday belongs to the week that started the previous Monday",
      new Date(2026, 9, 18),
      "2026-10-12",
    ],
    ["next Monday starts a new week", new Date(2026, 9, 19), "2026-10-19"],
    ["month boundary", new Date(2026, 10, 1), "2026-10-26"],
    ["year boundary", new Date(2027, 0, 1), "2026-12-28"],
  ])("%s", (_n, d, expected) => {
    expect(ymd(weekStart(d))).toBe(expected);
  });

  it("ignores the time of day", () => {
    expect(ymd(weekStart(new Date(2026, 9, 18, 23, 59, 59)))).toBe("2026-10-12");
  });
});

describe("addDays / ymd", () => {
  it("crosses month and year boundaries and does not mutate its input", () => {
    const d = new Date(2026, 11, 30);
    expect(ymd(addDays(d, 3))).toBe("2027-01-02");
    expect(ymd(d)).toBe("2026-12-30");
    expect(ymd(addDays(d, -30))).toBe("2026-11-30");
  });
  it("pads month and day", () => {
    expect(ymd(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("eventsOn", () => {
  const monday = new Date(2026, 9, 12);
  it("matches weekly events by weekday and one-time events by date, sorted by start", () => {
    const events = [
      ev({ id: "late", weekday: 1, start: "18:00", end: "19:00" }),
      ev({ id: "once", recurrence: "none", date: "2026-10-12", start: "08:00", end: "09:00" }),
      ev({ id: "tue", weekday: 2 }),
      ev({ id: "other-date", recurrence: "none", date: "2026-10-13" }),
    ];
    expect(eventsOn(events, monday).map((e) => e.id)).toEqual(["once", "late"]);
  });

  it("a weekly event repeats every week", () => {
    const events = [ev({ id: "w", weekday: 1 })];
    expect(eventsOn(events, new Date(2026, 9, 19))).toHaveLength(1);
    expect(eventsOn(events, new Date(2027, 0, 4))).toHaveLength(1);
  });

  it("ignores a stale date on weekly events", () => {
    const events = [ev({ id: "w", weekday: 1, date: "1999-01-01" })];
    expect(eventsOn(events, monday)).toHaveLength(1);
  });
});

describe("overlappingIds", () => {
  it("flags only events that really overlap", () => {
    const ids = overlappingIds([
      ev({ id: "a", start: "14:00", end: "16:00" }),
      ev({ id: "b", start: "15:00", end: "17:00" }),
      ev({ id: "c", start: "17:00", end: "18:00" }), // touches b's end: not an overlap
      ev({ id: "d", start: "20:00", end: "21:00" }),
    ]);
    expect([...ids].sort()).toEqual(["a", "b"]);
  });

  it("treats a fully contained event as overlapping", () => {
    const ids = overlappingIds([
      ev({ id: "a", start: "14:00", end: "18:00" }),
      ev({ id: "b", start: "15:00", end: "16:00" }),
    ]);
    expect(ids.size).toBe(2);
  });

  it("returns nothing for empty or single input", () => {
    expect(overlappingIds([]).size).toBe(0);
    expect(overlappingIds([ev({})]).size).toBe(0);
  });
});

describe("windowsOn / blocksOn", () => {
  it("windowsOn filters by weekday (0 = Sunday)", () => {
    const w: StudyWindow[] = [
      { day: 0, start: "07:00", end: "12:00" },
      { day: 1, start: "15:30", end: "21:30" },
    ];
    expect(windowsOn(w, new Date(2026, 9, 18))).toHaveLength(1); // Sunday
    expect(windowsOn(w, new Date(2026, 9, 18))[0]!.start).toBe("07:00");
    expect(windowsOn(w, new Date(2026, 9, 17))).toHaveLength(0); // Saturday
  });

  it("blocksOn filters by local date", () => {
    const b = (id: string, date: string): PlanBlock => ({
      id,
      taskId: "t",
      date,
      start: "16:00",
      end: "17:00",
      status: "planned",
    });
    expect(
      blocksOn([b("1", "2026-10-16"), b("2", "2026-10-17")], new Date(2026, 9, 16)),
    ).toHaveLength(1);
  });
});

describe("layoutOverlaps", () => {
  const slot = (evs: CalEvent[]) => Object.fromEntries(layoutOverlaps(evs));

  it("gives a lone event the whole width", () => {
    expect(slot([ev({ id: "a" })])).toEqual({ a: { col: 0, cols: 1 } });
  });

  it("puts two overlapping events side by side", () => {
    const r = slot([
      ev({ id: "a", start: "14:00", end: "16:00" }),
      ev({ id: "b", start: "15:00", end: "17:00" }),
    ]);
    expect(r).toEqual({ a: { col: 0, cols: 2 }, b: { col: 1, cols: 2 } });
  });

  it("lets back-to-back events keep the full width", () => {
    const r = slot([
      ev({ id: "a", start: "14:00", end: "15:00" }),
      ev({ id: "b", start: "15:00", end: "16:00" }),
    ]);
    expect(r).toEqual({ a: { col: 0, cols: 1 }, b: { col: 0, cols: 1 } });
  });

  it("reuses a free column inside one cluster and sizes every event in it alike", () => {
    // a overlaps b and c; b and c do not overlap each other, so two columns are enough.
    const r = slot([
      ev({ id: "a", start: "09:00", end: "12:00" }),
      ev({ id: "b", start: "09:30", end: "10:30" }),
      ev({ id: "c", start: "11:00", end: "11:45" }),
    ]);
    expect(r["a"]).toEqual({ col: 0, cols: 2 });
    expect(r["b"]).toEqual({ col: 1, cols: 2 });
    expect(r["c"]).toEqual({ col: 1, cols: 2 });
  });

  it("keeps separate clusters independent", () => {
    const r = slot([
      ev({ id: "a", start: "08:00", end: "09:00" }),
      ev({ id: "b", start: "08:30", end: "09:30" }),
      ev({ id: "c", start: "13:00", end: "14:00" }),
    ]);
    expect(r["c"]).toEqual({ col: 0, cols: 1 });
    expect(r["a"]?.cols).toBe(2);
  });

  it("agrees with overlappingIds about who is in a clash", () => {
    const evs = [
      ev({ id: "a", start: "09:00", end: "10:00" }),
      ev({ id: "b", start: "09:30", end: "10:30" }),
      ev({ id: "c", start: "12:00", end: "13:00" }),
    ];
    const clash = overlappingIds(evs);
    const slots = layoutOverlaps(evs);
    for (const e of evs) expect(clash.has(e.id)).toBe(slots.get(e.id)!.cols > 1);
  });
});
