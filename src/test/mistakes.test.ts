import { describe, expect, it } from "vitest";
import {
  autoWeakTopics,
  MIN_MARKS_LOST,
  mergeWeakTopics,
  mistakeError,
  recentMistakes,
  TOPICS_PER_SUBJECT,
  topicLosses,
  windowStart,
} from "@/lib/planner";
import type { Mistake } from "@/lib/types";
import { at } from "./planner-fixtures";

const NOW = at(21, 12); // Wed 21 Oct 2026
let n = 0;
const mk = (over: Partial<Mistake> = {}): Mistake => {
  n += 1;
  return {
    id: `x${n}`,
    subject: "maths",
    topic: "Vectors",
    date: "2026-10-20",
    marksLost: 4,
    cause: "concept",
    ...over,
  };
};

describe("recent window", () => {
  it("covers the last 28 days including today", () => {
    expect(windowStart(NOW)).toBe("2026-09-24");
    const list = [
      mk({ id: "in", date: "2026-09-24" }),
      mk({ id: "out", date: "2026-09-23" }),
      mk({ id: "today", date: "2026-10-21" }),
    ];
    expect(recentMistakes(list, NOW).map((m) => m.id)).toEqual(["today", "in"]);
  });
});

describe("topicLosses", () => {
  it("adds up marks per topic ignoring case and spaces, and keeps the newest spelling", () => {
    const list = [
      mk({ topic: "vectors", date: "2026-10-01", marksLost: 2 }),
      mk({ topic: " Vectors ", date: "2026-10-15", marksLost: 3 }),
      mk({ topic: "Integration", marksLost: 1 }),
    ];
    const out = topicLosses(list, NOW);
    expect(out).toEqual([
      { subject: "maths", topic: "Vectors", marksLost: 5, count: 2 },
      { subject: "maths", topic: "Integration", marksLost: 1, count: 1 },
    ]);
  });

  it("keeps the same topic name in different subjects apart", () => {
    const out = topicLosses(
      [mk({ subject: "maths", topic: "Vectors" }), mk({ subject: "physics", topic: "Vectors" })],
      NOW,
    );
    expect(out).toHaveLength(2);
  });

  it("ignores mistakes older than the window", () => {
    expect(topicLosses([mk({ date: "2026-08-01" })], NOW)).toEqual([]);
  });
});

describe("autoWeakTopics", () => {
  it("picks topics losing concept or time marks, and ignores careless slips", () => {
    const list = [
      mk({ topic: "Vectors", cause: "concept" }),
      mk({ topic: "Circular motion", subject: "physics", cause: "time" }),
      mk({ topic: "Sign errors", cause: "careless", marksLost: 10 }),
    ];
    expect(autoWeakTopics(list, NOW)).toEqual([
      { subject: "maths", topic: "Vectors" },
      { subject: "physics", topic: "Circular motion" },
    ]);
  });

  it("needs a few marks lost on a topic before flagging it", () => {
    const small = [mk({ marksLost: MIN_MARKS_LOST - 1 })];
    expect(autoWeakTopics(small, NOW)).toEqual([]);
    // Two small losses on the same topic add up to enough.
    const added = [mk({ marksLost: 2 }), mk({ marksLost: 1 })];
    expect(autoWeakTopics(added, NOW)).toHaveLength(1);
  });

  it("ignores old mistakes", () => {
    expect(autoWeakTopics([mk({ date: "2026-08-01", marksLost: 20 })], NOW)).toEqual([]);
  });

  it("takes only the worst few per subject so one subject can't crowd out the rest", () => {
    const maths = ["A", "B", "C", "D", "E"].map((t, i) => mk({ topic: t, marksLost: 10 - i }));
    const ict = [mk({ subject: "ict", topic: "Databases", marksLost: 3 })];
    const out = autoWeakTopics([...maths, ...ict], NOW);
    expect(out.filter((t) => t.subject === "maths").map((t) => t.topic)).toEqual(
      ["A", "B", "C"].slice(0, TOPICS_PER_SUBJECT),
    );
    expect(out.some((t) => t.subject === "ict")).toBe(true);
  });
});

describe("mergeWeakTopics", () => {
  it("keeps Settings topics first and drops repeats ignoring case", () => {
    const out = mergeWeakTopics(
      [{ subject: "maths", topic: "Vectors" }],
      [
        { subject: "maths", topic: "vectors " },
        { subject: "ict", topic: "Databases" },
      ],
    );
    expect(out).toEqual([
      { subject: "maths", topic: "Vectors" },
      { subject: "ict", topic: "Databases" },
    ]);
  });
});

describe("mistakeError", () => {
  const ok = { topic: "Vectors", date: "2026-10-20", marksLost: 3 };
  it("accepts a good mistake", () => expect(mistakeError(ok)).toBeNull());
  it.each([
    [{ topic: "  " }, /topic/i],
    [{ date: "2026-02-31" }, /date/i],
    [{ marksLost: Number.NaN }, /marks/i],
    [{ marksLost: 0 }, /more than zero/i],
    [{ marksLost: -2 }, /more than zero/i],
  ])("rejects %j", (over, message) => {
    expect(mistakeError({ ...ok, ...over })).toMatch(message);
  });
});
