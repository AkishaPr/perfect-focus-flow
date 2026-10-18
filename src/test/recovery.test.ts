import { describe, expect, it } from "vitest";
import { generatePlan } from "@/lib/planner";
import {
  applyRecovery,
  buildReview,
  closeStaleBlocks,
  resolveMissedState,
  snapshotDay,
  type DayPlan,
} from "@/lib/planner/recovery";
import { at, makeBlock, makeInput, makeSession, makeTask } from "./planner-fixtures";

const NOW = at(20, 9, 0); // Tuesday 20 Oct, 09:00
const TODAY = "2026-10-20";
const YESTERDAY = "2026-10-19";

const plan = (items: [string, number][], date = YESTERDAY): DayPlan => ({
  date,
  items: items.map(([taskId, plannedMin]) => ({ taskId, plannedMin })),
});

/** A session on 19 Oct (local time, so the test doesn't depend on the machine's timezone). */
const studiedYesterday = (taskId: string, actualMin: number, over = {}) =>
  makeSession({
    id: `s-${taskId}-${actualMin}`,
    taskId,
    start: new Date(2026, 9, 19, 17, 0).toISOString(),
    end: new Date(2026, 9, 19, 18, 0).toISOString(),
    actualMin,
    ...over,
  });

const data = (over: Partial<Parameters<typeof buildReview>[1]> = {}) => ({
  tasks: [],
  blocks: [],
  sessions: [],
  ...over,
});

describe("snapshotDay", () => {
  it("records the minutes the plan gave each task on that day", () => {
    const a = makeTask({ id: "a", estimateMin: 120 });
    const b = makeTask({ id: "b", estimateMin: 30 });
    const p = generatePlan(makeInput({ now: at(19, 9, 0), tasks: [a, b] }));
    const snap = snapshotDay(p, "2026-10-19")!;
    expect(snap.date).toBe("2026-10-19");
    expect(snap.items.map((i) => i.taskId)).toEqual(["a", "b"]);
    expect(snap.items.find((i) => i.taskId === "a")?.plannedMin).toBe(120);
    expect(snap.items.find((i) => i.taskId === "b")?.plannedMin).toBe(30);
  });

  it("is null when nothing was planned that day", () => {
    const p = generatePlan(makeInput({ now: at(19, 9, 0), tasks: [] }));
    expect(snapshotDay(p, "2026-10-19")).toBeNull();
  });

  it("only counts the requested day", () => {
    const t = makeTask({ id: "a", estimateMin: 600 }); // spills over several days
    const p = generatePlan(makeInput({ now: at(19, 9, 0), tasks: [t] }));
    const snap = snapshotDay(p, "2026-10-19")!;
    expect(snap.items[0]!.plannedMin).toBeLessThan(600);
  });
});

