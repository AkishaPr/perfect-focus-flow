import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BACKUP_KEY,
  STORAGE_KEY,
  STORE_VERSION,
  defaultSettings,
  exportData,
  getBackupRaw,
  hydrateStore,
  useStore,
} from "@/lib/store";
import type { Goal, PlanBlock, Task } from "@/lib/types";

const task = (over: Partial<Task> = {}): Task => ({
  id: "t1",
  title: "Maths homework",
  subject: "maths",
  topic: "",
  type: "homework",
  estimateMin: 60,
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
  type: "homework",
  target: 2,
  title: "2 homeworks",
  ...over,
});
const block = (over: Partial<PlanBlock> = {}): PlanBlock => ({
  id: "b1",
  taskId: "t1",
  date: "2026-10-16",
  start: "16:00",
  end: "17:00",
  status: "planned",
  ...over,
});

/** Simulate a fresh page load with `stored` already in localStorage. */
const store = (state: unknown, version = STORE_VERSION) =>
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, version }));

beforeEach(() => {
  localStorage.clear();
  useStore.getState().reset();
  localStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

describe("hydrateStore", () => {
  it("starts from defaults with no notice when nothing is stored", async () => {
    expect(await hydrateStore()).toBeNull();
    expect(useStore.getState().settings).toEqual(defaultSettings());
    expect(useStore.getState().tasks).toEqual([]);
  });

  it("loads valid stored data untouched and without a notice", async () => {
    store({ ...exportData(), tasks: [task()], goals: [goal()] });
    expect(await hydrateStore()).toBeNull();
    expect(useStore.getState().tasks).toHaveLength(1);
    expect(useStore.getState().goals).toHaveLength(1);
    expect(getBackupRaw()).toBeNull();
  });

  it("fills missing nested settings from defaults when the stored version matches", async () => {
    store({ settings: { wake: "06:00" } });
    expect(await hydrateStore()).toBeNull();
    const s = useStore.getState().settings;
    expect(s.wake).toBe("06:00");
    expect(s.weights).toEqual(defaultSettings().weights); // used to be undefined -> Settings page crash
    expect(s.studyWindows.length).toBeGreaterThan(0);
  });

  it("loads data stored by an older version", async () => {
    store({ tasks: [task()] }, 0);
    expect(await hydrateStore()).toBeNull();
    expect(useStore.getState().tasks).toHaveLength(1);
  });

  it("backs up corrupt JSON, starts fresh, and reports it", async () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    const n = await hydrateStore();
    expect(n?.reason).toBe("corrupt");
    expect(getBackupRaw()).toBe("{not json");
    expect(useStore.getState().tasks).toEqual([]);
    // the corrupt value is replaced, so the next load is clean
    expect(() => JSON.parse(localStorage.getItem(STORAGE_KEY)!)).not.toThrow();
    expect(await hydrateStore()).toBeNull();
  });

  it("backs up and resets when stored data is not a backup", async () => {
    store({ foo: "bar" });
    const n = await hydrateStore();
    expect(n?.reason).toBe("invalid");
    expect(JSON.parse(getBackupRaw()!)).toEqual({ foo: "bar" });
    expect(useStore.getState().tasks).toEqual([]);
  });

  it("refuses data from a newer app version but keeps a copy", async () => {
    store({ version: STORE_VERSION + 1, tasks: [task()] });
    const n = await hydrateStore();
    expect(n?.reason).toBe("invalid");
    expect(n?.details.join(" ")).toMatch(/newer version/);
    expect(JSON.parse(getBackupRaw()!).tasks).toHaveLength(1);
    expect(useStore.getState().tasks).toEqual([]);
  });

  it("keeps good entries, drops bad ones, reports, backs up the original, and writes back", async () => {
    store({
      ...exportData(),
      tasks: [task(), { id: "broken" }, task({ id: "t3", importance: 99 })],
    });
    const n = await hydrateStore();
    expect(n?.reason).toBe("repaired");
    expect(n?.details.join(" ")).toMatch(/2 invalid tasks/);
    expect(useStore.getState().tasks.map((t) => t.id)).toEqual(["t1"]);
    expect(JSON.parse(getBackupRaw()!).tasks).toHaveLength(3); // original, untouched
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!).state;
    expect(saved.tasks).toHaveLength(1);
    expect(await hydrateStore()).toBeNull(); // not reported again
  });

  it("does not crash the app when localStorage writes fail", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => useStore.getState().upsertTask(task())).not.toThrow();
    expect(useStore.getState().tasks).toHaveLength(1);
  });

  it("persists changes and restores them on the next load", async () => {
    useStore.getState().upsertTask(task());
    useStore.getState().upsertGoal(goal());
    const before = exportData();
    const stored = localStorage.getItem(STORAGE_KEY)!; // what the browser holds right now
    useStore.setState({ tasks: [], goals: [] }); // in-memory wipe (this also persists)
    localStorage.setItem(STORAGE_KEY, stored); // ...so put back what a reload would find
    expect(await hydrateStore()).toBeNull();
    expect(exportData()).toEqual(before);
  });
});

describe("store actions", () => {
  it("upsert adds then replaces by id", () => {
    const { upsertTask } = useStore.getState();
    upsertTask(task());
    upsertTask(task({ title: "renamed" }));
    expect(useStore.getState().tasks).toHaveLength(1);
    expect(useStore.getState().tasks[0]!.title).toBe("renamed");
  });

  it("deleteTask removes planned blocks but keeps done blocks and sessions", () => {
    useStore.setState({
      tasks: [task()],
      blocks: [block(), block({ id: "b2", status: "done" })],
      sessions: [{ id: "s1", taskId: "t1", start: "a", end: "b", actualMin: 30 }],
    });
    useStore.getState().deleteTask("t1");
    const s = useStore.getState();
    expect(s.tasks).toEqual([]);
    expect(s.blocks.map((b) => b.id)).toEqual(["b2"]);
    expect(s.sessions).toHaveLength(1);
  });

  it("deleteGoal unlinks its tasks instead of deleting them", () => {
    useStore.setState({ goals: [goal()], tasks: [task({ goalId: "g1" }), task({ id: "t2" })] });
    useStore.getState().deleteGoal("g1");
    const s = useStore.getState();
    expect(s.goals).toEqual([]);
    expect(s.tasks).toHaveLength(2);
    expect(s.tasks.every((t) => t.goalId === undefined)).toBe(true);
  });

  it("reset restores defaults", () => {
    useStore.getState().upsertTask(task());
    useStore.getState().reset();
    expect(useStore.getState().tasks).toEqual([]);
    expect(useStore.getState().settings).toEqual(defaultSettings());
  });
});

describe("backup key", () => {
  it("is separate from the live data key", () => {
    expect(BACKUP_KEY).not.toBe(STORAGE_KEY);
  });
});
