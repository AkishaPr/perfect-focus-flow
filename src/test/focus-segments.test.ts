import { describe, expect, it } from "vitest";
import {
  deleteSessionState,
  markInProgress,
  recordFocusSegment,
  type FocusSlice,
  type SegmentInput,
} from "@/lib/focus/segments";
import { at, makeBlock, makeSession, makeTask } from "./planner-fixtures";

const slice = (over: Partial<FocusSlice> = {}): FocusSlice => ({
  tasks: [makeTask({ id: "a", status: "in_progress" }), makeTask({ id: "b" })],
  blocks: [],
  sessions: [],
  ...over,
});

const seg = (over: Partial<SegmentInput> = {}): SegmentInput => ({
  sessionId: "s1",
  taskId: "a",
  blockId: null,
  startedAtMs: at(19, 16, 0).getTime(),
  endedAtMs: at(19, 16, 50).getTime(),
  minutes: 50,
  plannedMin: 50,
  taskDone: false,
  ...over,
});

describe("recordFocusSegment", () => {
  it("logs a session and a done block that point at each other", () => {
    const out = recordFocusSegment(slice(), seg());
    expect(out.sessions).toEqual([
      {
        id: "s1",
        taskId: "a",
        start: at(19, 16, 0).toISOString(),
        end: at(19, 16, 50).toISOString(),
        actualMin: 50,
        blockId: "focus:s1",
      },
    ]);
    expect(out.blocks).toEqual([
      {
        id: "focus:s1",
        taskId: "a",
        date: "2026-10-19",
        start: "16:00",
        end: "16:50",
        status: "done",
      },
    ]);
  });

  it("marks the block partial when the segment stopped short of its plan", () => {
    const out = recordFocusSegment(
      slice(),
      seg({ minutes: 20, endedAtMs: at(19, 16, 20).getTime() }),
    );
    expect(out.blocks[0]?.status).toBe("partial");
    expect(out.sessions[0]?.actualMin).toBe(20);
  });

  it("turns the committed block into the done block instead of adding a second one", () => {
    const committed = makeBlock({ id: "b1", taskId: "a", start: "16:00", end: "16:50" });
    const out = recordFocusSegment(slice({ blocks: [committed] }), seg({ blockId: "b1" }));
    expect(out.blocks).toHaveLength(1);
    expect(out.blocks[0]).toMatchObject({ id: "b1", status: "done", start: "16:00", end: "16:50" });
    expect(out.sessions[0]?.blockId).toBe("b1");
  });

  it("records the real clock times, even when the plan said otherwise", () => {
    const committed = makeBlock({ id: "b1", taskId: "a", start: "16:00", end: "16:50" });
    const out = recordFocusSegment(
      slice({ blocks: [committed] }),
      seg({
        blockId: "b1",
        startedAtMs: at(19, 16, 25).getTime(),
        endedAtMs: at(19, 17, 20).getTime(),
        minutes: 50, // 5 min of pauses
      }),
    );
    expect(out.blocks[0]).toMatchObject({ start: "16:25", end: "17:20" });
  });

  it("never lets rounding make the block shorter than the minutes studied", () => {
    const out = recordFocusSegment(
      slice(),
      seg({
        startedAtMs: new Date(2026, 9, 19, 16, 0, 10).getTime(),
        endedAtMs: new Date(2026, 9, 19, 16, 0, 50).getTime(),
        minutes: 1,
        plannedMin: 5,
      }),
    );
    expect(out.blocks[0]).toMatchObject({ start: "16:00", end: "16:01" });
  });

  it("cuts a segment that runs past midnight at 23:59", () => {
    const out = recordFocusSegment(
      slice(),
      seg({
        startedAtMs: at(19, 23, 30).getTime(),
        endedAtMs: at(20, 0, 20).getTime(),
        minutes: 50,
      }),
    );
    expect(out.blocks[0]).toMatchObject({ date: "2026-10-19", start: "23:30", end: "23:59" });
    expect(out.sessions[0]?.actualMin).toBe(50);
  });

  it("makes an untouched task 'in progress' once time is logged on it", () => {
    const out = recordFocusSegment(slice(), seg({ taskId: "b" }));
    expect(out.tasks.find((t) => t.id === "b")?.status).toBe("in_progress");
    expect(out.tasks.find((t) => t.id === "a")?.status).toBe("in_progress");
  });

  it("finishes the task, stamps completedAt and drops its other pending commitments", () => {
    const committed = makeBlock({ id: "b1", taskId: "a" });
    const later = makeBlock({ id: "b2", taskId: "a", start: "19:00", end: "20:00" });
    const other = makeBlock({ id: "b3", taskId: "b", start: "19:00", end: "20:00" });
    const out = recordFocusSegment(
      slice({ blocks: [committed, later, other] }),
      seg({ blockId: "b1", taskDone: true, minutes: 20, endedAtMs: at(19, 16, 20).getTime() }),
    );
    const task = out.tasks.find((t) => t.id === "a");
    expect(task?.status).toBe("done");
    expect(task?.completedAt).toBe(at(19, 16, 20).toISOString());
    expect(out.blocks.map((b) => [b.id, b.status])).toEqual([
      ["b1", "done"], // done even though short: the task is finished
      ["b3", "planned"],
    ]);
  });

  it("keeps an existing completedAt if the task was already done", () => {
    const done = makeTask({ id: "a", status: "done", completedAt: "2026-10-18T08:00:00.000Z" });
    const out = recordFocusSegment(slice({ tasks: [done] }), seg({ taskDone: true }));
    expect(out.tasks[0]?.completedAt).toBe("2026-10-18T08:00:00.000Z");
  });

  it("logs no time under a minute, but still releases the block and honours 'done'", () => {
    const committed = makeBlock({ id: "b1", taskId: "a" });
    const none = recordFocusSegment(
      slice({ blocks: [committed] }),
      seg({ blockId: "b1", minutes: 0 }),
    );
    expect(none.sessions).toEqual([]);
    expect(none.blocks).toEqual([]);
    expect(none.tasks.find((t) => t.id === "a")?.status).toBe("in_progress");

    const finished = recordFocusSegment(slice(), seg({ minutes: 0, taskDone: true }));
    expect(finished.sessions).toEqual([]);
    expect(finished.tasks.find((t) => t.id === "a")?.status).toBe("done");
  });

  it("does not log a task for a bad number of minutes", () => {
    expect(recordFocusSegment(slice(), seg({ minutes: Number.NaN })).sessions).toEqual([]);
    expect(recordFocusSegment(slice(), seg({ minutes: -5 })).sessions).toEqual([]);
    expect(recordFocusSegment(slice(), seg({ minutes: 19.6 })).sessions[0]?.actualMin).toBe(20);
  });

  it("is idempotent: the same segment logged twice counts once", () => {
    const once = recordFocusSegment(slice(), seg());
    const twice = recordFocusSegment(once, seg());
    expect(twice).toBe(once);
  });

  it("changes nothing for a task that no longer exists", () => {
    const s = slice();
    expect(recordFocusSegment(s, seg({ taskId: "ghost" }))).toBe(s);
  });

  it("ignores a block id that is no longer planned", () => {
    const finished = makeBlock({ id: "b1", taskId: "a", status: "done" });
    const out = recordFocusSegment(slice({ blocks: [finished] }), seg({ blockId: "b1" }));
    expect(out.blocks.map((b) => b.id).sort()).toEqual(["b1", "focus:s1"]);
    expect(out.blocks.find((b) => b.id === "b1")).toBe(finished);
  });
});

