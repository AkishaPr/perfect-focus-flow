import { describe, expect, it } from "vitest";
import { buildToday } from "@/lib/planner/today";
import { buildScoringContext, isWeakTopic, scoreTask } from "@/lib/planner/scoring";
import type { Mistake } from "@/lib/types";
import { dailyWindow, makeSettings, makeTask, MON_9AM } from "./planner-fixtures";

const mistake = (over: Partial<Mistake> = {}): Mistake => ({
  id: "x1",
  subject: "maths",
  topic: "Vectors",
  date: "2026-10-16",
  marksLost: 5,
  cause: "concept",
  ...over,
});

const ctxFor = (mistakes?: Mistake[], weakTopics: { subject: "maths"; topic: string }[] = []) =>
  buildScoringContext({
    now: MON_9AM,
    settings: makeSettings({ weakTopics }),
    tasks: [],
    goals: [],
    marks: [],
    ...(mistakes ? { mistakes } : {}),
  });

describe("mistake log feeds the planner's weak topics", () => {
  it("flags tasks on a topic the log says is weak", () => {
    const ctx = ctxFor([mistake()]);
    expect(isWeakTopic(makeTask({ subject: "maths", topic: "vectors" }), ctx)).toBe(true);
    expect(isWeakTopic(makeTask({ subject: "maths", topic: "Calculus" }), ctx)).toBe(false);
    expect(isWeakTopic(makeTask({ subject: "physics", topic: "Vectors" }), ctx)).toBe(false);
  });

  it("scores a weak-topic task higher than an otherwise identical one", () => {
    const ctx = ctxFor([mistake()]);
    const weak = scoreTask(makeTask({ topic: "Vectors" }), 60, 10_000, ctx);
    const other = scoreTask(makeTask({ topic: "Calculus" }), 60, 10_000, ctx);
    expect(weak.factors.weakTopic).toBe(1);
    expect(weak.score).toBeGreaterThan(other.score);
  });

  it("does nothing for careless slips, small losses or old mistakes", () => {
    const ctx = ctxFor([
      mistake({ cause: "careless", marksLost: 20 }),
      mistake({ id: "x2", topic: "Calculus", marksLost: 1 }),
      mistake({ id: "x3", topic: "Series", date: "2026-07-01", marksLost: 20 }),
    ]);
    expect(ctx.weakTopics).toEqual([]);
  });

  it("still honours topics typed into Settings, alongside the log", () => {
    const ctx = ctxFor([mistake()], [{ subject: "maths", topic: "Calculus" }]);
    expect(ctx.weakTopics.map((t) => t.topic)).toEqual(["Calculus", "Vectors"]);
  });

  it("works without a mistake log, as before", () => {
    expect(ctxFor().weakTopics).toEqual([]);
  });

  it("changes which task the Today plan puts first", () => {
    const data = {
      settings: makeSettings({ studyWindows: dailyWindow("16:00", "21:00") }),
      events: [],
      tasks: [
        makeTask({ id: "calc", title: "Calculus set", topic: "Calculus", importance: 3 }),
        makeTask({ id: "vec", title: "Vectors set", topic: "Vectors", importance: 3 }),
      ],
      goals: [],
      blocks: [],
      sessions: [],
      marks: [],
    };
    const withLog = buildToday({ ...data, mistakes: [mistake()] }, MON_9AM);
    expect(withLog.next?.task.id).toBe("vec");
  });
});
