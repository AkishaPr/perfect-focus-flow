import { describe, expect, it } from "vitest";
import { findMissedBlocks, generatePlan, type PlanResult } from "@/lib/planner";
import { eventBlocker } from "@/lib/planner/availability";
import { eventsOn, toMin, windowsOn } from "@/lib/calendar";
import type { CalEvent, Subject, Task } from "@/lib/types";
import {
  at,
  dailyWindow,
  makeBlock,
  makeEvent,
  makeInput,
  makeMark,
  makeSession,
  makeSettings,
  makeTask,
  MON_9AM,
} from "./planner-fixtures";

const len = (b: { start: string; end: string }) => toMin(b.end) - toMin(b.start);
const minutesFor = (plan: PlanResult, taskId: string) =>
  plan.blocks.filter((b) => b.taskId === taskId).reduce((s, b) => s + len(b), 0);
const blocksFor = (plan: PlanResult, taskId: string) =>
  plan.blocks.filter((b) => b.taskId === taskId);

describe("generatePlan: basics", () => {
  it("plans nothing, and says why, when there are no study windows", () => {
    const plan = generatePlan(
      makeInput({ settings: makeSettings(), tasks: [makeTask({ id: "a" })] }),
    );
    expect(plan.blocks).toEqual([]);
    expect(plan.warnings.map((w) => w.code)).toContain("no-study-windows");
    expect(plan.unscheduled.map((u) => u.taskId)).toEqual(["a"]);
    expect(plan.unscheduled[0]?.reason).toBe("not-enough-time");
  });

  it("puts a task in the earliest free slot and caps a block at the focus length", () => {
    const plan = generatePlan(makeInput({ tasks: [makeTask({ id: "a", estimateMin: 45 })] }));
    expect(plan.blocks).toHaveLength(1);
    expect(plan.blocks[0]).toMatchObject({
      taskId: "a",
      date: "2026-10-19",
      start: "16:00",
      end: "16:45",
      status: "planned",
      locked: false,
    });
    expect(plan.blocks[0]?.reasons.length).toBeGreaterThan(0);
  });

  it("splits long work into focus blocks with breaks and never leaves a sliver", () => {
    const plan = generatePlan(
      makeInput({ tasks: [makeTask({ id: "a", estimateMin: 120, minChunkMin: 25 })] }),
    );
    const blocks = blocksFor(plan, "a");
    expect(blocks.map(len)).toEqual([50, 70]); // 50 + 70, not 50 + 50 + 20
    expect(blocks[1]?.start).toBe("17:00"); // 16:00 + 50 + 10 break
    expect(minutesFor(plan, "a")).toBe(120);
  });

  it("does not strand a sliver when the task is just over the focus length", () => {
    const plan = generatePlan(makeInput({ tasks: [makeTask({ id: "a", estimateMin: 60 })] }));
    expect(blocksFor(plan, "a").map(len)).toEqual([60]);
  });

  it("subtracts logged sessions from what's left to plan", () => {
    const t = makeTask({ id: "a", estimateMin: 120 });
    const plan = generatePlan(
      makeInput({ tasks: [t], sessions: [makeSession({ taskId: "a", actualMin: 90 })] }),
    );
    expect(minutesFor(plan, "a")).toBe(30);
  });

  it("ignores done tasks, reports deferred ones, and flags a used-up estimate", () => {
    const done = makeTask({ id: "d", status: "done" });
    const deferred = makeTask({ id: "f", status: "deferred" });
    const spent = makeTask({ id: "s", estimateMin: 60 });
    const plan = generatePlan(
      makeInput({
        tasks: [done, deferred, spent],
        sessions: [makeSession({ taskId: "s", actualMin: 60 })],
      }),
    );
    expect(plan.blocks).toEqual([]);
    expect(plan.unscheduled.find((u) => u.taskId === "f")?.reason).toBe("deferred");
    expect(plan.unscheduled.find((u) => u.taskId === "s")?.reason).toBe("estimate-used-up");
    expect(plan.unscheduled.some((u) => u.taskId === "d")).toBe(false);
    expect(plan.warnings.map((w) => w.code)).toContain("estimate-used-up");
  });

  it("asks for an estimate instead of planning a zero-minute task", () => {
    const plan = generatePlan(makeInput({ tasks: [makeTask({ id: "z", estimateMin: 0 })] }));
    expect(plan.unscheduled[0]?.reason).toBe("no-estimate");
    expect(plan.warnings[0]?.code).toBe("no-estimate");
  });

  it("flags tasks carried over three or more times as stuck", () => {
    const plan = generatePlan(makeInput({ tasks: [makeTask({ id: "a", carryOverCount: 3 })] }));
    expect(plan.warnings.some((w) => w.code === "stuck" && w.taskId === "a")).toBe(true);
  });
});

