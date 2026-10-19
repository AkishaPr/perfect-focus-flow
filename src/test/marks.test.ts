import { describe, expect, it } from "vitest";
import { chartGeometry, markError, markPercent, marksBySubject } from "@/lib/marks";
import { recentAverage, subjectWeakness } from "@/lib/planner";
import { SUBJECTS, type PaperMark, type Subject } from "@/lib/types";
import { makeMark } from "./planner-fixtures";

const mark = (id: string, subject: Subject, date: string, score: number, max = 100): PaperMark =>
  makeMark({ id, subject, date, score, max, paperName: `Paper ${id}` });
const forSubject = (marks: PaperMark[], s: Subject) =>
  marksBySubject(marks).find((x) => x.subject === s)!;

/** Small seeded generator so the randomized checks are repeatable. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("markPercent", () => {
  it("is score over total, as a percentage", () => {
    expect(markPercent({ score: 62, max: 100 })).toBe(62);
    expect(markPercent({ score: 45, max: 60 })).toBe(75);
    expect(markPercent({ score: 0, max: 50 })).toBe(0);
  });
  it("doesn't divide by zero", () => {
    expect(markPercent({ score: 5, max: 0 })).toBe(0);
  });
});

describe("marksBySubject", () => {
  it("always returns every subject, empty ones with nothing to show", () => {
    const out = marksBySubject([]);
    expect(out.map((x) => x.subject)).toEqual([...SUBJECTS]);
    for (const x of out) {
      expect(x).toMatchObject({
        count: 0,
        latest: null,
        latestPct: null,
        change: null,
        recentAvg: null,
        bestPct: null,
        gapToBest: null,
        plannerBoost: false,
      });
    }
  });

  it("finds the latest paper and how much it moved from the one before", () => {
    const m = forSubject(
      [mark("a", "maths", "2026-09-01", 60), mark("b", "maths", "2026-10-01", 72)],
      "maths",
    );
    expect(m.latest?.id).toBe("b");
    expect(m.latestPct).toBe(72);
    expect(m.change).toBe(12);
    expect(m.count).toBe(2);
    expect(m.bestPct).toBe(72);
  });

  it("shows a drop as a negative change, and no change from a single paper", () => {
    const down = forSubject(
      [mark("a", "maths", "2026-09-01", 80), mark("b", "maths", "2026-10-01", 65)],
      "maths",
    );
    expect(down.change).toBe(-15);
    expect(forSubject([mark("a", "physics", "2026-09-01", 50)], "physics").change).toBeNull();
  });

  it("orders marks by the date sat, not the order they were entered", () => {
    const m = forSubject(
      [mark("late", "maths", "2026-10-10", 90), mark("early", "maths", "2026-09-01", 40)],
      "maths",
    );
    expect(m.latest?.id).toBe("late");
    expect(m.change).toBe(50);
  });

  it("averages only the latest three papers: the planner's number", () => {
    const marks = [
      mark("a", "maths", "2026-08-01", 10),
      mark("b", "maths", "2026-09-01", 50),
      mark("c", "maths", "2026-09-15", 50),
      mark("d", "maths", "2026-10-01", 80),
    ];
    const m = forSubject(marks, "maths");
    expect(m.recentAvg).toBeCloseTo((50 + 50 + 80) / 3, 10);
    expect(m.recentAvg).toBe(recentAverage(marks));
    expect(m.bestPct).toBe(80);
  });

  it("breaks same-day ties the way the planner does", () => {
    const marks = [mark("a", "maths", "2026-10-01", 40), mark("b", "maths", "2026-10-01", 90)];
    expect(forSubject(marks, "maths").latest?.id).toBe("b");
    expect(forSubject(marks, "maths").recentAvg).toBe(recentAverage(marks));
  });

  it("measures the gap to the strongest subject only when two subjects can be compared", () => {
    const one = marksBySubject([mark("a", "maths", "2026-10-01", 70)]);
    expect(one.every((x) => x.gapToBest === null)).toBe(true);

    const two = marksBySubject([
      mark("a", "maths", "2026-10-01", 80),
      mark("b", "physics", "2026-10-01", 55),
    ]);
    expect(two.find((x) => x.subject === "maths")?.gapToBest).toBe(0);
    expect(two.find((x) => x.subject === "physics")?.gapToBest).toBeCloseTo(25, 10);
    expect(two.find((x) => x.subject === "ict")?.gapToBest).toBeNull(); // no marks yet
  });

  it("says the planner is boosting a subject exactly when the planner's weakness is above zero", () => {
    const rand = rng(42);
    for (let run = 0; run < 200; run++) {
      const marks: PaperMark[] = [];
      for (let i = 0; i < Math.floor(rand() * 9); i++) {
        const max = 20 + Math.floor(rand() * 80);
        marks.push(
          mark(
            `m${i}`,
            SUBJECTS[Math.floor(rand() * 3)]!,
            `2026-${String(1 + Math.floor(rand() * 10)).padStart(2, "0")}-${String(1 + Math.floor(rand() * 28)).padStart(2, "0")}`,
            Math.floor(rand() * (max + 1)),
            max,
          ),
        );
      }
      const weakness = subjectWeakness(marks);
      for (const s of marksBySubject(marks)) {
        expect(s.plannerBoost).toBe((weakness.get(s.subject) ?? 0) > 0);
        // …and the gap shown is the one the planner's weakness is built from (30 points = fully weak).
        if (s.gapToBest !== null)
          expect(Math.min(1, Math.max(0, s.gapToBest / 30))).toBeCloseTo(
            weakness.get(s.subject) ?? 0,
            10,
          );
      }
    }
  });
});

describe("markError", () => {
  const ok = { paperName: "2024 Paper I", date: "2026-10-12", score: 62, max: 100 };
  it("accepts a good mark, including full marks and zero", () => {
    expect(markError(ok)).toBeNull();
    expect(markError({ ...ok, score: 100 })).toBeNull();
    expect(markError({ ...ok, score: 0 })).toBeNull();
    expect(markError({ ...ok, score: 17.5, max: 20 })).toBeNull();
  });
  it.each([
    [{ paperName: "   " }, /name/],
    [{ date: "" }, /date/],
    [{ date: "2026-02-30" }, /date/],
    [{ max: 0 }, /marked out of/],
    [{ max: Number.NaN }, /marked out of/],
    [{ score: Number.NaN }, /score/i],
    [{ score: -1 }, /negative/],
    [{ score: 101 }, /more than the total/],
  ])("rejects %j", (patch, message) => {
    expect(markError({ ...ok, ...patch })).toMatch(message);
  });
});

describe("chartGeometry", () => {
  it("places marks by the date sat, so gaps between papers look like gaps", () => {
    const g = chartGeometry([
      mark("a", "maths", "2026-10-01", 50),
      mark("b", "maths", "2026-10-03", 60),
      mark("c", "maths", "2026-10-11", 70),
    ]);
    expect(g.points.map((p) => p.x)).toEqual([0, 0.2, 1]);
  });

  it("is oldest first whatever order marks come in", () => {
    const g = chartGeometry([
      mark("b", "maths", "2026-10-11", 70),
      mark("a", "maths", "2026-10-01", 50),
    ]);
    expect(g.points.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("centres a single date instead of dividing by zero", () => {
    const g = chartGeometry([
      mark("a", "maths", "2026-10-01", 50),
      mark("b", "physics", "2026-10-01", 60),
    ]);
    expect(g.points.map((p) => p.x)).toEqual([0.5, 0.5]);
  });

  it("keeps the scale inside 0–100 and at least 20 points tall, with every mark on it", () => {
    const rand = rng(7);
    for (let run = 0; run < 200; run++) {
      const marks = Array.from({ length: 1 + Math.floor(rand() * 8) }, (_, i) =>
        mark(
          `m${i}`,
          "maths",
          `2026-10-${String(1 + i).padStart(2, "0")}`,
          Math.floor(rand() * 101),
        ),
      );
      const { domain, ticks, points } = chartGeometry(marks);
      expect(domain.min).toBeGreaterThanOrEqual(0);
      expect(domain.max).toBeLessThanOrEqual(100);
      expect(domain.max - domain.min).toBeGreaterThanOrEqual(20);
      expect(ticks[0]).toBe(domain.min);
      expect(ticks[ticks.length - 1]).toBe(domain.max);
      for (const p of points) {
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(1);
        expect(domain.min + p.y * (domain.max - domain.min)).toBeCloseTo(p.pct, 8);
      }
    }
  });

  it("zooms to the range the marks live in rather than always showing 0–100", () => {
    const g = chartGeometry([
      mark("a", "maths", "2026-10-01", 62),
      mark("b", "maths", "2026-10-05", 71),
    ]);
    expect(g.domain).toEqual({ min: 50, max: 80 });
    expect(g.ticks).toEqual([50, 60, 70, 80]);
    expect(g.points[1]!.y).toBeCloseTo((71 - 50) / 30, 10);
  });

  it("copes with no marks", () => {
    const g = chartGeometry([]);
    expect(g.points).toEqual([]);
    expect(g.domain.max - g.domain.min).toBeGreaterThanOrEqual(20);
  });
});
