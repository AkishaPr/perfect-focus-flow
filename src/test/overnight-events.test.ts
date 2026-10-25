import { describe, expect, it } from "vitest";
import {
  eventRange,
  studyDayEvents,
  overlappingIds,
  layoutOverlaps,
  toMin,
  studyDayKey,
} from "@/lib/calendar";
import { eventSchema } from "@/lib/schema";
import { migrate } from "@/lib/store";
import { buildDaySlots } from "@/lib/planner/availability";
import { buildToday } from "@/lib/planner/today";
import { makeEvent, makeSettings } from "./planner-fixtures";

const sunday = new Date(2026, 9, 25);
const monday = new Date(2026, 9, 26);
const physics = makeEvent({
  id: "physics",
  title: "Physics",
  weekday: 0,
  start: "23:09",
  end: "02:29",
});
const opts = { onlineBufferMin: 5, physicalBufferMin: 30, minSlotMin: 5, snapMin: 1 };

describe("overnight calendar events", () => {
  it("keeps the full 3h20 duration independently of the 03:00 cutoff", () => {
    const range = eventRange(physics);
    expect(range.end - range.start).toBe(200);
    expect(studyDayKey(new Date(2026, 9, 26, 2, 29))).toBe("2026-10-25");
    expect(eventRange({ ...physics, end: "04:00" }).end).toBe(1680);
  });

  it("round-trips weekly and one-time events through persisted/imported data", () => {
    const once = { ...physics, id: "once", recurrence: "none" as const, date: "2026-10-25" };
    expect(eventSchema.safeParse(physics).success).toBe(true);
    expect(migrate({ events: [physics, once] }).events).toEqual([physics, once]);
    expect(eventSchema.safeParse({ ...physics, end: physics.start }).success).toBe(false);
  });

  it("draws the Sunday class continuously, with Monday 01:00 sharing its overlap columns", () => {
    const early = makeEvent({ id: "early", weekday: 1, start: "01:00", end: "02:00" });
    const evs = studyDayEvents([physics, early], sunday);
    expect(evs.map((e) => [e.id, e.start, e.end])).toEqual([
      ["physics", "23:09", "26:29"],
      ["early", "25:00", "26:00"],
    ]);
    expect([...overlappingIds(evs)]).toEqual(["physics", "early"]);
    expect(layoutOverlaps(evs).get("physics")?.cols).toBe(2);
    expect(studyDayEvents([physics, early], monday)).toHaveLength(0);
  });

  it("splits events that cross 03:00 at the study-day boundary, including week edges", () => {
    const long = { ...physics, end: "04:00" };
    expect(studyDayEvents([long], sunday)[0]?.end).toBe("27:00");
    const tail = studyDayEvents([long], monday)[0]!;
    expect([tail.start, tail.end, tail.event]).toEqual(["03:00", "04:00", long]);
  });

  it("protects both dates and buffers, and never repeats a one-time event the following week", () => {
    const once = { ...physics, recurrence: "none" as const, date: "2026-10-25" };
    const slots = (date: Date, start: string, end: string) =>
      buildDaySlots({
        date,
        windows: [{ day: date.getDay(), start, end }],
        events: [once],
        now: new Date(2026, 9, 24, 12),
        opts,
      });
    expect(slots(sunday, "22:00", "23:59")).toEqual([
      { date: "2026-10-25", start: 1320, end: 1359 },
    ]);
    expect(slots(monday, "00:00", "05:00")).toEqual([{ date: "2026-10-26", start: 179, end: 300 }]);
    expect(slots(new Date(2026, 10, 2), "00:00", "05:00")[0]?.start).toBe(0);
  });

  it("carries buffers across midnight even when the event itself does not cross", () => {
    const events = [makeEvent({ weekday: 1, start: "00:10", end: "01:00" })];
    const slots = buildDaySlots({
      date: sunday,
      windows: [{ day: 0, start: "23:00", end: "23:59" }],
      events,
      now: new Date(2026, 9, 24),
      opts,
    });
    expect(slots[0]?.end).toBe(toMin("23:40"));
  });

  it("keeps the overnight event on Sunday's Today timeline after midnight", () => {
    const timeline = buildToday(
      {
        settings: makeSettings(),
        events: [physics],
        tasks: [],
        goals: [],
        blocks: [],
        sessions: [],
        marks: [],
      },
      new Date(2026, 9, 26, 1),
    ).timeline;
    expect(timeline[0]).toMatchObject({ start: "23:09", end: "26:29", event: physics });
  });
});
