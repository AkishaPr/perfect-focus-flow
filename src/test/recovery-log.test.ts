import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_LOGS,
  PLAN_LOG_KEY,
  hydratePlanLog,
  parsePlanLogs,
  resolveReview,
  usePlanLog,
} from "@/lib/recovery/log";
import { useStore } from "@/lib/store";
import { at, makeBlock, makeTask } from "./planner-fixtures";

const day = (date: string, ...taskIds: string[]) => ({
  date,
  items: taskIds.map((taskId) => ({ taskId, plannedMin: 60 })),
});

beforeEach(() => {
  useStore.getState().reset();
  usePlanLog.setState({ logs: [] });
  localStorage.removeItem(PLAN_LOG_KEY);
});

describe("parsePlanLogs", () => {
  it("keeps valid snapshots, one per date, oldest first", () => {
    const logs = parsePlanLogs([
      day("2026-10-19", "a"),
      day("2026-10-18", "b"),
      day("2026-10-19", "c"), // duplicate date: the first wins
    ]);
    expect(logs.map((l) => [l.date, l.items[0]?.taskId])).toEqual([
      ["2026-10-18", "b"],
      ["2026-10-19", "a"],
    ]);
  });

  it("drops anything malformed instead of failing", () => {
    expect(parsePlanLogs("nope")).toEqual([]);
    expect(parsePlanLogs(null)).toEqual([]);
    const logs = parsePlanLogs([
      day("2026-10-19", "a"),
      { date: "yesterday", items: [{ taskId: "a", plannedMin: 60 }] },
      { date: "2026-10-18", items: [{ taskId: "", plannedMin: 60 }] },
      { date: "2026-10-17", items: [{ taskId: "a", plannedMin: -5 }] },
      { date: "2026-10-16", items: [] },
      { date: "2026-10-15" },
      42,
    ]);
    expect(logs.map((l) => l.date)).toEqual(["2026-10-19"]);
  });

  it("keeps only the most recent days", () => {
    const many = Array.from({ length: MAX_LOGS + 5 }, (_, i) =>
      day(`2026-09-${String(i + 1).padStart(2, "0")}`, "a"),
    );
    const logs = parsePlanLogs(many);
    expect(logs).toHaveLength(MAX_LOGS);
    expect(logs[logs.length - 1]?.date).toBe(`2026-09-${String(MAX_LOGS + 5).padStart(2, "0")}`);
  });
});

describe("usePlanLog", () => {
  it("keeps the first snapshot of a day and ignores later ones", () => {
    usePlanLog.getState().record(day("2026-10-19", "a"));
    usePlanLog.getState().record(day("2026-10-19", "a", "b"));
    expect(usePlanLog.getState().logs).toEqual([day("2026-10-19", "a")]);
  });

  it("forgets tasks on earlier days only, and drops days left empty", () => {
    const s = usePlanLog.getState();
    s.record(day("2026-10-18", "a"));
    s.record(day("2026-10-19", "a", "b"));
    s.record(day("2026-10-20", "a"));
    usePlanLog.getState().dropTasks(["a"], "2026-10-20");
    expect(usePlanLog.getState().logs).toEqual([day("2026-10-19", "b"), day("2026-10-20", "a")]);
  });

  it("clears every day before a date", () => {
    const s = usePlanLog.getState();
    s.record(day("2026-10-18", "a"));
    s.record(day("2026-10-20", "a"));
    usePlanLog.getState().clearBefore("2026-10-20");
    expect(usePlanLog.getState().logs.map((l) => l.date)).toEqual(["2026-10-20"]);
  });

  it("saves to its own key and loads back after a restart", async () => {
    usePlanLog.getState().record(day("2026-10-19", "a"));
    const raw = localStorage.getItem(PLAN_LOG_KEY)!;
    expect(JSON.parse(raw).state.logs).toEqual([day("2026-10-19", "a")]);
    // A restart: memory is empty, the saved value is what the last session left behind.
    // (setState saves too, so put the old value back before loading.)
    usePlanLog.setState({ logs: [] });
    localStorage.setItem(PLAN_LOG_KEY, raw);
    await hydratePlanLog();
    expect(usePlanLog.getState().logs).toEqual([day("2026-10-19", "a")]);
  });

  it("starts empty from a corrupted save instead of crashing", async () => {
    localStorage.setItem(PLAN_LOG_KEY, "{not json");
    await hydratePlanLog();
    expect(usePlanLog.getState().logs).toEqual([]);
    localStorage.setItem(PLAN_LOG_KEY, JSON.stringify({ state: { logs: "garbage" }, version: 1 }));
    await hydratePlanLog();
    expect(usePlanLog.getState().logs).toEqual([]);
  });

  it("never touches the main data key", () => {
    const before = localStorage.getItem("alcc:v1");
    usePlanLog.getState().record(day("2026-10-19", "a"));
    usePlanLog.getState().clearBefore("2026-12-01");
    expect(localStorage.getItem("alcc:v1")).toBe(before);
  });
});

describe("resolveReview", () => {
  it("applies the choice to the task and forgets it in the earlier snapshots", () => {
    useStore.setState({
      tasks: [makeTask({ id: "a" }), makeTask({ id: "b" })],
      blocks: [makeBlock({ id: "old", taskId: "a", date: "2026-10-19" })],
    });
    usePlanLog.getState().record(day("2026-10-19", "a", "b"));
    resolveReview([{ taskId: "a", action: "carry" }], "2026-10-20", at(20, 9, 0));

    const a = useStore.getState().tasks.find((t) => t.id === "a")!;
    expect(a).toMatchObject({ carryOverCount: 1, status: "missed" });
    expect(useStore.getState().tasks.find((t) => t.id === "b")?.carryOverCount).toBe(0);
    expect(useStore.getState().blocks[0]?.status).toBe("missed"); // stale pinned block closed
    expect(usePlanLog.getState().logs).toEqual([day("2026-10-19", "b")]);
  });

  it("does nothing for an empty list", () => {
    useStore.setState({ tasks: [makeTask({ id: "a" })] });
    usePlanLog.getState().record(day("2026-10-19", "a"));
    resolveReview([], "2026-10-20");
    expect(usePlanLog.getState().logs).toHaveLength(1);
  });
});
