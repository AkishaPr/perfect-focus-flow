import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { z } from "zod";
import type { CalEvent, Goal, PlanBlock, Settings, StoreData, Task } from "./types";
import { mergePlan } from "./planner/fit";

export const STORE_VERSION = 1;

export const defaultSettings = (): Settings => ({
  timezone: "Asia/Colombo",
  wake: "05:30",
  sleep: "22:30",
  studyWindows: [0, 1, 2, 3, 4, 5, 6].flatMap((day) =>
    day === 0 || day === 6
      ? [
          { day, start: "07:00", end: "12:00" },
          { day, start: "14:00", end: "21:00" },
        ]
      : [{ day, start: "15:30", end: "21:30" }],
  ),
  focusMin: 50,
  breakMin: 10,
  maxDailyStudyMin: 360,
  dailyGoalMin: 240,
  weeklyGoalMin: 1800,
  weights: { deadline: 30, overdue: 20, importance: 20, weakTopic: 15, goal: 10, carryOver: 5 },
  weakTopics: [],
});

const emptyData = (): StoreData => ({
  version: STORE_VERSION,
  settings: defaultSettings(),
  events: [],
  tasks: [],
  goals: [],
  blocks: [],
  sessions: [],
  marks: [],
});

const time = z.string().regex(/^\d{2}:\d{2}$/);
const subject = z.enum(["maths", "physics", "ict"]);

export const storeSchema = z.object({
  version: z.number(),
  settings: z.object({
    timezone: z.string(),
    wake: time,
    sleep: time,
    studyWindows: z.array(z.object({ day: z.number().min(0).max(6), start: time, end: time })),
    focusMin: z.number(),
    breakMin: z.number(),
    maxDailyStudyMin: z.number(),
    dailyGoalMin: z.number(),
    weeklyGoalMin: z.number(),
    weights: z.object({
      deadline: z.number(),
      overdue: z.number(),
      importance: z.number(),
      weakTopic: z.number(),
      goal: z.number(),
      carryOver: z.number(),
    }),
    weakTopics: z.array(z.object({ subject, topic: z.string() })),
  }),
  events: z.array(z.any()),
  tasks: z.array(z.any()),
  goals: z.array(z.any()),
  blocks: z.array(z.any()),
  sessions: z.array(z.any()),
  marks: z.array(z.any()),
});

/** Upgrade older backups to the current shape. */
export function migrate(raw: unknown): StoreData {
  const obj = (raw ?? {}) as Partial<StoreData>;
  const base = emptyData();
  const merged = {
    ...base,
    ...obj,
    settings: { ...base.settings, ...(obj.settings ?? {}) },
    version: STORE_VERSION,
  };
  return storeSchema.parse(merged) as StoreData;
}

interface Actions {
  updateSettings: (patch: Partial<Settings>) => void;
  replaceAll: (data: StoreData) => void;
  reset: () => void;
  upsertEvent: (e: CalEvent) => void;
  deleteEvent: (id: string) => void;
  upsertTask: (t: Task) => void;
  deleteTask: (id: string) => void;
  upsertGoal: (g: Goal) => void;
  deleteGoal: (id: string) => void;
  applyPlan: (proposed: PlanBlock[], dates: string[], now?: Date) => void;
  clearPlanned: (dates: string[], now?: Date) => void;
}

const upsert = <T extends { id: string }>(list: T[], item: T) =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];

export const useStore = create<StoreData & Actions>()(
  persist(
    (set) => ({
      ...emptyData(),
      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      replaceAll: (data) => set(() => ({ ...data })),
      reset: () => set(() => emptyData()),
      upsertEvent: (e) => set((s) => ({ events: upsert(s.events, e) })),
      deleteEvent: (id) => set((s) => ({ events: s.events.filter((x) => x.id !== id) })),
      upsertTask: (t) => set((s) => ({ tasks: upsert(s.tasks, t) })),
      // Removing a task also removes its planned (not completed) blocks.
      deleteTask: (id) =>
        set((s) => ({
          tasks: s.tasks.filter((x) => x.id !== id),
          blocks: s.blocks.filter((b) => b.taskId !== id || b.status === "done"),
        })),
      upsertGoal: (g) => set((s) => ({ goals: upsert(s.goals, g) })),
      deleteGoal: (id) =>
        set((s) => ({
          goals: s.goals.filter((x) => x.id !== id),
          tasks: s.tasks.map((t) => (t.goalId === id ? { ...t, goalId: undefined } : t)),
        })),
      applyPlan: (proposed, dates, now) => set((s) => ({ blocks: mergePlan(s.blocks, proposed, dates, now) })),
      clearPlanned: (dates, now) => set((s) => ({ blocks: mergePlan(s.blocks, [], dates, now) })),
    }),
    {
      name: "alcc:v1",
      version: STORE_VERSION,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      migrate: (state) => migrate(state),
    },
  ),
);

export function exportData(): StoreData {
  const s = useStore.getState();
  return {
    version: STORE_VERSION,
    settings: s.settings,
    events: s.events,
    tasks: s.tasks,
    goals: s.goals,
    blocks: s.blocks,
    sessions: s.sessions,
    marks: s.marks,
  };
}

export const uid = () => crypto.randomUUID();
