import { describe, expect, it } from "vitest";
import { studiedMinOn } from "@/lib/planner";
import { attentionNow, studyForWeek, weeklyTotals, workForWeek } from "@/lib/progress";
import { SUBJECTS, type PlanBlock, type Session, type Task } from "@/lib/types";
import { at, makeBlock, makeGoal, makeSession, makeSettings, makeTask } from "./planner-fixtures";

// Week of Monday 19 Oct 2026. NOW is Wednesday midday, so Thu–Sun are still to come.
const NOW = at(21, 12, 0);
const settings = makeSettings({ weeklyGoalMin: 1800, dailyGoalMin: 240 });
const sess = (
  id: string,
  taskId: string,
  when: Date,
  actualMin: number,
  blockId?: string,
): Session =>
  makeSession({
    id,
    taskId,
    start: when.toISOString(),
    end: new Date(when.getTime() + actualMin * 60_000).toISOString(),
    actualMin,
    ...(blockId ? { blockId } : {}),
  });
const data = (over: Partial<Parameters<typeof studyForWeek>[0]> = {}) => ({
  settings,
  tasks: [
    makeTask({ id: "m", subject: "maths" }),
    makeTask({ id: "p", subject: "physics" }),
    makeTask({ id: "i", subject: "ict" }),
  ],
  blocks: [] as PlanBlock[],
  sessions: [] as Session[],
  ...over,
});

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("studyForWeek", () => {
  it("lays the week out Monday to Sunday and marks days that haven't happened", () => {
    const w = studyForWeek(data(), NOW, NOW);
    expect(w.weekStart).toBe("2026-10-19");
    expect(w.days.map((d) => d.date)).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
    ]);
    expect(w.days.map((d) => d.isFuture)).toEqual([false, false, false, true, true, true, true]);
    expect(w.daysElapsed).toBe(3);
  });

  it("gives the same week for any day inside it", () => {
    const d = data({ sessions: [sess("s", "m", at(19, 9), 30)] });
    const mon = studyForWeek(d, at(19, 0, 1), NOW);
    expect(studyForWeek(d, at(25, 23, 59), NOW)).toEqual(mon);
    expect(studyForWeek(d, at(22, 8), NOW)).toEqual(mon);
  });

  it("adds up each day from sessions, by real minutes", () => {
    const w = studyForWeek(
      data({
        sessions: [
          sess("a", "m", at(19, 16), 45),
          sess("b", "p", at(19, 18), 30),
          sess("c", "i", at(21, 9), 50),
        ],
      }),
      NOW,
      NOW,
    );
    expect(w.days.map((d) => d.totalMin)).toEqual([75, 0, 50, 0, 0, 0, 0]);
    expect(w.totalMin).toBe(125);
    expect(w.bySubject).toEqual({ maths: 45, physics: 30, ict: 50 });
    expect(w.otherMin).toBe(0);
    expect(w.daysStudied).toBe(2);
    expect(w.goalPct).toBe(7); // 125 of 1800
  });

  it("counts a timed block once: the session wins over its block", () => {
    const block = makeBlock({
      id: "b",
      taskId: "m",
      date: "2026-10-19",
      start: "16:00",
      end: "17:10",
      status: "done",
    });
    const w = studyForWeek(
      data({ blocks: [block], sessions: [sess("s", "m", at(19, 16), 55, "b")] }),
      NOW,
      NOW,
    );
    expect(w.totalMin).toBe(55); // not 55 + 70
    expect(w.bySubject.maths).toBe(55);
  });

  it("still counts work finished with 'Mark done' and no timer, by block length", () => {
    const block = makeBlock({
      id: "b",
      taskId: "p",
      date: "2026-10-20",
      start: "07:00",
      end: "07:40",
      status: "done",
    });
    const w = studyForWeek(data({ blocks: [block] }), NOW, NOW);
    expect(w.days[1]?.totalMin).toBe(40);
    expect(w.bySubject.physics).toBe(40);
  });

  it("keeps time on a deleted task, under 'other' rather than losing it or guessing a subject", () => {
    const w = studyForWeek(
      data({ sessions: [sess("a", "m", at(19, 16), 30), sess("g", "gone", at(19, 17), 20)] }),
      NOW,
      NOW,
    );
    expect(w.totalMin).toBe(50);
    expect(w.bySubject.maths).toBe(30);
    expect(w.otherMin).toBe(20);
  });

  it("assigns sessions before 03:00 to the previous study day, including across Sunday night", () => {
    const after = at(26, 12);
    const d = data({
      sessions: [sess("sun", "m", at(25, 23, 30), 20), sess("mon", "m", at(26, 0, 10), 15)],
    });
    const week = studyForWeek(d, at(25, 12), after);
    expect(week.days[6]?.totalMin).toBe(35);
    expect(studyForWeek(d, at(26, 12), after).days[0]?.totalMin).toBe(0);
    expect(week.totalMin).toBe(35);
  });

  it("treats a past week as seven elapsed days, and ignores sessions dated in the future", () => {
    const d = data({
      sessions: [sess("old", "m", at(14, 10), 60), sess("future", "m", at(24, 10), 99)],
    });
    const last = studyForWeek(d, at(14, 12), NOW);
    expect(last.daysElapsed).toBe(7);
    expect(last.totalMin).toBe(60);
    const cur = studyForWeek(d, NOW, NOW);
    expect(cur.totalMin).toBe(0); // the Saturday session hasn't "happened" yet, so it isn't counted
  });

  it("reports the share of the goal uncapped, and 0 when no goal is set", () => {
    const d = data({ sessions: [sess("a", "m", at(19, 9), 2700)] });
    expect(studyForWeek(d, NOW, NOW).goalPct).toBe(150);
    expect(
      studyForWeek({ ...d, settings: makeSettings({ weeklyGoalMin: 0 }) }, NOW, NOW).goalPct,
    ).toBe(0);
  });

  it("always adds up: days to the week, subjects plus 'other' to each day, and to studiedMinOn", () => {
    const rand = rng(2026);
    for (let run = 0; run < 150; run++) {
      const taskIds = ["m", "p", "i", "gone"];
      const blocks: PlanBlock[] = [];
      const sessions: Session[] = [];
      for (let i = 0; i < Math.floor(rand() * 14); i++) {
        const day = 19 + Math.floor(rand() * 7);
        const taskId = taskIds[Math.floor(rand() * 4)]!;
        const minutes = 5 + Math.floor(rand() * 90);
        const timed = rand() < 0.6;
        const blockId = `b${i}`;
        if (rand() < 0.7)
          blocks.push(
            makeBlock({
              id: blockId,
              taskId,
              date: `2026-10-${day}`,
              start: "10:00",
              end: `${10 + Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`,
              status: (["done", "partial", "planned", "missed"] as const)[Math.floor(rand() * 4)]!,
            }),
          );
        if (timed)
          sessions.push(
            sess(
              `s${i}`,
              taskId,
              at(day, 8 + Math.floor(rand() * 10)),
              minutes,
              rand() < 0.5 ? blockId : undefined,
            ),
          );
      }
      const d = data({ blocks, sessions });
      const w = studyForWeek(d, NOW, at(25, 23, 0));
      expect(w.days.reduce((s, x) => s + x.totalMin, 0)).toBe(w.totalMin);
      for (const day of w.days) {
        expect(day.totalMin).toBe(studiedMinOn(day.date, blocks, sessions));
        expect(day.bySubject.maths + day.bySubject.physics + day.bySubject.ict + day.otherMin).toBe(
          day.totalMin,
        );
      }
      const bySubjectSum = SUBJECTS.reduce((s, k) => s + w.bySubject[k], 0);
      expect(bySubjectSum + w.otherMin).toBe(w.totalMin);
    }
  });
});