describe("buildReview", () => {
  it("lists a planned task that got none of its time", () => {
    const t = makeTask({ id: "a", title: "Integration" });
    const r = buildReview([plan([["a", 60]])], data({ tasks: [t] }), TODAY);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({
      days: [YESTERDAY],
      plannedMin: 60,
      studiedMin: 0,
      stuck: false,
    });
    expect(r.items[0]!.task.id).toBe("a");
    expect(r.pastDates).toEqual([YESTERDAY]);
  });

  it("counts a task as fine once it got half its planned time", () => {
    const t = makeTask({ id: "a" });
    const sessions = [studiedYesterday("a", 30)];
    expect(buildReview([plan([["a", 60]])], data({ tasks: [t], sessions }), TODAY).items).toEqual(
      [],
    );
    const under = [studiedYesterday("a", 29)];
    expect(
      buildReview([plan([["a", 60]])], data({ tasks: [t], sessions: under }), TODAY).items,
    ).toHaveLength(1);
  });

  it("counts finished blocks without sessions, but never both (single study-time definition)", () => {
    const t = makeTask({ id: "a" });
    const block = makeBlock({
      id: "b1",
      taskId: "a",
      date: YESTERDAY,
      start: "16:00",
      end: "16:40",
      status: "done",
    });
    // block alone: 40 of 60 planned min → fine
    expect(
      buildReview([plan([["a", 60]])], data({ tasks: [t], blocks: [block] }), TODAY).items,
    ).toEqual([]);
    // the same block plus the session that produced it: 20 min counted once, not 60
    const linked = studiedYesterday("a", 20, { blockId: "b1" });
    const r = buildReview(
      [plan([["a", 60]])],
      data({ tasks: [t], blocks: [block], sessions: [linked] }),
      TODAY,
    );
    expect(r.items[0]?.studiedMin).toBe(20);
  });

  it("ignores done, deferred and deleted tasks", () => {
    const tasks = [
      makeTask({ id: "done", status: "done" }),
      makeTask({ id: "later", status: "deferred" }),
    ];
    const logs = [
      plan([
        ["done", 60],
        ["later", 60],
        ["gone", 60],
      ]),
    ];
    expect(buildReview(logs, data({ tasks }), TODAY).items).toEqual([]);
  });

  it("never reviews today's own snapshot", () => {
    const t = makeTask({ id: "a" });
    const r = buildReview([plan([["a", 60]], TODAY)], data({ tasks: [t] }), TODAY);
    expect(r.items).toEqual([]);
    expect(r.pastDates).toEqual([]);
  });

  it("lists a task missed on several days once, with every day", () => {
    const t = makeTask({ id: "a" });
    const logs = [plan([["a", 60]], "2026-10-18"), plan([["a", 45]], YESTERDAY)];
    const r = buildReview(logs, data({ tasks: [t] }), TODAY);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ days: ["2026-10-18", YESTERDAY], plannedMin: 105 });
  });

  it("flags tasks one carry-over away from stuck, and lists them first", () => {
    const calm = makeTask({ id: "calm", title: "A calm one", carryOverCount: 0 });
    const risky = makeTask({ id: "risky", title: "Z risky", carryOverCount: 2 });
    const r = buildReview(
      [
        plan([
          ["calm", 90],
          ["risky", 30],
        ]),
      ],
      data({ tasks: [calm, risky] }),
      TODAY,
    );
    expect(r.items.map((i) => [i.task.id, i.stuck])).toEqual([
      ["risky", true],
      ["calm", false],
    ]);
  });

  it("puts more days missed, then more minutes missed, first", () => {
    const tasks = ["a", "b", "c"].map((id) => makeTask({ id, title: id }));
    const logs = [
      plan(
        [
          ["a", 30],
          ["b", 90],
          ["c", 30],
        ],
        "2026-10-18",
      ),
      plan([["c", 30]], YESTERDAY),
    ];
    const r = buildReview(logs, data({ tasks }), TODAY);
    expect(r.items.map((i) => i.task.id)).toEqual(["c", "b", "a"]);
  });
});

