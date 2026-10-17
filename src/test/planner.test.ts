import { describe, expect, it } from "vitest";
import {
  applyPlan,
  freeWindows,
  mergeIntervals,
  planDay,
  scoreTask,
  subtractIntervals,
  type PlanInput,
} from "@/lib/planner";
import type { CalEvent, Goal, PlanBlock, Settings, Task } from "@/lib/types";

// Saturday 17 Oct 2026 (getDay() === 6)
const DATE = new Date(2026, 9, 17);

const settings = (over: Partial<Settings> = {}): Settings => ({
  timezone: "Asia/Colombo",
  wake: "05:00",
  sleep: "23:00",
  studyWindows: [{ day: 6, start: "16:00", end: "20:00" }],
  focusMin: 50,
  breakMin: 10,
  maxDailyStudyMin: 300,
  dailyGoalMin: 180,
  weeklyGoalMin: 1200,
  weights: { deadline: 30, overdue: 20, importance: 20, weakTopic: 15, goal: 10, carryOver: 5 },
  weakTopics: [],
  ...over,
});

const task = (over: Partial<Task> = {}): Task => ({
  id: "t1",
  title: "Task",
  subject: "maths",
  topic: "",
  type: "homework",
  estimateMin: 50,
  importance: 3,
  splittable: true,
  minChunkMin: 25,
  status: "todo",
  carryOverCount: 0,
  createdAt: "2026-10-10T00:00:00.000Z",
  ...over,
});

const event = (over: Partial<CalEvent> = {}): CalEvent => ({
  id: "e1",
  title: "Physics class",
  kind: "class",
  mode: "physical",
  recurrence: "none",
  date: "2026-10-17",
  start: "17:00",
  end: "18:00",
  ...over,
});

const input = (over: Partial<PlanInput> = {}): PlanInput => ({
  date: DATE,
  settings: settings(),
  events: [],
  tasks: [],
  goals: [],
  blocks: [],
  ...over,
});

describe("interval helpers", () => {
  it("merges overlapping and touching intervals", () => {
    expect(mergeIntervals([{ start: 10, end: 20 }, { start: 20, end: 30 }, { start: 5, end: 8 }])).toEqual([
      { start: 5, end: 8 },
      { start: 10, end: 30 },
    ]);
  });

  it("subtracts a cut from the middle", () => {
    expect(subtractIntervals([{ start: 0, end: 100 }], [{ start: 40, end: 60 }])).toEqual([
      { start: 0, end: 40 },
      { start: 60, end: 100 },
    ]);
  });
});

describe("free windows", () => {
  it("removes events with a buffer on each side", () => {
    expect(freeWindows(DATE, settings(), [event()], [])).toEqual([
      { start: 16 * 60, end: 16 * 60 + 50 },
      { start: 18 * 60 + 10, end: 20 * 60 },
    ]);
  });

  it("matches weekly events by weekday", () => {
    const weekly = event({ recurrence: "weekly", date: undefined, weekday: 6 });
    expect(freeWindows(DATE, settings(), [weekly], [])).toHaveLength(2);
    expect(freeWindows(DATE, settings(), [{ ...weekly, weekday: 1 }], [])).toHaveLength(1);
  });

  it("clips study windows to wake and sleep", () => {
    const s = settings({ sleep: "19:00", studyWindows: [{ day: 6, start: "04:00", end: "21:00" }] });
    expect(freeWindows(DATE, s, [], [])).toEqual([{ start: 5 * 60, end: 19 * 60 }]);
  });

  it("ignores windows that cross midnight", () => {
    const s = settings({ studyWindows: [{ day: 6, start: "22:00", end: "01:00" }] });
    expect(freeWindows(DATE, s, [], [])).toEqual([]);
  });

  it("removes done blocks but not planned or missed ones", () => {
    const blocks: PlanBlock[] = [
      { id: "d", taskId: "x", date: "2026-10-17", start: "16:00", end: "17:00", status: "done" },
      { id: "p", taskId: "x", date: "2026-10-17", start: "18:00", end: "19:00", status: "planned" },
      { id: "m", taskId: "x", date: "2026-10-17", start: "19:00", end: "20:00", status: "missed" },
    ];
    expect(freeWindows(DATE, settings(), [], blocks)).toEqual([{ start: 17 * 60, end: 20 * 60 }]);
  });
});