describe("generatePlan: protecting fixed time", () => {
  it("never schedules over a class or its travel buffer", () => {
    const tasks = Array.from({ length: 8 }, (_, i) =>
      makeTask({
        id: `t${i}`,
        estimateMin: 90,
        subject: (["maths", "physics", "ict"] as const)[i % 3]!,
      }),
    );
    const plan = generatePlan(
      makeInput({ tasks, events: [makeEvent({ start: "17:00", end: "18:30" })] }),
    );
    const monday = plan.blocks.filter((b) => b.date === "2026-10-19");
    expect(monday.length).toBeGreaterThan(0);
    for (const b of monday) {
      // class 17:00–18:30 + 30 min buffer each side = 16:30–19:00 is off limits
      expect(toMin(b.end) <= toMin("16:30") || toMin(b.start) >= toMin("19:00")).toBe(true);
    }
  });

  it("schedules after the clock, never in the past", () => {
    const plan = generatePlan(makeInput({ now: at(19, 17, 12), tasks: [makeTask({ id: "a" })] }));
    expect(plan.blocks[0]).toMatchObject({ date: "2026-10-19", start: "17:15" });
  });

  it("moves to tomorrow when today's windows are over", () => {
    const plan = generatePlan(makeInput({ now: at(19, 22, 0), tasks: [makeTask({ id: "a" })] }));
    expect(plan.blocks[0]).toMatchObject({ date: "2026-10-20", start: "16:00" });
  });

  it("keeps locked blocks exactly where they are and plans around them", () => {
    const locked = makeBlock({ id: "pin", taskId: "a", start: "16:00", end: "17:00" });
    const a = makeTask({ id: "a", estimateMin: 60 });
    const b = makeTask({ id: "b", estimateMin: 30 });
    const plan = generatePlan(
      makeInput({ tasks: [a, b], blocks: [locked], options: { lockedBlockIds: ["pin"] } }),
    );
    const pinned = plan.blocks.find((x) => x.id === "pin");
    expect(pinned).toMatchObject({ locked: true, start: "16:00", end: "17:00", taskId: "a" });
    expect(blocksFor(plan, "a")).toHaveLength(1); // its remaining time is already covered
    expect(blocksFor(plan, "b")[0]?.start).toBe("17:00");
  });

  it("throws away stale unlocked 'planned' blocks instead of treating them as fixed", () => {
    const stale = makeBlock({ id: "old", taskId: "a", start: "16:00", end: "17:00" });
    const plan = generatePlan(makeInput({ tasks: [makeTask({ id: "a" })], blocks: [stale] }));
    expect(plan.blocks.some((b) => b.id === "old")).toBe(false);
  });
});

