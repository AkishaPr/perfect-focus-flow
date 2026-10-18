import { describe, expect, it } from "vitest";
import {
  buildScoringContext,
  isWeakTopic,
  remainingMin,
  scoreTask,
  spentMin,
  subjectWeakness,
} from "@/lib/planner/scoring";
import { explain } from "@/lib/planner/explain";
import type { Task } from "@/lib/types";
import {
  makeGoal,
  makeMark,
  makeSession,
  makeSettings,
  makeTask,
  MON_9AM,
} from "./planner-fixtures";

const ctxFor = (over: Partial<Parameters<typeof buildScoringContext>[0]> = {}) =>
  buildScoringContext({
    now: MON_9AM,
    settings: makeSettings(),
    tasks: [],
    goals: [],
    marks: [],
    ...over,
  });

/** Score with plenty of free time unless told otherwise. */
const score = (t: Task, capacity = 10_000, ctx = ctxFor()) =>
  scoreTask(t, t.estimateMin, capacity, ctx);

describe("spent / remaining", () => {
  it("sums sessions for the task and never goes negative", () => {
    const t = makeTask({ id: "a", estimateMin: 100 });
    const sessions = [
      makeSession({ id: "s1", taskId: "a", actualMin: 30 }),
      makeSession({ id: "s2", taskId: "a", actualMin: 45 }),
      makeSession({ id: "s3", taskId: "other", actualMin: 999 }),
    ];
    expect(spentMin(t, sessions)).toBe(75);
    expect(remainingMin(t, sessions)).toBe(25);
    expect(remainingMin({ id: "a", estimateMin: 50 }, sessions)).toBe(0);
  });
});

describe("scoreTask", () => {
  it("ranks overdue > due tomorrow > no deadline, all else equal", () => {
    const overdue = score(makeTask({ deadline: "2026-10-17" }), 600);
    const tomorrow = score(makeTask({ deadline: "2026-10-20" }), 600);
    const none = score(makeTask());
    expect(overdue.score).toBeGreaterThan(tomorrow.score);
    expect(tomorrow.score).toBeGreaterThan(none.score);
    expect(overdue.factors.overdue).toBeGreaterThan(0);
    expect(tomorrow.factors.overdue).toBe(0);
  });

  it("grows the overdue factor with days late, capped at 1", () => {
    const one = score(makeTask({ deadline: "2026-10-18" })).factors.overdue;
    const five = score(makeTask({ deadline: "2026-10-14" })).factors.overdue;
    const forty = score(makeTask({ deadline: "2026-09-09" })).factors.overdue;
    expect(five).toBeGreaterThan(one);
    expect(forty).toBe(1);
  });

  it("makes the deadline factor slack-based", () => {
    const t = makeTask({ estimateMin: 120, deadline: "2026-10-22" });
    expect(scoreTask(t, 120, 100, ctxFor()).factors.deadline).toBe(1); // can't finish
    expect(scoreTask(t, 120, 120, ctxFor()).factors.deadline).toBe(1); // zero slack
    expect(scoreTask(t, 120, 240, ctxFor()).factors.deadline).toBeCloseTo(0.5);
    expect(scoreTask(t, 120, 1200, ctxFor()).factors.deadline).toBeCloseTo(0.1);
  });

  it("maps importance 1–5 onto 0–1", () => {
    expect(score(makeTask({ importance: 1 })).factors.importance).toBe(0);
    expect(score(makeTask({ importance: 3 })).factors.importance).toBe(0.5);
    expect(score(makeTask({ importance: 5 })).factors.importance).toBe(1);
  });

  it("saturates carry-over at three", () => {
    expect(score(makeTask({ carryOverCount: 1 })).factors.carryOver).toBeCloseTo(1 / 3);
    expect(score(makeTask({ carryOverCount: 9 })).factors.carryOver).toBe(1);
  });

  it("is the weights-weighted mean on a 0–100 scale", () => {
    const t = makeTask({ importance: 5 });
    const onlyImportance = makeSettings({
      weights: { deadline: 0, overdue: 0, importance: 7, weakTopic: 0, goal: 0, carryOver: 0 },
    });
    expect(score(t, 10_000, ctxFor({ settings: onlyImportance })).score).toBeCloseTo(100);
    expect(
      score(makeTask({ importance: 1 }), 10_000, ctxFor({ settings: onlyImportance })).score,
    ).toBe(0);
  });

  it("scores 0 (not NaN) when every weight is zero", () => {
    const zero = makeSettings({
      weights: { deadline: 0, overdue: 0, importance: 0, weakTopic: 0, goal: 0, carryOver: 0 },
    });
    expect(score(makeTask({ importance: 5 }), 10_000, ctxFor({ settings: zero })).score).toBe(0);
  });
});