describe("scoring", () => {
  const ctx = { date: DATE, settings: settings(), goals: [] as Goal[], tasks: [] as Task[] };

  it("stays between 0 and 100", () => {
    const max = scoreTask(
      task({ deadline: "2026-10-01", importance: 5, carryOverCount: 10, topic: "Vectors" }),
      { ...ctx, settings: settings({ weakTopics: [{ subject: "maths", topic: "vectors" }] }) },
    );
    expect(max.total).toBeLessThanOrEqual(100);
    expect(scoreTask(task({ importance: 1 }), ctx).total).toBe(0);
  });

  it("ranks a closer deadline higher", () => {
    const soon = scoreTask(task({ deadline: "2026-10-18" }), ctx).total;
    const later = scoreTask(task({ deadline: "2026-10-30" }), ctx).total;
    expect(soon).toBeGreaterThan(later);
  });

  it("gives overdue points that grow with days overdue", () => {
    const one = scoreTask(task({ deadline: "2026-10-16" }), ctx);
    const week = scoreTask(task({ deadline: "2026-10-05" }), ctx);
    expect(one.overdue).toBeGreaterThan(0);
    expect(week.overdue).toBe(1);
    expect(week.total).toBeGreaterThan(one.total);
  });

  it("matches weak topics by subject and topic, ignoring case", () => {
    const s = settings({ weakTopics: [{ subject: "physics", topic: "Waves" }] });
    expect(scoreTask(task({ subject: "physics", topic: " waves " }), { ...ctx, settings: s }).weakTopic).toBe(1);
    expect(scoreTask(task({ subject: "maths", topic: "waves" }), { ...ctx, settings: s }).weakTopic).toBe(0);
  });

  it("only counts goals for this week that are unfinished", () => {
    const g: Goal = { id: "g", weekStart: "2026-10-12", type: "homework", target: 1, title: "" };
    const t = task({ goalId: "g" });
    expect(scoreTask(t, { ...ctx, goals: [g], tasks: [t] }).goal).toBe(1);
    const done = task({ id: "z", goalId: "g", status: "done" });
    expect(scoreTask(t, { ...ctx, goals: [g], tasks: [t, done] }).goal).toBe(0);
    expect(scoreTask(t, { ...ctx, goals: [{ ...g, weekStart: "2026-10-05" }], tasks: [t] }).goal).toBe(0);
  });

  it("respects custom weights", () => {
    const onlyImportance = settings({
      weights: { deadline: 0, overdue: 0, importance: 1, weakTopic: 0, goal: 0, carryOver: 0 },
    });
    expect(scoreTask(task({ importance: 5 }), { ...ctx, settings: onlyImportance }).total).toBe(100);
  });
});