describe("weeklyTotals", () => {
  it("returns the last weeks oldest first, ending with this one", () => {
    const t = weeklyTotals(
      {
        blocks: [],
        sessions: [
          sess("this", "m", at(20, 10), 60),
          sess("last", "m", at(14, 10), 90),
          sess("older", "m", at(1, 10), 30),
        ],
      },
      NOW,
      6,
    );
    expect(t).toHaveLength(6);
    expect(t.map((w) => w.weekStart)).toEqual([
      "2026-09-14",
      "2026-09-21",
      "2026-09-28",
      "2026-10-05",
      "2026-10-12",
      "2026-10-19",
    ]);
    expect(t.map((w) => w.totalMin)).toEqual([0, 0, 30, 0, 90, 60]);
  });

  it("agrees with studyForWeek for every week", () => {
    const d = data({
      sessions: [sess("a", "m", at(20, 10), 60), sess("b", "p", at(13, 10), 45)],
      blocks: [
        makeBlock({
          id: "x",
          taskId: "i",
          date: "2026-10-08",
          start: "09:00",
          end: "09:30",
          status: "done",
        }),
      ],
    });
    for (const w of weeklyTotals(d, NOW, 6))
      expect(w.totalMin).toBe(studyForWeek(d, new Date(`${w.weekStart}T12:00:00`), NOW).totalMin);
  });
});

