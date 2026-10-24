import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Today } from "@/components/Today";
import { dayMin, studyDayKey, studyDayStart, studyMinute } from "@/lib/calendar";
import { findMissedBlocks, generatePlan } from "@/lib/planner";
import { buildToday } from "@/lib/planner/today";
import { useStore } from "@/lib/store";
import {
  at,
  dailyWindow,
  makeBlock,
  makeSettings,
  makeSession,
  makeTask,
} from "./planner-fixtures";

// Monday 19 Oct 2026. The study day ends at 03:00, so 00:30 on Tuesday 20th is still Monday's.
const LATE = at(20, 0, 30);
const MON = "2026-10-19";
const TUE = "2026-10-20";

const settings = makeSettings({ studyWindows: dailyWindow("15:30", "21:30") });
const data = (over: Partial<Parameters<typeof buildToday>[0]> = {}) => ({
  settings,
  events: [],
  tasks: [],
  goals: [],
  blocks: [],
  sessions: [],
  marks: [],
  ...over,
});

describe("the study day ends at 03:00", () => {
  it("rolls over at 03:00, not midnight", () => {
    expect(studyDayKey(at(20, 0, 0))).toBe(MON);
    expect(studyDayKey(at(20, 2, 59))).toBe(MON);
    expect(studyDayKey(at(20, 3, 0))).toBe(TUE);
    expect(studyDayStart(at(20, 1, 0))).toEqual(at(19, 0, 0));
  });

  it("counts after-midnight time as later in the same day", () => {
    expect(studyMinute(at(19, 23, 0))).toBe(23 * 60);
    expect(studyMinute(at(20, 0, 30))).toBe(24 * 60 + 30);
    expect(studyMinute(at(20, 2, 59))).toBe(24 * 60 + 179);
    expect(studyMinute(at(20, 3, 0))).toBe(180);
    expect(dayMin("00:30")).toBe(24 * 60 + 30);
    expect(dayMin("23:00")).toBe(23 * 60);
    expect(dayMin("03:00")).toBe(180);
  });
});

describe("Today after midnight", () => {
  it("is still the same day until 03:00", () => {
    expect(buildToday(data(), LATE).date).toBe(MON);
    expect(buildToday(data(), at(20, 2, 59)).date).toBe(MON);
    expect(buildToday(data(), at(20, 3, 0)).date).toBe(TUE);
  });

  it("doesn't turn a task due today into an overdue one at midnight", () => {
    const tasks = [makeTask({ id: "a", deadline: MON })];
    const late = buildToday(data({ tasks }), LATE).stats;
    expect([late.dueToday, late.overdue]).toEqual([1, 0]);
    const morning = buildToday(data({ tasks }), at(20, 3, 0)).stats;
    expect([morning.dueToday, morning.overdue]).toEqual([0, 1]);
  });

  it("keeps counting the evening's study until 03:00, then starts a fresh day", () => {
    const blocks = [
      makeBlock({ id: "b", taskId: "a", date: MON, start: "22:00", end: "23:00", status: "done" }),
    ];
    const tasks = [makeTask({ id: "a" })];
    expect(buildToday(data({ blocks, tasks }), LATE).stats.doneMin).toBe(60);
    expect(buildToday(data({ blocks, tasks }), at(20, 3, 0)).stats.doneMin).toBe(0);
  });

  it("puts late-night work after the evening on the timeline", () => {
    const tasks = [makeTask({ id: "a" })];
    const blocks = [
      makeBlock({
        id: "late",
        taskId: "a",
        date: MON,
        start: "00:10",
        end: "00:25",
        status: "done",
      }),
      makeBlock({
        id: "eve",
        taskId: "a",
        date: MON,
        start: "22:00",
        end: "23:00",
        status: "done",
      }),
    ];
    const keys = buildToday(data({ blocks, tasks }), at(20, 0, 30)).timeline.map((e) => e.key);
    expect(keys).toEqual(["done:eve", "done:late"]);
  });

  it("counts a session logged at 01:00 for the day before", () => {
    const sessions = [
      makeSession({ id: "s", taskId: "a", start: at(20, 1, 0).toISOString(), actualMin: 40 }),
    ];
    const tasks = [makeTask({ id: "a" })];
    expect(buildToday(data({ sessions, tasks }), at(20, 1, 30)).stats.doneMin).toBe(40);
  });
});

describe("planning after midnight", () => {
  it("treats the rest of the study day as gone, and plans from the next one", () => {
    const plan = generatePlan({
      settings,
      events: [],
      tasks: [makeTask({ id: "a", estimateMin: 60 })],
      goals: [],
      blocks: [],
      sessions: [],
      marks: [],
      now: LATE,
    });
    expect(plan.capacity[0]).toMatchObject({ date: MON, freeMin: 0 });
    expect(plan.blocks[0]?.date).toBe(TUE);
  });

  it("calls an evening block missed after midnight, but not tomorrow's block", () => {
    const evening = makeBlock({ id: "e", date: MON, start: "21:00", end: "21:30" });
    const tomorrow = makeBlock({ id: "t", date: TUE, start: "15:30", end: "16:00" });
    expect(findMissedBlocks([evening, tomorrow], LATE).map((b) => b.id)).toEqual(["e"]);
  });
});

describe("the Today page after midnight", () => {
  beforeEach(() => useStore.getState().reset());
  afterEach(cleanup);

  it("shows the study day's date, not the calendar date", async () => {
    useStore.setState({ settings });
    const root = createRootRoute({ component: () => <Today now={LATE} /> });
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    render(<RouterProvider router={router} />);
    await screen.findByRole("heading", { name: "Today" });
    const monday = at(19, 0).toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    expect(screen.getByText(new RegExp(`${monday} · 00:30`))).toBeInTheDocument();
  });
});