describe("weak topics and subjects", () => {
  it("matches the user's weak topics case-insensitively within the subject", () => {
    const settings = makeSettings({ weakTopics: [{ subject: "maths", topic: "Integration " }] });
    const ctx = ctxFor({ settings });
    expect(isWeakTopic(makeTask({ subject: "maths", topic: "integration" }), ctx)).toBe(true);
    expect(isWeakTopic(makeTask({ subject: "physics", topic: "integration" }), ctx)).toBe(false);
    expect(isWeakTopic(makeTask({ subject: "maths", topic: "" }), ctx)).toBe(false);
    expect(
      score(makeTask({ subject: "maths", topic: "integration" }), 10_000, ctx).factors.weakTopic,
    ).toBe(1);
  });

  it("needs marks in two subjects before calling any subject weak", () => {
    expect(subjectWeakness([makeMark({ score: 20 })]).size).toBe(0);
    expect(subjectWeakness([]).size).toBe(0);
  });

  it("measures the gap to the strongest subject, 30 points = fully weak", () => {
    const w = subjectWeakness([
      makeMark({ id: "a", subject: "maths", score: 90 }),
      makeMark({ id: "b", subject: "physics", score: 60 }),
      makeMark({ id: "c", subject: "ict", score: 75 }),
    ]);
    expect(w.get("maths")).toBe(0);
    expect(w.get("physics")).toBe(1);
    expect(w.get("ict")).toBeCloseTo(0.5);
  });

  it("only looks at the three most recent papers per subject", () => {
    const w = subjectWeakness([
      makeMark({ id: "old", subject: "physics", date: "2026-01-01", score: 0 }),
      makeMark({ id: "p1", subject: "physics", date: "2026-09-01", score: 80 }),
      makeMark({ id: "p2", subject: "physics", date: "2026-09-08", score: 80 }),
      makeMark({ id: "p3", subject: "physics", date: "2026-09-15", score: 80 }),
      makeMark({ id: "m1", subject: "maths", date: "2026-09-15", score: 80 }),
    ]);
    expect(w.get("physics")).toBe(0);
  });

  it("gives a weak subject a partial boost, below an explicitly weak topic", () => {
    const marks = [
      makeMark({ id: "a", subject: "maths", score: 90 }),
      makeMark({ id: "b", subject: "physics", score: 50 }),
    ];
    const ctx = ctxFor({ marks });
    const weakSubject = score(makeTask({ subject: "physics" }), 10_000, ctx).factors.weakTopic;
    expect(weakSubject).toBeCloseTo(0.6);
    expect(score(makeTask({ subject: "maths" }), 10_000, ctx).factors.weakTopic).toBe(0);
  });
});

describe("goal need", () => {
  it("boosts tasks linked to a goal that is still open this week", () => {
    const goal = makeGoal({ id: "g1", target: 3 });
    const linked = [
      makeTask({ id: "x1", goalId: "g1", status: "done" }),
      makeTask({ id: "x2", goalId: "g1" }),
    ];
    const ctx = ctxFor({ goals: [goal], tasks: linked });
    expect(score(linked[1]!, 10_000, ctx).factors.goal).toBeCloseTo(2 / 3);
  });

  it("ignores goals from other weeks and goals already met", () => {
    const otherWeek = makeGoal({ id: "g2", weekStart: "2026-10-12" });
    const met = makeGoal({ id: "g3", target: 1 });
    const tasks = [
      makeTask({ id: "y1", goalId: "g2" }),
      makeTask({ id: "y2", goalId: "g3", status: "done" }),
      makeTask({ id: "y3", goalId: "g3" }),
    ];
    const ctx = ctxFor({ goals: [otherWeek, met], tasks });
    expect(score(tasks[0]!, 10_000, ctx).factors.goal).toBe(0);
    expect(score(tasks[2]!, 10_000, ctx).factors.goal).toBe(0);
  });
});

describe("explain", () => {
  it("names the biggest drivers in plain English, at most three", () => {
    const t = makeTask({ deadline: "2026-10-17", importance: 5, carryOverCount: 2 });
    const ctx = ctxFor();
    const reasons = explain(t, scoreTask(t, 60, 0, ctx), ctx);
    expect(reasons.length).toBeLessThanOrEqual(3);
    expect(reasons).toContain("2 days overdue");
    expect(reasons).toContain("Importance 5/5");
    // overdue already says it: no redundant "Due …" line
    expect(reasons.some((r) => r.startsWith("Due"))).toBe(false);
  });

  it("never returns an empty list", () => {
    const t = makeTask({ importance: 1 });
    const ctx = ctxFor();
    expect(explain(t, scoreTask(t, 60, 0, ctx), ctx)).toEqual(["Next best use of this time"]);
  });
});
