import { describe, expect, it } from "vitest";
import { toMin } from "../calendar";
import { defaultSettings } from "../store";
import type { CalEvent, Goal, PlanBlock, Settings, Task } from "../types";
import {
  diffPlan,
  freeWindows,
  intersect,
  mergePlan,
  normalize,
  planDay,
  planRange,
  rankTasks,
  scoreTask,
  subtract,
  type DayPlan,
} from "./index";

// 2026-10-19 is a Monday.
const MON = new Date(2026, 9, 19);
const TUE = new Date(2026, 9, 20);

const settings = (patch: Partial<Settings> = {}): Settings => ({
  ...defaultSettings(),
  studyWindows: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, start: "16:00", end: "20:00" })),
  focusMin: 50,
  breakMin: 10,
  maxDailyStudyMin: 600,
  ...patch,
});

let n = 0;
const task = (patch: Partial<Task> = {}): Task => ({
  id: `t${String(++n).padStart(3, "0")}`,
  title: "Task",
  subject: "maths",
  topic: "",
  type: "homework",
  estimateMin: 60,
  importance: 3,
  splittable: true,
  minChunkMin: 25,
  status: "todo",
  carryOverCount: 0,
  createdAt: "2026-10-01T00:00:00.000Z",
  ...patch,
});

const event = (patch: Partial<CalEvent> = {}): CalEvent => ({
  id: `e${++n}`,
  title: "Class",
  kind: "class",
  mode: "physical",
  recurrence: "none",
  date: "2026-10-19",
  start: "17:00",
  end: "18:00",
  ...patch,
});

const plan = (tasks: Task[], extra: Partial<Parameters<typeof planDay>[0]> = {}): DayPlan =>
  planDay({ date: MON, settings: settings(), events: [], tasks, goals: [], blocks: [], ...extra });

const span = (b: PlanBlock) => ({ start: toMin(b.start), end: toMin(b.end) });
const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) =>
  a.start < b.end && b.start < a.end;

describe("intervals", () => {
  it("normalizes by merging overlapping and touching ranges", () => {
    expect(normalize([{ start: 50, end: 60 }, { start: 0, end: 10 }, { start: 10, end: 20 }, { start: 55, end: 70 }])).toEqual([
      { start: 0, end: 20 },
      { start: 50, end: 70 },
    ]);
  });

  it("intersects two lists", () => {
    expect(intersect([{ start: 0, end: 100 }], [{ start: 20, end: 30 }, { start: 90, end: 120 }])).toEqual([
      { start: 20, end: 30 },
      { start: 90, end: 100 },
    ]);
  });

  it("subtracts cuts, including ones at the edges", () => {
    expect(subtract([{ start: 0, end: 100 }], [{ start: -10, end: 10 }, { start: 40, end: 50 }, { start: 95, end: 200 }])).toEqual([
      { start: 10, end: 40 },
      { start: 50, end: 95 },
    ]);
  });
});

describe("freeWindows", () => {
  it("subtracts events with a buffer on each side", () => {
    const free = freeWindows(MON, settings(), [event()], [], { bufferMin: 10 });
    expect(free).toEqual([
      { start: toMin("16:00"), end: toMin("16:50") },
      { start: toMin("18:10"), end: toMin("20:00") },
    ]);
  });

  it("applies weekly events on their weekday only", () => {
    const { date: _date, ...base } = event({ recurrence: "weekly", weekday: 2 });
    const weekly: CalEvent = base;
    expect(freeWindows(MON, settings(), [weekly], [])).toEqual([{ start: 960, end: 1200 }]);
    expect(freeWindows(TUE, settings(), [weekly], [])).toHaveLength(2);
  });

  it("clips study windows to wake and sleep", () => {
    const s = settings({ wake: "17:00", sleep: "19:00" });
    expect(freeWindows(MON, s, [], [])).toEqual([{ start: 1020, end: 1140 }]);
  });

  it("removes completed blocks and time already passed", () => {
    const done: PlanBlock = { id: "b", taskId: "x", date: "2026-10-19", start: "18:00", end: "19:00", status: "done" };
    expect(freeWindows(MON, settings(), [], [done], { nowMin: toMin("16:30") })).toEqual([
      { start: 990, end: 1080 },
      { start: 1140, end: 1200 },
    ]);
  });

  it("merges overlapping events and drops unusable slivers", () => {
    const a = event({ start: "16:05", end: "17:00" });
    const b = event({ start: "16:30", end: "19:57" });
    expect(freeWindows(MON, settings(), [a, b], [], { bufferMin: 0 })).toEqual([]);
  });

  it("returns nothing on a day without study windows", () => {
    const s = settings({ studyWindows: [{ day: 2, start: "16:00", end: "20:00" }] });
    expect(freeWindows(MON, s, [], [])).toEqual([]);
  });
});