describe("planDay", () => {
  it("places higher-scored tasks first with breaks between chunks", () => {
    const tasks = [task({ id: "low", importance: 1 }), task({ id: "high", importance: 5 })];
    const { blocks } = planDay(input({ tasks }));
    expect(blocks.map((b) => [b.taskId, b.start, b.end])).toEqual([
      ["high", "16:00", "16:50"],
      ["low", "17:00", "17:50"],
    ]);
  });

  it("splits a long splittable task into focus-length chunks", () => {
    const { blocks, unscheduled } = planDay(input({ tasks: [task({ estimateMin: 120 })] }));
    expect(blocks.map((b) => [b.start, b.end])).toEqual([
      ["16:00", "16:50"],
      ["17:00", "17:50"],
      ["18:00", "18:20"],
    ]);
    expect(unscheduled).toEqual([]);
  });

  it("works around fixed events", () => {
    const { blocks } = planDay(input({ events: [event()], tasks: [task({ estimateMin: 100 })] }));
    expect(blocks.map((b) => [b.start, b.end])).toEqual([
      ["16:00", "16:50"],
      ["18:10", "19:00"],
    ]);
  });

  it("reports a non-splittable task that fits no window", () => {
    const { blocks, unscheduled } = planDay(
      input({ events: [event()], tasks: [task({ estimateMin: 180, splittable: false })] }),
    );
    expect(blocks).toEqual([]);
    expect(unscheduled).toMatchObject([{ reason: "too_long", remainingMin: 180 }]);
  });

  it("places a non-splittable task as one block longer than focusMin", () => {
    const { blocks } = planDay(input({ tasks: [task({ estimateMin: 90, splittable: false })] }));
    expect(blocks.map((b) => [b.start, b.end])).toEqual([["16:00", "17:30"]]);
  });

  it("skips gaps shorter than minChunkMin", () => {
    // free: 16:00-16:20 (20 min) then 17:30-20:00
    const ev = event({ start: "16:30", end: "17:20" });
    const { blocks } = planDay(input({ events: [ev], tasks: [task({ estimateMin: 50, minChunkMin: 30 })] }));
    expect(blocks.map((b) => b.start)).toEqual(["17:30"]);
  });

  it("allows a short final chunk that finishes the task", () => {
    const { blocks } = planDay(input({ tasks: [task({ estimateMin: 60, minChunkMin: 25 })] }));
    expect(blocks.map((b) => [b.start, b.end])).toEqual([
      ["16:00", "16:50"],
      ["17:00", "17:10"],
    ]);
  });

  it("stops at the daily study limit and says so", () => {
    const { blocks, unscheduled } = planDay(
      input({ settings: settings({ maxDailyStudyMin: 60 }), tasks: [task({ id: "a" }), task({ id: "b" })] }),
    );
    expect(blocks.map((b) => b.taskId)).toEqual(["a"]);
    expect(unscheduled).toMatchObject([{ task: { id: "b" }, reason: "daily_limit", remainingMin: 50 }]);
  });

  it("reports a task that was only partly scheduled", () => {
    const { blocks, unscheduled } = planDay(
      input({ settings: settings({ maxDailyStudyMin: 80 }), tasks: [task({ id: "a" }), task({ id: "b" })] }),
    );
    expect(blocks.map((b) => [b.taskId, b.start, b.end])).toEqual([
      ["a", "16:00", "16:50"],
      ["b", "17:00", "17:30"],
    ]);
    expect(unscheduled).toMatchObject([{ task: { id: "b" }, reason: "partial", remainingMin: 20 }]);
  });

  it("counts already-studied time against the daily limit", () => {
    const done: PlanBlock = { id: "d", taskId: "x", date: "2026-10-17", start: "06:00", end: "07:00", status: "done" };
    const { unscheduled } = planDay(
      input({ settings: settings({ maxDailyStudyMin: 60 }), blocks: [done], tasks: [task()] }),
    );
    expect(unscheduled).toMatchObject([{ reason: "daily_limit", remainingMin: 50 }]);
  });

  it("says no_free_time on a day without study windows", () => {
    const { unscheduled } = planDay(input({ settings: settings({ studyWindows: [] }), tasks: [task()] }));
    expect(unscheduled).toMatchObject([{ reason: "no_free_time" }]);
  });

  it("only plans the remaining minutes of a partly done task", () => {
    const done: PlanBlock = { id: "d", taskId: "t1", date: "2026-10-16", start: "16:00", end: "16:30", status: "done" };
    const { blocks } = planDay(input({ blocks: [done], tasks: [task({ estimateMin: 50 })] }));
    expect(blocks.map((b) => [b.start, b.end])).toEqual([["16:00", "16:20"]]);
  });

  it("ignores done and deferred tasks", () => {
    const { blocks, ranked } = planDay(
      input({ tasks: [task({ id: "a", status: "done" }), task({ id: "b", status: "deferred" })] }),
    );
    expect(blocks).toEqual([]);
    expect(ranked).toEqual([]);
  });

  it("plans from now (rounded up to 5 minutes) when planning today", () => {
    const now = new Date(2026, 9, 17, 17, 2);
    const { blocks } = planDay(input({ now, tasks: [task()] }));
    expect(blocks[0]?.start).toBe("17:05");
  });

  it("breaks score ties by deadline, then id", () => {
    const tasks = [task({ id: "b" }), task({ id: "a" })];
    expect(planDay(input({ tasks })).blocks.map((b) => b.taskId)).toEqual(["a", "b"]);
  });

  it("is deterministic and does not mutate its input", () => {
    const i = input({ events: [event()], tasks: [task({ id: "a", estimateMin: 120 }), task({ id: "b" })] });
    const copy = JSON.stringify(i);
    expect(planDay(i)).toEqual(planDay(i));
    expect(JSON.stringify(i)).toBe(copy);
  });
});

describe("applyPlan", () => {
  it("replaces that day's planned blocks and keeps the rest", () => {
    const existing: PlanBlock[] = [
      { id: "old", taskId: "t", date: "2026-10-17", start: "16:00", end: "17:00", status: "planned" },
      { id: "done", taskId: "t", date: "2026-10-17", start: "06:00", end: "07:00", status: "done" },
      { id: "other", taskId: "t", date: "2026-10-18", start: "16:00", end: "17:00", status: "planned" },
    ];
    const fresh: PlanBlock = { id: "new", taskId: "t", date: "2026-10-17", start: "18:00", end: "19:00", status: "planned" };
    expect(applyPlan(existing, DATE, [fresh]).map((b) => b.id)).toEqual(["done", "other", "new"]);
  });
});
