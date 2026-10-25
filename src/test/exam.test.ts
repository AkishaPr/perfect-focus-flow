import { describe, expect, it } from "vitest";
import { examCountdown, subjectTargets } from "@/lib/exam";
import { at, makeMark } from "./planner-fixtures";

const NOW = at(21, 12); // Wed 21 Oct 2026, midday
const TARGETS = { maths: 78, physics: 78, ict: 85 };

describe("examCountdown", () => {
  it("counts whole days and weeks to the exam", () => {
    expect(examCountdown(NOW, "2026-10-28")).toEqual({ days: 7, weeks: 1, status: "upcoming" });
    expect(examCountdown(NOW, "2026-10-27")).toEqual({ days: 6, weeks: 0, status: "upcoming" });
    expect(examCountdown(NOW, "2026-10-22").days).toBe(1);
  });

  it("is about 40 weeks from late October 2026 to the A/L start", () => {
    const c = examCountdown(NOW, "2027-08-03");
    expect(c.days).toBe(286);
    expect(c.weeks).toBe(40);
  });

  it("says today on the day, and started afterwards, with no negative weeks", () => {
    expect(examCountdown(NOW, "2026-10-21")).toEqual({ days: 0, weeks: 0, status: "today" });
    expect(examCountdown(NOW, "2026-10-14")).toEqual({ days: -7, weeks: 0, status: "started" });
  });

  it("uses the study day, so 1am still belongs to the day before", () => {
    // 22 Oct 01:00 is still the 21st's study day, so the 22nd is a day away.
    expect(examCountdown(new Date(2026, 9, 22, 1, 0), "2026-10-22").days).toBe(1);
    expect(examCountdown(new Date(2026, 9, 22, 4, 0), "2026-10-22").days).toBe(0);
  });
});

describe("subjectTargets", () => {
  it("returns every subject, with nulls where there are no marks", () => {
    const out = subjectTargets([], TARGETS, NOW, "2027-08-03");
    expect(out.map((t) => t.subject)).toEqual(["maths", "physics", "ict"]);
    expect(out[0]).toEqual({
      subject: "maths",
      target: 78,
      current: null,
      gap: null,
      perMonth: null,
    });
  });

  it("measures the gap from the planner's recent average (last three papers)", () => {
    const marks = [
      makeMark({ id: "a", date: "2026-09-01", score: 10 }), // too old to count
      makeMark({ id: "b", date: "2026-10-01", score: 40 }),
      makeMark({ id: "c", date: "2026-10-08", score: 50 }),
      makeMark({ id: "d", date: "2026-10-15", score: 60 }),
    ];
    const [maths] = subjectTargets(marks, TARGETS, NOW, "2026-12-21");
    expect(maths!.current).toBe(50);
    expect(maths!.gap).toBe(28);
    // 61 days is about two months, so roughly 14 points a month.
    expect(maths!.perMonth).toBeCloseTo(28 / (61 / 30.44), 6);
  });

  it("has no gap, and needs no gain, once the target is met", () => {
    const marks = [makeMark({ subject: "ict", score: 90 })];
    const ict = subjectTargets(marks, TARGETS, NOW, "2027-08-03")[2]!;
    expect(ict.gap).toBe(0);
    expect(ict.perMonth).toBe(0);
  });

  it("gives no monthly pace once the exam date has arrived", () => {
    const marks = [makeMark({ score: 50 })];
    expect(subjectTargets(marks, TARGETS, NOW, "2026-10-21")[0]!.perMonth).toBeNull();
    expect(subjectTargets(marks, TARGETS, NOW, "2026-10-01")[0]!.gap).toBe(28);
  });
});