describe("applyRecovery", () => {
  const state = () => ({
    tasks: [
      makeTask({ id: "todo", status: "todo", carryOverCount: 0 }),
      makeTask({ id: "doing", status: "in_progress", carryOverCount: 1 }),
      makeTask({ id: "other", status: "todo" }),
    ],
    blocks: [
      makeBlock({ id: "p1", taskId: "todo", status: "planned" }),
      makeBlock({ id: "h1", taskId: "todo", status: "done" }),
      makeBlock({ id: "p2", taskId: "other", status: "planned" }),
    ],
  });
  const task = (s: ReturnType<typeof state>, id: string) => s.tasks.find((t) => t.id === id)!;

  it("carry: bumps the count and flags a to-do task as missed, leaving others alone", () => {
    const next = applyRecovery(
      state(),
      [
        { taskId: "todo", action: "carry" },
        { taskId: "doing", action: "carry" },
      ],
      NOW,
    );
    expect(task(next, "todo")).toMatchObject({ carryOverCount: 1, status: "missed" });
    expect(task(next, "doing")).toMatchObject({ carryOverCount: 2, status: "in_progress" });
    expect(task(next, "other")).toMatchObject({ carryOverCount: 0, status: "todo" });
    expect(next.blocks).toHaveLength(3); // carrying over keeps pinned blocks
  });

  it("carry: does not touch the status of an already-missed task", () => {
    const s = state();
    s.tasks[0] = makeTask({ id: "todo", status: "missed", carryOverCount: 1 });
    expect(
      task(applyRecovery(s, [{ taskId: "todo", action: "carry" }], NOW), "todo"),
    ).toMatchObject({
      carryOverCount: 2,
      status: "missed",
    });
  });

  it("skip: changes nothing", () => {
    const s = state();
    expect(applyRecovery(s, [{ taskId: "todo", action: "skip" }], NOW)).toEqual(s);
  });

  it("defer: takes the task out of planning and drops only its pinned blocks", () => {
    const next = applyRecovery(state(), [{ taskId: "todo", action: "defer" }], NOW);
    expect(task(next, "todo").status).toBe("deferred");
    expect(next.blocks.map((b) => b.id).sort()).toEqual(["h1", "p2"]); // history and other tasks stay
  });

  it("done: stamps completion and drops its pinned blocks", () => {
    const next = applyRecovery(state(), [{ taskId: "todo", action: "done" }], NOW);
    expect(task(next, "todo")).toMatchObject({ status: "done", completedAt: NOW.toISOString() });
    expect(next.blocks.some((b) => b.id === "p1")).toBe(false);
  });

  it("leaves tasks without a decision exactly as they were", () => {
    const s = state();
    expect(applyRecovery(s, [], NOW)).toEqual(s);
  });
});

describe("closeStaleBlocks", () => {
  const tasks = [
    makeTask({ id: "idle", status: "todo" }),
    makeTask({ id: "doing", status: "in_progress" }),
  ];

  it("marks passed pinned blocks missed unless their task is in progress", () => {
    const blocks = [
      makeBlock({ id: "old-idle", taskId: "idle", date: YESTERDAY }),
      makeBlock({ id: "old-doing", taskId: "doing", date: YESTERDAY }),
      makeBlock({ id: "old-gone", taskId: "deleted", date: YESTERDAY }),
      makeBlock({ id: "later-today", taskId: "idle", date: TODAY, start: "16:00", end: "17:00" }),
      makeBlock({ id: "earlier-today", taskId: "idle", date: TODAY, start: "07:00", end: "08:00" }),
      makeBlock({ id: "finished", taskId: "idle", date: YESTERDAY, status: "done" }),
    ];
    const status = Object.fromEntries(
      closeStaleBlocks(blocks, tasks, NOW).map((b) => [b.id, b.status]),
    );
    expect(status).toEqual({
      "old-idle": "missed",
      "old-doing": "planned",
      "old-gone": "missed",
      "later-today": "planned",
      "earlier-today": "missed",
      finished: "done",
    });
  });

  it("returns the same array when there is nothing to close", () => {
    const blocks = [
      makeBlock({ id: "x", taskId: "idle", date: TODAY, start: "16:00", end: "17:00" }),
    ];
    expect(closeStaleBlocks(blocks, tasks, NOW)).toBe(blocks);
  });
});

describe("resolveMissedState", () => {
  it("applies the choices and closes stale blocks together", () => {
    const next = resolveMissedState(
      {
        tasks: [makeTask({ id: "a" }), makeTask({ id: "b" })],
        blocks: [
          makeBlock({ id: "a-old", taskId: "a", date: YESTERDAY }),
          makeBlock({ id: "b-old", taskId: "b", date: YESTERDAY }),
        ],
      },
      [{ taskId: "a", action: "defer" }],
      NOW,
    );
    expect(next.tasks.find((t) => t.id === "a")?.status).toBe("deferred");
    expect(next.blocks.map((b) => [b.id, b.status])).toEqual([["b-old", "missed"]]);
  });
});