describe("scoring", () => {
  const ctx = { date: MON, settings: settings(), goals: [] as Goal[], tasks: [] as Task[] };

  it("scores higher for nearer deadlines", () => {
    const soon = scoreTask(task({ deadline: "2026-10-20" }), ctx);
    const later = scoreTask(task({ deadline: "2026-10-30" }), ctx);
    expect(soon.factors.deadline.points).toBeGreaterThan(later.factors.deadline.points);
  });

  it("gives full deadline and growing overdue points once past due", () => {
    const s1 = scoreTask(task({ deadline: "2026-10-18" }), ctx);
    const s4 = scoreTask(task({ deadline: "2026-10-15" }), ctx);
    expect(s1.factors.deadline.raw).toBe(1);
    expect(s1.daysOverdue).toBe(1);
    expect(s4.factors.overdue.points).toBeGreaterThan(s1.factors.overdue.points);
    expect(scoreTask(task({ deadline: "2026-09-01" }), ctx).factors.overdue.raw).toBe(1);
  });

  it("matches weak topics by subject and topic, ignoring case", () => {
    const s = settings({ weakTopics: [{ subject: "physics", topic: "Waves" }] });
    expect(scoreTask(task({ subject: "physics", topic: " waves" }), { ...ctx, settings: s }).weakMatch).toBe(true);
    expect(scoreTask(task({ subject: "maths", topic: "waves" }), { ...ctx, settings: s }).weakMatch).toBe(false);
  });

  it("only counts goals for this week that are not yet met", () => {
    const g: Goal = { id: "g", weekStart: "2026-10-19", type: "paper", target: 1, title: "1 paper" };
    const old: Goal = { ...g, id: "old", weekStart: "2026-10-12" };
    const t = task({ goalId: "g" });
    expect(scoreTask(t, { ...ctx, goals: [g, old], tasks: [t] }).goal?.id).toBe("g");
    expect(scoreTask(task({ goalId: "old" }), { ...ctx, goals: [g, old] }).goal).toBeNull();
    const met = [t, task({ goalId: "g", status: "done" })];
    expect(scoreTask(t, { ...ctx, goals: [g], tasks: met }).goal).toBeNull();
  });

  it("respects configured weights, including zero", () => {
    const s = settings({ weights: { deadline: 0, overdue: 0, importance: 100, weakTopic: 0, goal: 0, carryOver: 0 } });
    const r = scoreTask(task({ importance: 5, deadline: "2026-10-19" }), { ...ctx, settings: s });
    expect(r.total).toBe(100);
    expect(r.normalized).toBe(100);
    expect(r.factors.deadline.points).toBe(0);
  });

  it("ranks deterministically with deadline then id tie-breaks", () => {
    const a = task({ id: "b-task", deadline: "2026-11-01", importance: 1 });
    const b = task({ id: "a-task", importance: 1 });
    const c = task({ id: "c-task", deadline: "2026-11-01", importance: 1 });
    const s = settings({ weights: { deadline: 0, overdue: 0, importance: 10, weakTopic: 0, goal: 0, carryOver: 0 } });
    const order = rankTasks([b, c, a], { ...ctx, settings: s }).map((r) => r.task.id);
    expect(order).toEqual(["b-task", "c-task", "a-task"]);
    expect(rankTasks([a, c, b], { ...ctx, settings: s }).map((r) => r.task.id)).toEqual(order);
  });

  it("excludes done and deferred tasks", () => {
    const ids = rankTasks([task({ status: "done" }), task({ status: "deferred" }), task({ id: "open" })], ctx).map((r) => r.task.id);
    expect(ids).toEqual(["open"]);
  });
});

