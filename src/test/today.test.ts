import { describe, expect, it } from "vitest";
import { buildToday, overdueTasks, type TodayData } from "@/lib/planner/today";
import {
  at,
  dailyWindow,
  makeBlock,
  makeEvent,
  makeInput,
  makeSettings,
  makeTask,
} from "./planner-fixtures";

/** Today data: the planner fixture minus its clock and options. */
const data = (over: Partial<TodayData> = {}): TodayData => {
  const { now: _now, options: _options, ...rest } = makeInput();
  return { ...rest, ...over };
};
const NOW = at(19, 16, 0); // Monday 16:00, inside the 16:00–21:00 window

describe("buildToday: next up", () => {
  it("offers the best task as the next block, startable now", () => {
    const view = buildToday(data({ tasks: [makeTask({ id: "a", estimateMin: 45 })] }), NOW);
    expect(view.next).toMatchObject({ isToday: true, startsInMin: 0 });
    expect(view.next?.task.id).toBe("a");
    expect(view.next?.block).toMatchObject({ date: "2026-10-19", start: "16:00", end: "16:45" });
    expect(view.active).toBeNull();
  });

  it("reports minutes until a block that starts after a class", () => {
    const view = buildToday(
      data({
        tasks: [makeTask({ id: "a", estimateMin: 45 })],
        events: [makeEvent({ start: "16:00", end: "17:30" })],
      }),
      NOW,
    );
    // class 16:00–17:30 + 30 min travel → first free slot 18:00
    expect(view.next?.block.start).toBe("18:00");
    expect(view.next?.startsInMin).toBe(120);
  });

  it("falls back to a later day, which can't be started today", () => {
    const view = buildToday(data({ tasks: [makeTask({ id: "a" })] }), at(19, 22, 0));
    expect(view.next).toMatchObject({ isToday: false, startsInMin: null });
    expect(view.next?.block.date).toBe("2026-10-20");
  });

  it("has nothing next when there are no tasks", () => {
    const view = buildToday(data(), NOW);
    expect(view.next).toBeNull();
    expect(view.active).toBeNull();
  });
});

describe("buildToday: active work", () => {
  it("treats a committed block with an in-progress task as active and plans around it", () => {
    const view = buildToday(
      data({
        tasks: [
          makeTask({ id: "a", status: "in_progress", estimateMin: 50 }),
          makeTask({ id: "b", estimateMin: 30 }),
        ],
        blocks: [makeBlock({ id: "x", taskId: "a", start: "16:00", end: "16:50" })],
      }),
      NOW,
    );
    expect(view.active).toMatchObject({ overrun: false });
    expect(view.active?.block.id).toBe("x");
    expect(view.next?.task.id).toBe("b"); // not the active task again
    expect(view.next?.block.start).toBe("16:50");
    const entry = view.timeline.find((e) => e.kind === "block" && e.block.id === "x");
    expect(entry).toMatchObject({ kind: "block", state: "active" });
  });

  it("keeps a block active after its planned time passes, and flags the overrun", () => {
    const view = buildToday(
      data({
        tasks: [makeTask({ id: "a", status: "in_progress" })],
        blocks: [makeBlock({ id: "x", taskId: "a", start: "15:00", end: "15:50" })],
      }),
      NOW,
    );
    expect(view.active).toMatchObject({ overrun: true });
    expect(view.timeline.some((e) => e.kind === "block" && e.state === "active")).toBe(true);
  });

  it("surfaces unfinished work from a previous day without cluttering today's timeline", () => {
    const view = buildToday(
      data({
        tasks: [makeTask({ id: "a", status: "in_progress" })],
        blocks: [makeBlock({ id: "old", taskId: "a", date: "2026-10-18" })],
      }),
      NOW,
    );
    expect(view.active).toMatchObject({ overrun: true });
    expect(view.timeline.some((e) => e.kind === "block" && e.block.id === "old")).toBe(false);
  });

  it("ignores a committed block whose task isn't in progress", () => {
    const view = buildToday(
      data({
        tasks: [makeTask({ id: "a" })],
        blocks: [makeBlock({ id: "x", taskId: "a", start: "16:00", end: "16:50" })],
      }),
      NOW,
    );
    expect(view.active).toBeNull();
  });
});

