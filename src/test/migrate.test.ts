import { describe, expect, it } from "vitest";
import { defaultSettings, migrate, migrateWithReport, STORE_VERSION } from "@/lib/store";
import { InvalidBackupError, describeReport, isCleanReport } from "@/lib/schema";
import type { CalEvent, Goal, Task } from "@/lib/types";

const task = (over: Partial<Task> = {}): Task => ({
  id: "t1",
  title: "Physics Paper II",
  subject: "physics",
  topic: "Vectors",
  type: "paper",
  estimateMin: 90,
  importance: 3,
  splittable: true,
  minChunkMin: 25,
  status: "todo",
  carryOverCount: 0,
  createdAt: "2026-10-12T08:00:00.000Z",
  ...over,
});
const goal = (over: Partial<Goal> = {}): Goal => ({
  id: "g1",
  weekStart: "2026-10-12",
  type: "paper",
  target: 3,
  title: "3 papers",
  ...over,
});
const event = (over: Partial<CalEvent> = {}): CalEvent => ({
  id: "e1",
  title: "Maths class",
  kind: "class",
  mode: "physical",
  recurrence: "weekly",
  weekday: 1,
  start: "14:00",
  end: "16:00",
  ...over,
});

describe("migrate: rejects things that are not backups", () => {
  it.each([
    ["empty object", {}],
    ["array", []],
    ["null", null],
    ["string", "hello"],
    ["number", 42],
    ["version only", { version: 1 }],
    ["unrelated object", { foo: "bar" }],
  ])("%s", (_name, raw) => {
    expect(() => migrate(raw)).toThrow(InvalidBackupError);
  });

  it("rejects a backup from a newer app version", () => {
    expect(() => migrate({ version: STORE_VERSION + 1, tasks: [] })).toThrow(/newer version/);
  });
});

describe("migrate: accepts and normalises real data", () => {
  it("fills every missing field from defaults", () => {
    const { data, report } = migrateWithReport({ tasks: [task()] });
    expect(data.version).toBe(STORE_VERSION);
    expect(data.settings).toEqual(defaultSettings());
    expect(data.tasks).toHaveLength(1);
    expect(data.events).toEqual([]);
    expect(isCleanReport(report)).toBe(true);
  });

  it("deep-merges partial settings over defaults (including weights)", () => {
    const data = migrate({ settings: { wake: "06:00", weights: { deadline: 50 } } });
    expect(data.settings.wake).toBe("06:00");
    expect(data.settings.weights.deadline).toBe(50);
    expect(data.settings.weights.overdue).toBe(defaultSettings().weights.overdue);
    expect(data.settings.studyWindows).toEqual(defaultSettings().studyWindows);
  });

  it("round-trips a fully populated export unchanged", () => {
    const full = {
      version: STORE_VERSION,
      settings: { ...defaultSettings(), weakTopics: [{ subject: "maths", topic: "Vectors" }] },
      events: [event(), event({ id: "e2", recurrence: "none", date: "2026-10-20" })],
      tasks: [
        task({ goalId: "g1", completedAt: "2026-10-14T10:00:00.000Z", deadline: "2026-10-30" }),
      ],
      goals: [goal()],
      blocks: [
        {
          id: "b1",
          taskId: "t1",
          date: "2026-10-16",
          start: "16:00",
          end: "17:00",
          status: "planned",
        },
      ],
      sessions: [{ id: "s1", taskId: "t1", start: "a", end: "b", actualMin: 50 }],
      marks: [
        { id: "m1", subject: "ict", paperName: "2019 P1", date: "2026-09-01", score: 55, max: 100 },
      ],
    };
    const { data, report } = migrateWithReport(JSON.parse(JSON.stringify(full)));
    expect(data).toEqual(full);
    expect(isCleanReport(report)).toBe(true);
  });

  it("accepts tasks saved before completedAt existed", () => {
    const t = task();
    expect("completedAt" in t).toBe(false);
    expect(migrate({ tasks: [t] }).tasks[0]).toEqual(t);
  });
});