describe("planDay", () => {
  it("never overlaps events, breaks or other blocks", () => {
    const ev = event();
    const p = plan([task({ estimateMin: 120 }), task({ estimateMin: 90 }), task({ estimateMin: 30, splittable: false })], { events: [ev] });
    const busy = { start: toMin(ev.start) - 10, end: toMin(ev.end) + 10 };
    const spans = p.blocks.map(span);
    for (const s of spans) expect(overlaps(s, busy)).toBe(false);
    for (let i = 0; i < spans.length; i++)
      for (let j = i + 1; j < spans.length; j++) expect(overlaps(spans[i]!, spans[j]!)).toBe(false);
    for (const b of p.breaks) for (const s of spans) expect(overlaps(s, b)).toBe(false);
  });

  it("splits into focus-length chunks with breaks, reshaping so no chunk falls below the minimum", () => {
    const p = plan([task({ estimateMin: 120 })]);
    expect(p.blocks.map((b) => `${b.start}-${b.end}`)).toEqual(["16:00-16:50", "17:00-17:45", "17:55-18:20"]);
    expect(p.breaks).toHaveLength(2);
  });

  it("does not leave a remainder smaller than the minimum chunk", () => {
    const p = plan([task({ estimateMin: 60, minChunkMin: 25 })]);
    const lens = p.blocks.map((b) => toMin(b.end) - toMin(b.start));
    expect(lens).toEqual([35, 25]);
  });

  it("keeps non-splittable tasks whole and reports too_long when no window fits", () => {
    const p = plan([task({ estimateMin: 300, splittable: false })]);
    expect(p.blocks).toHaveLength(0);
    expect(p.unscheduled[0]?.reason).toBe("too_long");
  });

  it("stops at the daily study limit and says so", () => {
    const p = plan([task({ estimateMin: 200 }), task({ estimateMin: 60, splittable: false })], {
      settings: settings({ maxDailyStudyMin: 120 }),
    });
    // 50 + 50 placed; the last 20 min of cap cannot host a 25-min minimum chunk.
    expect(p.plannedMin).toBe(100);
    const reasons = p.unscheduled.map((u) => u.reason).sort();
    expect(reasons).toEqual(["daily_cap", "partial"]);
  });

  it("counts already completed work against the daily limit", () => {
    const done: PlanBlock = { id: "d", taskId: "zz", date: "2026-10-19", start: "16:00", end: "17:00", status: "done" };
    const p = plan([task({ estimateMin: 200 })], { blocks: [done], settings: settings({ maxDailyStudyMin: 90 }) });
    expect(p.capacityMin).toBe(30);
    expect(p.plannedMin).toBe(30);
  });

  it("reports no_free_time when the day has no windows", () => {
    const p = plan([task()], { settings: settings({ studyWindows: [] }) });
    expect(p.unscheduled[0]?.reason).toBe("no_free_time");
  });

  it("places higher-scored tasks first", () => {
    const low = task({ id: "low", importance: 1 });
    const high = task({ id: "high", importance: 5, deadline: "2026-10-19" });
    const p = plan([low, high]);
    expect(p.blocks[0]?.taskId).toBe("high");
  });

  it("only plans the remaining part of a partly done task", () => {
    const t = task({ estimateMin: 90 });
    const done: PlanBlock = { id: "d", taskId: t.id, date: "2026-10-18", start: "16:00", end: "17:00", status: "done" };
    const p = plan([t], { blocks: [done] });
    expect(p.plannedMin).toBe(30);
  });

  it("never drops a task: every open task is planned or listed as unscheduled", () => {
    const tasks = Array.from({ length: 12 }, (_, i) =>
      task({ estimateMin: 30 + i * 15, splittable: i % 2 === 0, importance: (i % 5) + 1 }),
    );
    const p = plan(tasks);
    const planned = new Set(p.blocks.map((b) => b.taskId));
    const listed = new Set(p.unscheduled.map((u) => u.task.id));
    for (const t of tasks) expect(planned.has(t.id) || listed.has(t.id)).toBe(true);
  });

  it("is deterministic", () => {
    const tasks = [task({ estimateMin: 75 }), task({ estimateMin: 40, splittable: false }), task({ estimateMin: 100 })];
    expect(plan(tasks)).toEqual(plan(tasks));
  });
});