describe("generatePlan: priorities", () => {
  it("does the overdue task first even when another has higher importance", () => {
    const overdue = makeTask({ id: "late", deadline: "2026-10-16", importance: 2 });
    const important = makeTask({ id: "big", importance: 5 });
    const plan = generatePlan(makeInput({ tasks: [important, overdue] }));
    expect(plan.blocks[0]?.taskId).toBe("late");
    expect(plan.ranking[0]?.taskId).toBe("late");
    expect(plan.warnings.some((w) => w.code === "overdue" && w.taskId === "late")).toBe(true);
  });

  it("alternates subjects when scores tie", () => {
    const m1 = makeTask({
      id: "m1",
      subject: "maths",
      estimateMin: 30,
      createdAt: "2026-10-12T08:00:00Z",
    });
    const m2 = makeTask({
      id: "m2",
      subject: "maths",
      estimateMin: 30,
      createdAt: "2026-10-12T08:01:00Z",
    });
    const p1 = makeTask({
      id: "p1",
      subject: "physics",
      estimateMin: 30,
      createdAt: "2026-10-12T08:02:00Z",
    });
    const plan = generatePlan(makeInput({ tasks: [m1, m2, p1] }));
    expect(plan.blocks.map((b) => b.taskId)).toEqual(["m1", "p1", "m2"]);
  });

  it("lets an urgent same-subject task beat the variety penalty", () => {
    const first = makeTask({ id: "a", subject: "maths", estimateMin: 30, importance: 5 });
    const urgent = makeTask({ id: "b", subject: "maths", estimateMin: 30, deadline: "2026-10-19" });
    const other = makeTask({ id: "c", subject: "physics", estimateMin: 30, importance: 1 });
    const plan = generatePlan(makeInput({ tasks: [first, urgent, other] }));
    expect(
      plan.blocks
        .slice(0, 2)
        .map((b) => b.taskId)
        .sort(),
    ).toEqual(["a", "b"]);
  });

  it("leans toward the weaker subject using recent marks", () => {
    const m = makeTask({ id: "m", subject: "maths", estimateMin: 30 });
    const p = makeTask({ id: "p", subject: "physics", estimateMin: 30 });
    const marks = [
      makeMark({ id: "a", subject: "maths", score: 90 }),
      makeMark({ id: "b", subject: "physics", score: 55 }),
    ];
    expect(generatePlan(makeInput({ tasks: [m, p], marks })).blocks[0]?.taskId).toBe("p");
  });

  it("uses the weights from Settings", () => {
    const hi = makeTask({ id: "hi", importance: 5, estimateMin: 30 });
    const dl = makeTask({ id: "dl", importance: 1, deadline: "2026-10-21", estimateMin: 30 });
    const onlyDeadline = makeSettings({
      studyWindows: dailyWindow("16:00", "21:00"),
      weights: { deadline: 1, overdue: 0, importance: 0, weakTopic: 0, goal: 0, carryOver: 0 },
    });
    const onlyImportance = makeSettings({
      studyWindows: dailyWindow("16:00", "21:00"),
      weights: { deadline: 0, overdue: 0, importance: 1, weakTopic: 0, goal: 0, carryOver: 0 },
    });
    expect(
      generatePlan(makeInput({ tasks: [hi, dl], settings: onlyDeadline })).blocks[0]?.taskId,
    ).toBe("dl");
    expect(
      generatePlan(makeInput({ tasks: [hi, dl], settings: onlyImportance })).blocks[0]?.taskId,
    ).toBe("hi");
  });
});

describe("generatePlan: limits and honesty", () => {
  it("keeps each day under maxDailyStudyMin, applying the slack", () => {
    const tasks = [makeTask({ id: "a", estimateMin: 1000 })];
    const tight = generatePlan(
      makeInput({
        tasks,
        settings: makeSettings({
          studyWindows: dailyWindow("08:00", "22:00"),
          maxDailyStudyMin: 120,
        }),
        options: { slackFraction: 0 },
      }),
    );
    for (const d of tight.capacity) expect(d.plannedMin).toBeLessThanOrEqual(120);
    const slack = generatePlan(makeInput({ tasks }));
    expect(slack.capacity[0]?.capMin).toBe(306); // floor(360 × 0.85)
    for (const d of slack.capacity) expect(d.plannedMin).toBeLessThanOrEqual(306);
  });

  it("counts study already done today against today's cap", () => {
    const done = makeBlock({
      id: "d",
      taskId: "x",
      date: "2026-10-19",
      start: "07:00",
      end: "08:30",
      status: "done",
    });
    const plan = generatePlan(
      makeInput({
        tasks: [makeTask({ id: "a", estimateMin: 600 })],
        blocks: [done],
        settings: makeSettings({
          studyWindows: dailyWindow("16:00", "21:00"),
          maxDailyStudyMin: 120,
        }),
        options: { slackFraction: 0 },
      }),
    );
    expect(plan.capacity[0]?.plannedMin).toBe(30); // 120 − 90 already studied
  });

  it("needs one contiguous gap for a task that can't be split", () => {
    const paper = makeTask({ id: "p", type: "paper", estimateMin: 180, splittable: false });
    const ok = generatePlan(makeInput({ tasks: [paper] }));
    expect(blocksFor(ok, "p")).toHaveLength(1);
    expect(len(blocksFor(ok, "p")[0]!)).toBe(180);

    const short = generatePlan(
      makeInput({
        tasks: [paper],
        settings: makeSettings({ studyWindows: dailyWindow("16:00", "18:00") }),
      }),
    );
    expect(short.blocks).toEqual([]);
    expect(short.unscheduled[0]?.reason).toBe("too-long-for-any-slot");
    expect(short.warnings.some((w) => w.code === "too-long-for-any-slot")).toBe(true);
  });

  it("puts a long paper on a day the class doesn't cut up", () => {
    const paper = makeTask({ id: "p", type: "paper", estimateMin: 180, splittable: false });
    const plan = generatePlan(
      makeInput({
        tasks: [paper],
        // class every Monday splits Monday's window; the paper has to move
        events: [makeEvent({ start: "17:30", end: "19:00" })],
      }),
    );
    expect(blocksFor(plan, "p")[0]?.date).toBe("2026-10-20");
  });

  it("never schedules past a deadline and warns loudly when it can't fit", () => {
    const t = makeTask({ id: "a", estimateMin: 120, deadline: "2026-10-19" });
    const plan = generatePlan(makeInput({ now: at(19, 20, 0), tasks: [t] }));
    for (const b of plan.blocks) expect(b.date <= "2026-10-19").toBe(true);
    const left = plan.unscheduled.find((u) => u.taskId === "a");
    expect(left?.reason).toBe("deadline-at-risk");
    expect(minutesFor(plan, "a") + (left?.remainingMin ?? 0)).toBe(120);
    const warning = plan.warnings.find((w) => w.code === "deadline-at-risk");
    expect(warning?.severity).toBe("high");
    expect(plan.warnings[0]?.code).toBe("deadline-at-risk"); // high severity sorts first
  });

  it("reports work that doesn't fit the horizon without calling it a deadline problem", () => {
    const plan = generatePlan(
      makeInput({ tasks: [makeTask({ id: "a", estimateMin: 5000 })], options: { horizonDays: 2 } }),
    );
    const left = plan.unscheduled.find((u) => u.taskId === "a");
    expect(left?.reason).toBe("not-enough-time");
    expect(plan.warnings.some((w) => w.code === "deadline-at-risk")).toBe(false);
  });

  it("reports per-day capacity that matches the blocks", () => {
    const plan = generatePlan(
      makeInput({
        tasks: [makeTask({ id: "a", estimateMin: 200 })],
        events: [makeEvent({ start: "17:00", end: "18:30" })],
      }),
    );
    for (const d of plan.capacity) {
      const sum = plan.blocks.filter((b) => b.date === d.date).reduce((s, b) => s + len(b), 0);
      expect(d.plannedMin).toBe(sum);
      expect(d.freeMin).toBeLessThanOrEqual(d.windowMin);
    }
    expect(plan.capacity).toHaveLength(7);
  });

  it("returns a ranking, best first, with the factors behind each score", () => {
    const plan = generatePlan(
      makeInput({
        tasks: [makeTask({ id: "low", importance: 1 }), makeTask({ id: "high", importance: 5 })],
      }),
    );
    expect(plan.ranking.map((r) => r.taskId)).toEqual(["high", "low"]);
    expect(plan.ranking[0]?.factors.importance).toBe(1);
  });
});

