import { describe, expect, it } from "vitest";
import { BULK_JUMP_MIN, goalSnapshot, newMilestone, type GoalSnapshot } from "@/lib/milestones";
import { at, makeSession, makeSettings, makeTask } from "./planner-fixtures";

const snap = (over: Partial<GoalSnapshot> = {}): GoalSnapshot => ({
  dayKey: "2026-10-21",
  weekKey: "2026-10-19",
  dayMin: 0,
  weekMin: 0,
  dailyGoalMin: 120,
  weeklyGoalMin: 600,
  ...over,
});
const none = new Set<string>();

describe("newMilestone", () => {
  it("fires for the daily goal when study time crosses it", () => {
    const hit = newMilestone(
      snap({ dayMin: 100, weekMin: 100 }),
      snap({ dayMin: 130, weekMin: 130 }),
      none,
    );
    expect(hit).toEqual({ kind: "daily", key: "daily:2026-10-21" });
  });

  it("counts reaching the goal exactly", () => {
    expect(newMilestone(snap({ dayMin: 119 }), snap({ dayMin: 120 }), none)?.kind).toBe("daily");
  });

  it("fires for the weekly goal, and the weekly one wins when both are crossed together", () => {
    const hit = newMilestone(
      snap({ dayMin: 100, weekMin: 580 }),
      snap({ dayMin: 130, weekMin: 610 }),
      none,
    );
    expect(hit).toEqual({ kind: "weekly", key: "weekly:2026-10-19" });
  });

  it("needs a real crossing: already above, or still below, is nothing", () => {
    expect(newMilestone(snap({ dayMin: 130 }), snap({ dayMin: 150 }), none)).toBeNull();
    expect(newMilestone(snap({ dayMin: 10 }), snap({ dayMin: 50 }), none)).toBeNull();
  });

  it("has nothing to compare with on the first look, so opening the app never celebrates", () => {
    expect(newMilestone(null, snap({ dayMin: 500, weekMin: 900 }), none)).toBeNull();
  });

  it("fires once per day or week", () => {
    const prev = snap({ dayMin: 100 });
    const next = snap({ dayMin: 130 });
    expect(newMilestone(prev, next, new Set(["daily:2026-10-21"]))).toBeNull();
  });

  it("ignores a goal that was only reached by changing the goal", () => {
    expect(
      newMilestone(
        snap({ dayMin: 100, dailyGoalMin: 240 }),
        snap({ dayMin: 100, dailyGoalMin: 90 }),
        none,
      ),
    ).toBeNull();
    expect(
      newMilestone(
        snap({ weekMin: 500, weeklyGoalMin: 900 }),
        snap({ weekMin: 500, weeklyGoalMin: 400 }),
        none,
      ),
    ).toBeNull();
  });

  it("does nothing when there is no goal", () => {
    expect(
      newMilestone(
        snap({ dayMin: 0, dailyGoalMin: 0 }),
        snap({ dayMin: 50, dailyGoalMin: 0 }),
        none,
      ),
    ).toBeNull();
  });

  it("does not compare across a day or week change", () => {
    expect(
      newMilestone(
        snap({ dayKey: "2026-10-20", dayMin: 0 }),
        snap({ dayKey: "2026-10-21", dayMin: 200 }),
        none,
      ),
    ).toBeNull();
    expect(
      newMilestone(
        snap({ weekKey: "2026-10-12", weekMin: 590 }),
        snap({ weekKey: "2026-10-19", weekMin: 700 }),
        none,
      ),
    ).toBeNull();
  });

  it("treats a huge jump (a restored backup) as data changing, not as an achievement", () => {
    const next = snap({ dayMin: 130, weekMin: BULK_JUMP_MIN + 50 });
    expect(newMilestone(snap(), next, none)).toBeNull();
  });
});

describe("goalSnapshot", () => {
  it("measures today and this week from sessions, with the study-time definition used everywhere", () => {
    const now = at(21, 15, 0); // Wednesday
    const data = {
      settings: makeSettings({ dailyGoalMin: 120, weeklyGoalMin: 600 }),
      tasks: [makeTask({ id: "t1" })],
      blocks: [],
      sessions: [
        makeSession({ id: "mon", taskId: "t1", start: at(19, 10, 0).toISOString(), actualMin: 90 }),
        makeSession({ id: "wed", taskId: "t1", start: at(21, 9, 0).toISOString(), actualMin: 45 }),
      ],
    };
    expect(goalSnapshot(data, now)).toEqual({
      dayKey: "2026-10-21",
      weekKey: "2026-10-19",
      dayMin: 45,
      weekMin: 135,
      dailyGoalMin: 120,
      weeklyGoalMin: 600,
    });
  });
});