describe("planRange", () => {
  it("carries leftover minutes into the following days", () => {
    const t = task({ estimateMin: 400 });
    const r = planRange({ start: MON, days: 3, settings: settings(), events: [], tasks: [t], goals: [], blocks: [] });
    const perDay = r.days.map((d) => d.plannedMin);
    expect(perDay[0]).toBeGreaterThan(0);
    expect(perDay[1]).toBeGreaterThan(0);
    expect(r.plannedMin).toBe(400);
    expect(r.unscheduled).toHaveLength(0);
  });

  it("only cuts off past time on the current day", () => {
    const now = new Date(2026, 9, 19, 19, 0);
    const r = planRange({ start: MON, days: 2, now, settings: settings(), events: [], tasks: [task({ estimateMin: 600 })], goals: [], blocks: [] });
    expect(r.days[0]!.freeMin).toBe(60);
    expect(r.days[1]!.freeMin).toBe(240);
  });

  it("flags blocks placed after the deadline", () => {
    const t = task({ estimateMin: 400, deadline: "2026-10-19" });
    const r = planRange({ start: MON, days: 3, settings: settings(), events: [], tasks: [t], goals: [], blocks: [] });
    expect(r.late.length).toBeGreaterThan(0);
    expect(r.late.every((l) => l.block.date > "2026-10-19")).toBe(true);
  });

  it("lists what still does not fit at the end of the range", () => {
    const t = task({ estimateMin: 2000 });
    const r = planRange({ start: MON, days: 2, settings: settings(), events: [], tasks: [t], goals: [], blocks: [] });
    expect(r.unscheduled[0]?.reason).toBe("partial");
    expect(r.unscheduled[0]?.remainingMin).toBe(2000 - r.plannedMin);
  });
});

describe("mergePlan and diffPlan", () => {
  const b = (patch: Partial<PlanBlock>): PlanBlock => ({
    id: `b${++n}`,
    taskId: "t",
    date: "2026-10-19",
    start: "16:00",
    end: "17:00",
    status: "planned",
    ...patch,
  });

  it("keeps done, missed, past and out-of-range blocks", () => {
    const now = new Date(2026, 9, 19, 18, 0);
    const done = b({ status: "done" });
    const missed = b({ status: "missed" });
    const past = b({ start: "16:00", end: "17:00" });
    const future = b({ start: "19:00", end: "19:30" });
    const other = b({ date: "2026-10-25" });
    const merged = mergePlan([done, missed, past, future, other], [], ["2026-10-19"], now);
    expect(merged.map((x) => x.id).sort()).toEqual([done.id, missed.id, past.id, other.id].sort());
  });

  it("counts added, removed and unchanged blocks", () => {
    const keep = b({ start: "16:00", end: "16:50" });
    const drop = b({ start: "18:00", end: "18:30" });
    const fresh = b({ start: "19:00", end: "19:50" });
    expect(diffPlan([keep, drop], [{ ...keep, id: "x" }, fresh], ["2026-10-19"])).toEqual({ added: 1, removed: 1, kept: 1 });
  });
});
