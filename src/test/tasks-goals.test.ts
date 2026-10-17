import { beforeEach, describe, expect, it } from "vitest";
import { useStore, withCompletion } from "@/lib/store";
import { goalProgress, goalsForTask } from "@/lib/goals";
import type { Goal, PlanBlock, Task } from "@/lib/types";

const task = (over: Partial<Task> = {}): Task => ({
  id: "t1",
  title: "Maths homework",
  subject: "maths",
  topic: "",
  type: "homework",
  estimateMin: 60,
  importance: 3,
  splittable: true,
  minChunkMin: 25,
  status: "todo",
  carryOverCount: 0,
  createdAt: "2026-10-12T08:00:00.000Z",
  ...over,
});
const goal = (over: Partial<Goal> = {}): Goal => ({
  id: "g1",
  weekStart: "2026-10-12",
  type: "homework",
  target: 2,
  title: "2 homeworks",
  ...over,
});
const block = (over: Partial<PlanBlock> = {}): PlanBlock => ({
  id: "b1",
  taskId: "t1",
  date: "2026-10-16",
  start: "16:00",
  end: "17:00",
  status: "planned",
  ...over,
});

const NOW = new Date("2026-10-17T10:00:00.000Z");

describe("task completion time", () => {
  it("sets completedAt when a task is first marked done", () => {
    const out = withCompletion(task(), task({ status: "done" }), NOW);
    expect(out.completedAt).toBe("2026-10-17T10:00:00.000Z");
  });

  it("clears completedAt when a done task is reopened", () => {
    const prev = task({ status: "done", completedAt: "2026-10-15T09:00:00.000Z" });
    expect(withCompletion(prev, task({ status: "todo", completedAt: prev.completedAt }), NOW).completedAt).toBeUndefined();
  });

  it("keeps the original completedAt when a done task is edited", () => {
    const prev = task({ status: "done", completedAt: "2026-10-15T09:00:00.000Z" });
    const out = withCompletion(prev, { ...prev, title: "Renamed" }, NOW);
    expect(out.completedAt).toBe("2026-10-15T09:00:00.000Z");
  });

  it("applies through the store's upsertTask", () => {
    useStore.setState({ tasks: [task()] });
    useStore.getState().upsertTask(task({ status: "done" }));
    expect(useStore.getState().tasks[0]?.completedAt).toBeTruthy();
  });
});

describe("goal progress", () => {
  it("counts only done tasks linked to that goal", () => {
    const tasks = [
      task({ id: "a", goalId: "g1", status: "done" }),
      task({ id: "b", goalId: "g1", status: "todo" }),
      task({ id: "c", goalId: "other", status: "done" }),
      task({ id: "d", status: "done" }),
    ];
    expect(goalProgress(goal(), tasks)).toMatchObject({ done: 1, linked: 2, target: 2, percent: 50 });
  });

  it("caps percent at 100 when more tasks than the target are done", () => {
    const tasks = ["a", "b", "c"].map((id) => task({ id, goalId: "g1", status: "done" }));
    expect(goalProgress(goal({ target: 2 }), tasks)).toMatchObject({ done: 3, percent: 100 });
  });

  it("offers goals for the deadline week plus the already linked goal", () => {
    const goals = [goal({ id: "this", weekStart: "2026-10-12" }), goal({ id: "next", weekStart: "2026-10-19" }), goal({ id: "old", weekStart: "2026-10-05" })];
    const ids = goalsForTask(goals, { deadline: "2026-10-21", goalId: "old" }).map((g) => g.id);
    expect(ids.sort()).toEqual(["next", "old"]);
  });
});

describe("deleting", () => {
  beforeEach(() => useStore.setState({ tasks: [], goals: [], blocks: [] }));

  it("deleting a goal unlinks its tasks and keeps them", () => {
    useStore.setState({ goals: [goal()], tasks: [task({ goalId: "g1" })] });
    useStore.getState().deleteGoal("g1");
    const s = useStore.getState();
    expect(s.goals).toHaveLength(0);
    expect(s.tasks).toHaveLength(1);
    expect(s.tasks[0]?.goalId).toBeUndefined();
  });

  it("deleting a task removes planned blocks but keeps completed ones", () => {
    useStore.setState({
      tasks: [task()],
      blocks: [block({ id: "p", status: "planned" }), block({ id: "d", status: "done" }), block({ id: "x", taskId: "other" })],
    });
    useStore.getState().deleteTask("t1");
    expect(useStore.getState().blocks.map((b) => b.id).sort()).toEqual(["d", "x"]);
  });
});
