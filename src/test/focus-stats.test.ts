import { describe, expect, it } from "vitest";
import { generatePlan, sessionDate, studiedMinOn } from "@/lib/planner";
import { buildToday } from "@/lib/planner/today";
import {
  at,
  dailyWindow,
  makeBlock,
  makeInput,
  makeSession,
  makeSettings,
  makeTask,
} from "./planner-fixtures";

const TODAY = "2026-10-19";
const session = (over: Parameters<typeof makeSession>[0] = {}) =>
  makeSession({
    start: at(19, 16, 0).toISOString(),
    end: at(19, 16, 30).toISOString(),
    actualMin: 30,
    ...over,
  });

describe("sessionDate", () => {
  it("is the local day the session started on", () => {
    expect(sessionDate({ start: at(19, 23, 50).toISOString() })).toBe("2026-10-19");
    expect(sessionDate({ start: at(20, 0, 5).toISOString() })).toBe("2026-10-20");
  });
  it("is null for a timestamp that can't be read", () => {
    expect(sessionDate({ start: "yesterday-ish" })).toBeNull();
  });
});

describe("studiedMinOn", () => {
  it("adds up the day's sessions by real minutes, not by clock span", () => {
    const s = [session({ id: "1", actualMin: 25 }), session({ id: "2", actualMin: 20 })];
    expect(studiedMinOn(TODAY, [], s)).toBe(45);
  });

  it("ignores sessions and blocks from other days", () => {
    const s = [session({ id: "1", start: at(18, 16, 0).toISOString() })];
    const b = [makeBlock({ id: "b", date: "2026-10-18", status: "done" })];
    expect(studiedMinOn(TODAY, b, s)).toBe(0);
  });

  it("still counts a done or partial block with no session by its length", () => {
    const b = [
      makeBlock({ id: "d", start: "07:00", end: "07:40", status: "done" }),
      makeBlock({ id: "p", start: "08:00", end: "08:20", status: "partial" }),
    ];
    expect(studiedMinOn(TODAY, b, [])).toBe(60);
  });

  it("counts a timed block once: the session wins over its block", () => {
    const b = [makeBlock({ id: "b1", start: "16:00", end: "17:10", status: "done" })];
    const s = [session({ id: "s1", actualMin: 55, blockId: "b1" })];
    expect(studiedMinOn(TODAY, b, s)).toBe(55);
  });

  it("does not count planned or missed blocks", () => {
    const b = [makeBlock({ id: "a", status: "planned" }), makeBlock({ id: "b", status: "missed" })];
    expect(studiedMinOn(TODAY, b, [])).toBe(0);
  });

  it("mixes timed and untimed work in one day", () => {
    const b = [
      makeBlock({ id: "manual", start: "07:00", end: "07:30", status: "done" }),
      makeBlock({ id: "timed", start: "16:00", end: "16:50", status: "done" }),
    ];
    const s = [session({ id: "s", actualMin: 45, blockId: "timed" })];
    expect(studiedMinOn(TODAY, b, s)).toBe(75);
  });
});

describe("planner and Today use the same total", () => {
  it("counts timed study against today's cap", () => {
    const plan = generatePlan(
      makeInput({
        tasks: [makeTask({ id: "a", estimateMin: 600 })],
        sessions: [
          session({ id: "s", taskId: "x", start: at(19, 7, 0).toISOString(), actualMin: 90 }),
        ],
        settings: makeSettings({
          studyWindows: dailyWindow("16:00", "21:00"),
          maxDailyStudyMin: 120,
        }),
        options: { slackFraction: 0 },
      }),
    );
    expect(plan.capacity[0]?.plannedMin).toBe(30); // 120 − 90 already studied
  });

  it("doesn't double-count a timed block against the cap", () => {
    // 90-minute block, but only 80 real minutes studied (pauses). Cap 120 → 40 left.
    // Counting the block too would leave 0; counting only the block would leave 30.
    const plan = generatePlan(
      makeInput({
        tasks: [makeTask({ id: "a", estimateMin: 600 })],
        blocks: [makeBlock({ id: "b", taskId: "x", start: "07:00", end: "08:30", status: "done" })],
        sessions: [
          session({
            id: "s",
            taskId: "x",
            start: at(19, 7, 0).toISOString(),
            actualMin: 80,
            blockId: "b",
          }),
        ],
        settings: makeSettings({
          studyWindows: dailyWindow("16:00", "21:00"),
          maxDailyStudyMin: 120,
        }),
        options: { slackFraction: 0 },
      }),
    );
    expect(plan.capacity[0]?.plannedMin).toBe(40);
  });

  it("shows 'studied today' from sessions on the Today view", () => {
    const view = buildToday(
      {
        ...makeInput({ tasks: [makeTask({ id: "a" })] }),
        blocks: [makeBlock({ id: "b", taskId: "a", start: "07:00", end: "08:00", status: "done" })],
        sessions: [
          session({
            id: "s",
            taskId: "a",
            start: at(19, 7, 0).toISOString(),
            actualMin: 48,
            blockId: "b",
          }),
        ],
      },
      at(19, 9, 0),
    );
    expect(view.stats.doneMin).toBe(48);
  });
});