describe("migrate: skips bad entries and reports them", () => {
  it("drops invalid tasks but keeps valid ones", () => {
    const { data, report } = migrateWithReport({
      tasks: [task(), 1, "a", null, task({ id: "t2", importance: 9 }), { id: "t3" }],
    });
    expect(data.tasks.map((t) => t.id)).toEqual(["t1"]);
    expect(report.dropped["tasks"]).toBe(5);
    expect(describeReport(report).join(" ")).toMatch(/5 invalid tasks entries were skipped/);
  });

  it("drops duplicate ids, keeping the first", () => {
    const { data, report } = migrateWithReport({
      tasks: [task({ title: "first" }), task({ title: "second" })],
    });
    expect(data.tasks).toHaveLength(1);
    expect(data.tasks[0]!.title).toBe("first");
    expect(report.dropped["tasks"]).toBe(1);
  });

  it("validates events: end before start, missing weekday, one-time without date", () => {
    const { data, report } = migrateWithReport({
      events: [
        event(),
        event({ id: "bad1", start: "16:00", end: "14:00" }),
        { ...event({ id: "bad2" }), weekday: undefined },
        event({ id: "bad3", recurrence: "none", date: "" }),
        event({ id: "bad4", recurrence: "none", date: "2026-02-31" }),
        event({ id: "bad5", start: "9:00" }),
      ],
    });
    expect(data.events.map((e) => e.id)).toEqual(["e1"]);
    expect(report.dropped["events"]).toBe(5);
  });

  it("drops inverted study windows and invalid weak topics", () => {
    const { data, report } = migrateWithReport({
      settings: {
        studyWindows: [
          { day: 1, start: "15:00", end: "18:00" },
          { day: 1, start: "20:00", end: "08:00" },
          { day: 9, start: "10:00", end: "11:00" },
        ],
        weakTopics: [
          { subject: "maths", topic: "Vectors" },
          { subject: "art", topic: "x" },
        ],
      },
    });
    expect(data.settings.studyWindows).toEqual([{ day: 1, start: "15:00", end: "18:00" }]);
    expect(data.settings.weakTopics).toHaveLength(1);
    expect(report.dropped["studyWindows"]).toBe(2);
    expect(report.dropped["weakTopics"]).toBe(1);
  });

  it("resets invalid scalar settings and weights to defaults, and says so", () => {
    const { data, report } = migrateWithReport({
      settings: {
        wake: "abc",
        maxDailyStudyMin: -5,
        focusMin: "fifty",
        weights: { deadline: -1, overdue: 25 },
      },
    });
    const d = defaultSettings();
    expect(data.settings.wake).toBe(d.wake);
    expect(data.settings.maxDailyStudyMin).toBe(d.maxDailyStudyMin);
    expect(data.settings.focusMin).toBe(d.focusMin);
    expect(data.settings.weights.deadline).toBe(d.weights.deadline);
    expect(data.settings.weights.overdue).toBe(25);
    expect(report.repaired).toHaveLength(4);
  });

  it("treats a non-object settings value as 'reset to defaults'", () => {
    const { data, report } = migrateWithReport({ settings: "oops", tasks: [] });
    expect(data.settings).toEqual(defaultSettings());
    expect(report.repaired[0]).toMatch(/settings were unreadable/);
  });

  it("treats a non-array collection as one dropped entry", () => {
    const { data, report } = migrateWithReport({ tasks: "nope", goals: [] });
    expect(data.tasks).toEqual([]);
    expect(report.dropped["tasks"]).toBe(1);
  });

  it("unlinks tasks whose goal is missing, but keeps the tasks", () => {
    const { data, report } = migrateWithReport({
      goals: [goal()],
      tasks: [task({ goalId: "g1" }), task({ id: "t2", goalId: "ghost" })],
    });
    expect(data.tasks).toHaveLength(2);
    expect(data.tasks.find((t) => t.id === "t1")!.goalId).toBe("g1");
    expect("goalId" in data.tasks.find((t) => t.id === "t2")!).toBe(false);
    expect(report.repaired.join(" ")).toMatch(/1 task linked to a missing goal was unlinked/);
  });

  it("keeps sessions and done blocks for deleted tasks (study history)", () => {
    const { data, report } = migrateWithReport({
      tasks: [],
      sessions: [{ id: "s1", taskId: "deleted", start: "a", end: "b", actualMin: 30 }],
      blocks: [
        {
          id: "b1",
          taskId: "deleted",
          date: "2026-10-16",
          start: "16:00",
          end: "17:00",
          status: "done",
        },
      ],
    });
    expect(data.sessions).toHaveLength(1);
    expect(data.blocks).toHaveLength(1);
    expect(isCleanReport(report)).toBe(true);
  });

  it("rejects marks where score exceeds max", () => {
    const { data } = migrateWithReport({
      marks: [
        { id: "m1", subject: "ict", paperName: "P", date: "2026-09-01", score: 120, max: 100 },
        { id: "m2", subject: "ict", paperName: "P", date: "2026-09-01", score: 80, max: 100 },
      ],
    });
    expect(data.marks.map((m) => m.id)).toEqual(["m2"]);
  });
});