describe("workForWeek", () => {
  const done = (id: string, completedAt: Date, over: Partial<Task> = {}) =>
    makeTask({ id, status: "done", completedAt: completedAt.toISOString(), ...over });

  it("counts tasks finished in the week, by the local day they were finished", () => {
    const w = workForWeek(
      {
        tasks: [
          done("in1", at(19, 8)),
          done("in2", at(25, 23, 30)), // Sunday night: still this week
          done("next", at(26, 0, 10)), // just after midnight: next week
          done("prev", at(18, 23, 50)), // Sunday before
          makeTask({ id: "open" }),
        ],
        goals: [],
        blocks: [],
      },
      NOW,
    );
    expect(w.done).toBe(2);
  });

  it("can't place a done task that has no completion time, so it isn't counted", () => {
    const w = workForWeek(
      {
        tasks: [
          makeTask({ id: "old", status: "done" }),
          makeTask({ id: "bad", status: "done", completedAt: "nonsense" }),
        ],
        goals: [],
        blocks: [],
      },
      NOW,
    );
    expect(w.done).toBe(0);
  });

  it("breaks the finished work down by type, skipping types with none", () => {
    const w = workForWeek(
      {
        tasks: [
          done("a", at(20, 9), { type: "paper" }),
          done("b", at(20, 10), { type: "homework" }),
          done("c", at(20, 11), { type: "homework" }),
        ],
        goals: [],
        blocks: [],
      },
      NOW,
    );
    expect(w.doneByType).toEqual([
      { type: "homework", count: 2 },
      { type: "paper", count: 1 },
    ]);
  });

  it("measures on-time finishing against the deadline day, and ignores tasks with no deadline", () => {
    const w = workForWeek(
      {
        tasks: [
          done("early", at(20, 9), { deadline: "2026-10-22" }),
          done("same-day", at(20, 23, 59), { deadline: "2026-10-20" }), // due that day: on time
          done("late", at(21, 8), { deadline: "2026-10-20" }),
          done("none", at(21, 9)),
        ],
        goals: [],
        blocks: [],
      },
      NOW,
    );
    expect(w.done).toBe(4);
    expect(w.withDeadline).toBe(3);
    expect(w.onTime).toBe(2);
  });

  it("lists the week's goals with their progress, and no other week's", () => {
    const w = workForWeek(
      {
        tasks: [
          makeTask({ id: "a", goalId: "g1", status: "done" }),
          makeTask({ id: "b", goalId: "g1" }),
        ],
        goals: [
          makeGoal({ id: "g1", weekStart: "2026-10-19", target: 2 }),
          makeGoal({ id: "g2", weekStart: "2026-10-12" }),
        ],
        blocks: [],
      },
      NOW,
    );
    expect(w.goals.map((g) => g.goal.id)).toEqual(["g1"]);
    expect(w.goals[0]?.progress).toMatchObject({ done: 1, target: 2, percent: 50 });
  });

  it("counts missed pinned blocks in the week with their planned minutes", () => {
    const w = workForWeek(
      {
        tasks: [],
        goals: [],
        blocks: [
          makeBlock({
            id: "1",
            date: "2026-10-20",
            start: "16:00",
            end: "16:45",
            status: "missed",
          }),
          makeBlock({
            id: "2",
            date: "2026-10-21",
            start: "10:00",
            end: "11:00",
            status: "missed",
          }),
          makeBlock({ id: "3", date: "2026-10-12", status: "missed" }),
          makeBlock({ id: "4", date: "2026-10-20", status: "done" }),
        ],
      },
      NOW,
    );
    expect(w.missedBlocks).toBe(2);
    expect(w.missedBlockMin).toBe(105);
  });
});

describe("attentionNow", () => {
  it("counts what needs attention, with the same notion of 'open' as the Today page", () => {
    const a = attentionNow(
      [
        makeTask({ id: "ok" }),
        makeTask({ id: "late", deadline: "2026-10-20" }),
        makeTask({ id: "today", deadline: "2026-10-21" }), // due today isn't overdue
        makeTask({ id: "missed", status: "missed", carryOverCount: 1 }),
        makeTask({ id: "stuck", status: "missed", carryOverCount: 3 }),
        makeTask({ id: "parked", status: "deferred", deadline: "2026-10-01", carryOverCount: 5 }),
        makeTask({ id: "fin", status: "done", deadline: "2026-10-01" }),
      ],
      NOW,
    );
    expect(a).toEqual({ open: 5, overdue: 1, missed: 2, stuck: 1, deferred: 1 });
  });

  it("is all zeros with nothing to do", () => {
    expect(attentionNow([], NOW)).toEqual({
      open: 0,
      overdue: 0,
      missed: 0,
      stuck: 0,
      deferred: 0,
    });
  });
});