describe("deleteSessionState", () => {
  it("removes the session and the block it produced", () => {
    const logged = recordFocusSegment(slice(), seg());
    const out = deleteSessionState(logged, "s1");
    expect(out.sessions).toEqual([]);
    expect(out.blocks).toEqual([]);
  });

  it("leaves other sessions, their blocks and the tasks alone", () => {
    let s = recordFocusSegment(slice(), seg());
    s = recordFocusSegment(
      s,
      seg({
        sessionId: "s2",
        startedAtMs: at(19, 18, 0).getTime(),
        endedAtMs: at(19, 18, 50).getTime(),
      }),
    );
    const out = deleteSessionState(s, "s1");
    expect(out.sessions.map((x) => x.id)).toEqual(["s2"]);
    expect(out.blocks.map((b) => b.id)).toEqual(["focus:s2"]);
    expect(out.tasks).toBe(s.tasks);
  });

  it("never deletes a block that is still a planned commitment", () => {
    const planned = makeBlock({ id: "b1", taskId: "a", status: "planned" });
    const session = makeSession({ id: "s9", taskId: "a", blockId: "b1" });
    const out = deleteSessionState(slice({ blocks: [planned], sessions: [session] }), "s9");
    expect(out.blocks).toEqual([planned]);
    expect(out.sessions).toEqual([]);
  });

  it("is a no-op for an unknown id", () => {
    const s = slice();
    expect(deleteSessionState(s, "nope")).toBe(s);
  });
});

describe("markInProgress", () => {
  it("moves to-do, missed and deferred tasks, but never a done one", () => {
    const tasks = [
      makeTask({ id: "t", status: "todo" }),
      makeTask({ id: "m", status: "missed" }),
      makeTask({ id: "d", status: "deferred" }),
      makeTask({ id: "x", status: "done" }),
    ];
    for (const t of tasks)
      expect(markInProgress(tasks, t.id).find((x) => x.id === t.id)?.status).toBe(
        t.status === "done" ? "done" : "in_progress",
      );
  });
});
