import { beforeEach, describe, expect, it } from "vitest";
import { completeBlockState, releaseBlockState, startBlockState, useStore } from "@/lib/store";
import { at, makeBlock, makeTask } from "./planner-fixtures";

const state = (over: Partial<Parameters<typeof startBlockState>[0]> = {}) => ({
  tasks: [makeTask({ id: "a" }), makeTask({ id: "b" })],
  blocks: [],
  ...over,
});

describe("startBlockState", () => {
  it("commits the block and puts the task in progress", () => {
    const next = startBlockState(state(), makeBlock({ id: "x", taskId: "a" }));
    expect(next.blocks).toEqual([makeBlock({ id: "x", taskId: "a" })]);
    expect(next.tasks.find((t) => t.id === "a")?.status).toBe("in_progress");
    expect(next.tasks.find((t) => t.id === "b")?.status).toBe("todo");
  });

  it("stores only PlanBlock fields, not the planner's score or reasons", () => {
    const rich = {
      ...makeBlock({ id: "x", taskId: "a" }),
      subject: "maths",
      score: 42,
      reasons: ["r"],
      locked: false,
    };
    const stored = startBlockState(state(), rich).blocks[0]!;
    expect(Object.keys(stored).sort()).toEqual(["date", "end", "id", "start", "status", "taskId"]);
  });

  it("is idempotent", () => {
    const once = startBlockState(state(), makeBlock({ id: "x", taskId: "a" }));
    const twice = startBlockState(once, makeBlock({ id: "x", taskId: "a" }));
    expect(twice.blocks).toHaveLength(1);
  });

  it("does nothing for a missing or finished task", () => {
    const s = state({ tasks: [makeTask({ id: "a", status: "done" })] });
    expect(startBlockState(s, makeBlock({ taskId: "a" }))).toBe(s);
    expect(startBlockState(s, makeBlock({ taskId: "ghost" }))).toBe(s);
  });
});

describe("releaseBlockState", () => {
  it("drops the block and returns the task to to-do", () => {
    const started = startBlockState(state(), makeBlock({ id: "x", taskId: "a" }));
    const back = releaseBlockState(started, "x");
    expect(back.blocks).toEqual([]);
    expect(back.tasks.find((t) => t.id === "a")?.status).toBe("todo");
  });

  it("keeps the task in progress while another committed block still holds it", () => {
    let s = startBlockState(state(), makeBlock({ id: "x", taskId: "a" }));
    s = startBlockState(s, makeBlock({ id: "y", taskId: "a", start: "18:00", end: "19:00" }));
    const back = releaseBlockState(s, "x");
    expect(back.blocks.map((b) => b.id)).toEqual(["y"]);
    expect(back.tasks.find((t) => t.id === "a")?.status).toBe("in_progress");
  });

  it("never removes finished blocks (they're study history)", () => {
    const s = state({ blocks: [makeBlock({ id: "d", taskId: "a", status: "done" })] });
    expect(releaseBlockState(s, "d")).toBe(s);
  });
});

describe("completeBlockState", () => {
  const started = () =>
    startBlockState(state(), makeBlock({ id: "x", taskId: "a", start: "16:00", end: "17:00" }));

  it("marks the block and its task done, stamping completedAt", () => {
    const now = at(19, 17, 30);
    const done = completeBlockState(started(), "x", now);
    expect(done.blocks[0]).toMatchObject({ id: "x", status: "done", end: "17:00" });
    const task = done.tasks.find((t) => t.id === "a")!;
    expect(task.status).toBe("done");
    expect(task.completedAt).toBe(now.toISOString());
  });

  it("shortens the block to now when finished early, so study time isn't overstated", () => {
    const done = completeBlockState(started(), "x", at(19, 16, 35));
    expect(done.blocks[0]).toMatchObject({ start: "16:00", end: "16:35" });
  });

  it("keeps the planned end when finished late or barely started", () => {
    expect(completeBlockState(started(), "x", at(19, 17, 40)).blocks[0]?.end).toBe("17:00");
    expect(completeBlockState(started(), "x", at(19, 16, 2)).blocks[0]?.end).toBe("17:00");
  });

  it("does not shorten a block from another day", () => {
    expect(completeBlockState(started(), "x", at(20, 16, 35)).blocks[0]?.end).toBe("17:00");
  });

  it("drops the task's other pending commitments but not other tasks' blocks", () => {
    let s = started();
    s = startBlockState(s, makeBlock({ id: "later", taskId: "a", start: "18:00", end: "19:00" }));
    s = startBlockState(s, makeBlock({ id: "other", taskId: "b", start: "19:30", end: "20:00" }));
    const done = completeBlockState(s, "x", at(19, 17, 30));
    expect(done.blocks.map((b) => b.id).sort()).toEqual(["other", "x"]);
  });

  it("ignores unknown ids and blocks that aren't pending", () => {
    const s = started();
    expect(completeBlockState(s, "nope")).toBe(s);
    const doneOnce = completeBlockState(s, "x", at(19, 17, 30));
    expect(completeBlockState(doneOnce, "x", at(19, 17, 31))).toBe(doneOnce);
  });
});

describe("store actions", () => {
  beforeEach(() => useStore.getState().reset());

  it("start → complete runs through the real store", () => {
    useStore.getState().upsertTask(makeTask({ id: "a" }));
    useStore.getState().startBlock(makeBlock({ id: "x", taskId: "a" }));
    expect(useStore.getState().tasks[0]?.status).toBe("in_progress");
    expect(useStore.getState().blocks).toHaveLength(1);
    useStore.getState().completeBlock("x", at(19, 17, 30));
    expect(useStore.getState().tasks[0]?.status).toBe("done");
    expect(useStore.getState().blocks[0]?.status).toBe("done");
  });

  it("start → release restores the to-do state", () => {
    useStore.getState().upsertTask(makeTask({ id: "a" }));
    useStore.getState().startBlock(makeBlock({ id: "x", taskId: "a" }));
    useStore.getState().releaseBlock("x");
    expect(useStore.getState().tasks[0]?.status).toBe("todo");
    expect(useStore.getState().blocks).toEqual([]);
  });
});