describe("findMissedBlocks", () => {
  it("returns planned blocks that ended before now, and nothing else", () => {
    const blocks = [
      makeBlock({ id: "yesterday", date: "2026-10-18" }),
      makeBlock({ id: "earlier-today", date: "2026-10-19", start: "07:00", end: "08:00" }),
      makeBlock({ id: "later-today", date: "2026-10-19", start: "16:00", end: "17:00" }),
      makeBlock({ id: "done", date: "2026-10-18", status: "done" }),
      makeBlock({ id: "tomorrow", date: "2026-10-20" }),
    ];
    expect(findMissedBlocks(blocks, MON_9AM).map((b) => b.id)).toEqual([
      "yesterday",
      "earlier-today",
    ]);
  });
});

// ---------------------------------------------------------------------------------------------
// Seeded random scenarios: the guarantees that must hold for *any* input.
// ---------------------------------------------------------------------------------------------

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scenario(seed: number) {
  const r = rng(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const pick = <T>(xs: readonly T[]): T => xs[int(0, xs.length - 1)]!;
  const hhmm = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

  const windows = [0, 1, 2, 3, 4, 5, 6].flatMap((day) => {
    const start = int(6, 17) * 60;
    return r() < 0.15
      ? []
      : [{ day, start: hhmm(start), end: hhmm(Math.min(start + int(2, 6) * 60, 23 * 60)) }];
  });
  const events: CalEvent[] = Array.from({ length: int(0, 6) }, (_, i) => {
    const start = int(6, 20) * 60 + pick([0, 15, 30, 45]);
    const base = {
      id: `e${i}`,
      title: "Event",
      kind: pick(["class", "exam", "other"] as const),
      mode: pick(["online", "physical"] as const),
      start: hhmm(start),
      end: hhmm(Math.min(start + int(1, 3) * 30, 23 * 60 + 30)),
    };
    return r() < 0.7
      ? { ...base, recurrence: "weekly" as const, weekday: int(0, 6) }
      : { ...base, recurrence: "none" as const, date: `2026-10-${19 + int(0, 6)}` };
  });
  const tasks: Task[] = Array.from({ length: int(1, 14) }, (_, i) => ({
    id: `s${seed}-t${i}`,
    title: `T${i}`,
    subject: pick(["maths", "physics", "ict"] as const satisfies readonly Subject[]),
    topic: "",
    type: pick(["homework", "paper", "revision", "chapter", "recording", "other"] as const),
    estimateMin: int(15, 240),
    ...(r() < 0.6 ? { deadline: `2026-10-${17 + int(0, 12)}` } : {}),
    importance: int(1, 5),
    splittable: r() < 0.7,
    minChunkMin: pick([0, 15, 25, 30]),
    status: pick(["todo", "todo", "todo", "in_progress", "missed"] as const),
    carryOverCount: int(0, 4),
    createdAt: `2026-10-1${int(0, 8)}T0${int(0, 9)}:00:00.000Z`,
  }));
  const now = at(19, int(6, 22), pick([0, 7, 30, 52]));
  return {
    now,
    settings: makeSettings({
      studyWindows: windows,
      maxDailyStudyMin: pick([120, 240, 360]),
      focusMin: pick([25, 50, 90]),
      breakMin: pick([0, 10]),
    }),
    events,
    tasks,
  };
}

describe("generatePlan: invariants hold for random scenarios", () => {
  const SEEDS = Array.from({ length: 60 }, (_, i) => i + 1);

  it.each(SEEDS)("seed %i", (seed) => {
    const s = scenario(seed);
    const input = makeInput({ ...s });
    const plan = generatePlan(input);
    const opts = { onlineBufferMin: 5, physicalBufferMin: 30 };
    const todayStr = "2026-10-19";
    const nowMin = s.now.getHours() * 60 + s.now.getMinutes();

    // deterministic, and independent of input order
    expect(JSON.stringify(generatePlan(input))).toBe(JSON.stringify(plan));
    const shuffled = generatePlan({ ...input, tasks: [...s.tasks].reverse() });
    expect(JSON.stringify(shuffled.blocks)).toBe(JSON.stringify(plan.blocks));

    const perDay = new Map<string, number>();
    const perTask = new Map<string, number>();
    const byDay = new Map<string, typeof plan.blocks>();
    for (const b of plan.blocks) {
      const start = toMin(b.start);
      const end = toMin(b.end);
      expect(end).toBeGreaterThan(start);

      // inside a study window
      const date = new Date(`${b.date}T00:00:00`);
      expect(
        windowsOn(s.settings.studyWindows, date).some(
          (w) => start >= toMin(w.start) && end <= toMin(w.end),
        ),
      ).toBe(true);

      // clear of every event and its buffer
      for (const e of eventsOn(s.events, date)) {
        const blocked = eventBlocker(e, { ...opts, minSlotMin: 20, snapMin: 5 });
        expect(end <= blocked.start || start >= blocked.end).toBe(true);
      }

      // not in the past
      if (b.date === todayStr) expect(start).toBeGreaterThanOrEqual(nowMin);

      // within the horizon, and by the task's deadline
      expect(b.date >= todayStr && b.date <= "2026-10-25").toBe(true);
      const task = s.tasks.find((t) => t.id === b.taskId)!;
      if (task.deadline && task.deadline >= todayStr) expect(b.date <= task.deadline).toBe(true);

      perDay.set(b.date, (perDay.get(b.date) ?? 0) + (end - start));
      perTask.set(b.taskId, (perTask.get(b.taskId) ?? 0) + (end - start));
      byDay.set(b.date, [...(byDay.get(b.date) ?? []), b]);
    }

    // no overlaps within a day
    for (const list of byDay.values()) {
      const sorted = [...list].sort((a, z) => toMin(a.start) - toMin(z.start));
      for (let i = 1; i < sorted.length; i++) {
        expect(toMin(sorted[i]!.start)).toBeGreaterThanOrEqual(toMin(sorted[i - 1]!.end));
      }
    }

    // daily cap
    const cap = Math.floor(s.settings.maxDailyStudyMin * 0.85);
    for (const [, total] of perDay) expect(total).toBeLessThanOrEqual(cap);

    // never plan more than a task has left; unsplittable work is one whole block
    for (const [taskId, total] of perTask) {
      const task = s.tasks.find((t) => t.id === taskId)!;
      expect(total).toBeLessThanOrEqual(Math.ceil(task.estimateMin));
      if (!task.splittable) {
        expect(plan.blocks.filter((b) => b.taskId === taskId)).toHaveLength(1);
        expect(total).toBe(Math.ceil(task.estimateMin));
      }
    }

    // every task is either (fully) planned or explained
    for (const t of s.tasks) {
      const planned = perTask.get(t.id) ?? 0;
      const explained = plan.unscheduled.some((u) => u.taskId === t.id);
      expect(planned >= Math.ceil(t.estimateMin) || explained).toBe(true);
    }
  });
});
