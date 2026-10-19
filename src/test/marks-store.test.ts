import { beforeEach, describe, expect, it } from "vitest";
import { exportData, migrate, useStore } from "@/lib/store";
import { makeMark } from "./planner-fixtures";

beforeEach(() => useStore.getState().reset());

describe("paper marks in the store", () => {
  it("adds a mark and updates it in place by id", () => {
    const { upsertMark } = useStore.getState();
    upsertMark(makeMark({ id: "a", score: 60 }));
    upsertMark(makeMark({ id: "b", score: 70 }));
    upsertMark(makeMark({ id: "a", score: 65, paperName: "Renamed" }));
    const marks = useStore.getState().marks;
    expect(marks.map((m) => [m.id, m.score])).toEqual([
      ["a", 65],
      ["b", 70],
    ]);
    expect(marks[0]?.paperName).toBe("Renamed");
  });

  it("deletes only the chosen mark", () => {
    const { upsertMark, deleteMark } = useStore.getState();
    upsertMark(makeMark({ id: "a" }));
    upsertMark(makeMark({ id: "b" }));
    deleteMark("a");
    expect(useStore.getState().marks.map((m) => m.id)).toEqual(["b"]);
    deleteMark("nope");
    expect(useStore.getState().marks).toHaveLength(1);
  });

  it("travels with backups: export, then import restores the same marks", () => {
    useStore
      .getState()
      .upsertMark(makeMark({ id: "a", score: 41.5, max: 60, paperName: "2023 Paper II" }));
    const backup = JSON.parse(JSON.stringify(exportData()));
    useStore.getState().reset();
    expect(useStore.getState().marks).toEqual([]);
    useStore.getState().replaceAll(migrate(backup));
    expect(useStore.getState().marks).toEqual([
      makeMark({ id: "a", score: 41.5, max: 60, paperName: "2023 Paper II" }),
    ]);
  });

  it("drops an invalid imported mark instead of rejecting the whole backup", () => {
    const backup = JSON.parse(JSON.stringify(exportData()));
    backup.marks = [makeMark({ id: "ok" }), makeMark({ id: "bad", score: 150, max: 100 })];
    expect(migrate(backup).marks.map((m) => m.id)).toEqual(["ok"]);
  });
});