describe("buildToday: timeline and numbers", () => {
  it("lists classes, finished work and planned blocks in time order", () => {
    const view = buildToday(
      data({
        tasks: [makeTask({ id: "a", estimateMin: 45 }), makeTask({ id: "d", status: "done" })],
        events: [makeEvent({ start: "18:00", end: "19:00" })],
        blocks: [
          makeBlock({ id: "done1", taskId: "d", start: "07:00", end: "07:40", status: "done" }),
        ],
      }),
      NOW,
    );
    expect(view.timeline.map((e) => [e.kind, e.start])).toEqual([
      ["done", "07:00"],
      ["block", "16:00"],
      ["event", "18:00"],
    ]);
  });

  it("counts study done today from completed blocks and what's still planned", () => {
    const view = buildToday(
      data({
        tasks: [makeTask({ id: "a", estimateMin: 45 }), makeTask({ id: "d", status: "done" })],
        blocks: [
          makeBlock({ id: "d1", taskId: "d", start: "07:00", end: "07:40", status: "done" }),
          makeBlock({ id: "d2", taskId: "d", start: "08:00", end: "08:20", status: "partial" }),
          makeBlock({ id: "old", taskId: "d", date: "2026-10-18", status: "done" }),
        ],
      }),
      NOW,
    );
    expect(view.stats).toMatchObject({ doneMin: 60, plannedMin: 45, dailyGoalMin: 240 });
  });

  it("counts open tasks due today and overdue, ignoring done and deferred", () => {
    const view = buildToday(
      data({
        tasks: [
          makeTask({ deadline: "2026-10-19" }),
          makeTask({ deadline: "2026-10-19", status: "done" }),
          makeTask({ deadline: "2026-10-17" }),
          makeTask({ deadline: "2026-10-16", status: "deferred" }),
          makeTask({ deadline: "2026-10-25" }),
        ],
      }),
      NOW,
    );
    expect(view.stats).toMatchObject({ dueToday: 1, overdue: 1 });
  });

  it("passes the planner's warnings through, and lists what didn't fit", () => {
    const view = buildToday(
      data({
        tasks: [makeTask({ id: "a", estimateMin: 300, deadline: "2026-10-19" })],
        settings: makeSettings({ studyWindows: dailyWindow("16:00", "17:00") }),
      }),
      NOW,
    );
    expect(view.warnings[0]?.code).toBe("deadline-at-risk");
    expect(view.didNotFit.map((u) => u.taskId)).toEqual(["a"]);
  });

  it("explains an empty plan instead of going quiet", () => {
    const view = buildToday(
      data({ tasks: [makeTask()], settings: makeSettings({ studyWindows: [] }) }),
      NOW,
    );
    expect(view.next).toBeNull();
    expect(view.warnings.map((w) => w.code)).toContain("no-study-windows");
  });
});

describe("overdueTasks", () => {
  it("lists open tasks past their deadline, longest overdue first, with the days overdue", () => {
    const list = overdueTasks(
      [
        makeTask({ id: "a", title: "Recent", deadline: "2026-10-18" }),
        makeTask({ id: "b", title: "Old", deadline: "2026-10-12" }),
        makeTask({ id: "c", title: "Due today", deadline: "2026-10-19" }),
        makeTask({ id: "d", title: "No deadline" }),
      ],
      "2026-10-19",
    );
    expect(list.map((o) => [o.task.id, o.daysOverdue])).toEqual([
      ["b", 7],
      ["a", 1],
    ]);
  });

  it("ignores done and deferred tasks, and always agrees with stats.overdue", () => {
    const tasks = [
      makeTask({ id: "a", deadline: "2026-10-10", status: "done" }),
      makeTask({ id: "b", deadline: "2026-10-10", status: "deferred" }),
      makeTask({ id: "c", deadline: "2026-10-10", status: "missed" }),
      makeTask({ id: "d", deadline: "2026-10-11", status: "in_progress" }),
    ];
    const list = overdueTasks(tasks, "2026-10-19");
    expect(list.map((o) => o.task.id)).toEqual(["c", "d"]);
    expect(buildToday(data({ tasks }), NOW).stats.overdue).toBe(list.length);
  });
});
