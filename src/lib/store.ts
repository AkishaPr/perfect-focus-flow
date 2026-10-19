import { create } from "zustand";
import { persist, type PersistStorage } from "zustand/middleware";
import { fromMin, toMin, ymd } from "./calendar";
import {
  deleteSessionState,
  markInProgress,
  recordFocusSegment,
  type SegmentInput,
} from "./focus/segments";
import { resolveMissedState, type Decision } from "./planner/recovery";
import { describeReport, isCleanReport, sanitizeStoreData, type MigrationReport } from "./schema";
import type { CalEvent, Goal, PaperMark, PlanBlock, Settings, StoreData, Task } from "./types";

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

/**
 * Validate and upgrade raw data (a stored state or an imported backup) to the current shape.
 * Throws `InvalidBackupError` if it is clearly not a backup; otherwise bad entries are skipped
 * or repaired and described in the returned report. Per-version upgrade steps for future
 * `STORE_VERSION` bumps belong here, before `sanitizeStoreData`.
 */
export function migrateWithReport(raw: unknown): { data: StoreData; report: MigrationReport } {
  return sanitizeStoreData(raw, emptyData(), STORE_VERSION);
}

/** Same as `migrateWithReport` when you only need the data. */
export function migrate(raw: unknown): StoreData {
  return migrateWithReport(raw).data;
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
  /** Commit a planned block as "doing this now": keeps it in place and marks its task in progress. */
  startBlock: (block: PlanBlock) => void;
  /** Undo `startBlock`: drop the committed block; the task goes back to "to do" if nothing else holds it. */
  releaseBlock: (blockId: string) => void;
  /** Finish a committed block and its task. */
  completeBlock: (blockId: string, now?: Date) => void;
  /** Stage 6: log a finished focus segment as a session plus a done/partial block. */
  logFocusSegment: (seg: SegmentInput) => void;
  /** Stage 6: delete a session and the block it produced. */
  deleteSession: (id: string) => void;
  /** Stage 6: a timer started on this task, so it is no longer just "to do". */
  markTaskInProgress: (taskId: string) => void;
  /** Stage 8: add or update a paper mark. The planner reads marks to spot weaker subjects. */
  upsertMark: (m: PaperMark) => void;
  deleteMark: (id: string) => void;
  /** Stage 7: apply the user's choices for missed work (carry over, skip, defer, done). */
  resolveMissed: (decisions: Decision[], now?: Date) => void;
}

const upsert = <T extends { id: string }>(list: T[], item: T) =>
  list.some((x) => x.id === item.id)
    ? list.map((x) => (x.id === item.id ? item : x))
    : [...list, item];

export const STORAGE_KEY = "alcc:v1";
/** Raw copy of data that could not be loaded cleanly, kept so nothing is silently lost. */
export const BACKUP_KEY = "alcc:v1:backup";

export interface RecoveryNotice {
  reason: "corrupt" | "invalid" | "repaired";
  details: string[];
}

let pendingNotice: RecoveryNotice | null = null;

function saveBackup(raw: string) {
  try {
    localStorage.setItem(BACKUP_KEY, raw);
  } catch (e) {
    console.error("Could not keep a copy of the unreadable data", e);
  }
}

/** The raw data saved by the last recovery, or null. */
export function getBackupRaw(): string | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(BACKUP_KEY);
  } catch {
    return null;
  }
}

/**
 * Storage that never throws into the app: unreadable JSON is backed up and treated as empty, and a
 * failed write (quota, private mode) is logged instead of crashing the UI.
 */
const safeStorage = {
  getItem: (name: string) => {
    if (typeof localStorage === "undefined") return null;
    let raw: string | null;
    try {
      raw = localStorage.getItem(name);
    } catch {
      return null;
    }
    if (raw === null) return null;
    try {
      return JSON.parse(raw);
    } catch {
      saveBackup(raw);
      pendingNotice = {
        reason: "corrupt",
        details: ["The saved data in this browser was not valid JSON."],
      };
      return null;
    }
  },
  setItem: (name: string, value: unknown) => {
    try {
      localStorage.setItem(name, JSON.stringify(value));
    } catch (e) {
      console.error("Could not save A/L Command Center data", e);
    }
  },
  removeItem: (name: string) => {
    try {
      localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
} as PersistStorage<StoreData & Actions>;

/** Keeps `completedAt` in step with status: set when first marked done, cleared when reopened. */
export function withCompletion(prev: Task | undefined, next: Task, now = new Date()): Task {
  if (next.status !== "done") return { ...next, completedAt: undefined };
  const kept = prev?.status === "done" ? (prev.completedAt ?? next.completedAt) : undefined;
  return { ...next, completedAt: kept ?? now.toISOString() };
}

type BlockState = Pick<StoreData, "tasks" | "blocks">;

/**
 * Pure state transitions for committed blocks (the user's own "I'm doing this" decisions, which
 * the planner treats as locked). Exported so they can be tested without the store.
 */
export function startBlockState(s: BlockState, b: PlanBlock): BlockState {
  const task = s.tasks.find((t) => t.id === b.taskId);
  if (!task || task.status === "done") return s;
  // Persist only what a PlanBlock is: the planner's extra fields (score, reasons…) stay out of storage.
  const committed: PlanBlock = {
    id: b.id,
    taskId: b.taskId,
    date: b.date,
    start: b.start,
    end: b.end,
    status: "planned",
  };
  return {
    blocks: upsert(s.blocks, committed),
    tasks: s.tasks.map((t) => (t.id === task.id ? { ...t, status: "in_progress" } : t)),
  };
}

export function releaseBlockState(s: BlockState, blockId: string): BlockState {
  const b = s.blocks.find((x) => x.id === blockId);
  if (!b || b.status !== "planned") return s;
  const blocks = s.blocks.filter((x) => x.id !== blockId);
  const stillCommitted = blocks.some((x) => x.taskId === b.taskId && x.status === "planned");
  return {
    blocks,
    tasks: s.tasks.map((t) =>
      t.id === b.taskId && t.status === "in_progress" && !stillCommitted
        ? { ...t, status: "todo" }
        : t,
    ),
  };
}

/**
 * Mark the block and its task done. Finishing early shortens the block to now (so study time isn't
 * overstated); finishing late keeps the planned end, because the real end isn't known without a
 * timer. Other still-pending commitments for the same task are dropped, since the task is done.
 */
export function completeBlockState(s: BlockState, blockId: string, now = new Date()): BlockState {
  const b = s.blocks.find((x) => x.id === blockId);
  if (!b || b.status !== "planned") return s;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const finishedEarly = nowMin >= toMin(b.start) + 5 && nowMin < toMin(b.end);
  const done: PlanBlock = {
    ...b,
    status: "done",
    end: finishedEarly && b.date === ymd(now) ? fromMin(nowMin) : b.end,
  };
  return {
    blocks: s.blocks
      .filter((x) => x.id === blockId || x.taskId !== b.taskId || x.status !== "planned")
      .map((x) => (x.id === blockId ? done : x)),
    tasks: s.tasks.map((t) =>
      t.id === b.taskId ? withCompletion(t, { ...t, status: "done" }, now) : t,
    ),
  };
}

export const useStore = create<StoreData & Actions>()(
  persist(
    (set) => ({
      ...emptyData(),
      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      replaceAll: (data) => set(() => ({ ...data })),
      reset: () => set(() => emptyData()),
      upsertEvent: (e) => set((s) => ({ events: upsert(s.events, e) })),
      deleteEvent: (id) => set((s) => ({ events: s.events.filter((x) => x.id !== id) })),
      upsertTask: (t) =>
        set((s) => ({
          tasks: upsert(
            s.tasks,
            withCompletion(
              s.tasks.find((x) => x.id === t.id),
              t,
            ),
          ),
        })),
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
      startBlock: (block) => set((s) => startBlockState(s, block)),
      releaseBlock: (blockId) => set((s) => releaseBlockState(s, blockId)),
      completeBlock: (blockId, now) => set((s) => completeBlockState(s, blockId, now)),
      logFocusSegment: (seg) => set((s) => recordFocusSegment(s, seg)),
      deleteSession: (id) => set((s) => deleteSessionState(s, id)),
      markTaskInProgress: (taskId) => set((s) => ({ tasks: markInProgress(s.tasks, taskId) })),
      upsertMark: (m) => set((s) => ({ marks: upsert(s.marks, m) })),
      deleteMark: (id) => set((s) => ({ marks: s.marks.filter((x) => x.id !== id) })),
      resolveMissed: (decisions, now) =>
        set((s) => resolveMissedState(s, decisions, now ?? new Date())),
    }),
    {
      name: STORAGE_KEY,
      version: STORE_VERSION,
      storage: safeStorage,
      skipHydration: true,
      // Zustand only calls `migrate` when the stored version differs, so it can't be the safety net.
      // Validation runs on every load in `merge` below, which calls our zod-validated migrate().
      migrate: (persisted) => persisted as StoreData & Actions,
      merge: (persisted, current) => {
        if (persisted === undefined || persisted === null) return current;
        try {
          const { data, report } = migrateWithReport(persisted);
          if (!isCleanReport(report)) {
            saveBackup(JSON.stringify(persisted));
            pendingNotice = { reason: "repaired", details: describeReport(report) };
          }
          return { ...current, ...data };
        } catch (e) {
          saveBackup(JSON.stringify(persisted));
          pendingNotice = {
            reason: "invalid",
            details: [e instanceof Error ? e.message : "The saved data could not be used."],
          };
          return current;
        }
      },
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

/**
 * Load saved data into the store (call once on the client). Resolves with a notice if anything had
 * to be skipped, repaired or reset, so the UI can tell the user; the raw original is in BACKUP_KEY.
 */
export async function hydrateStore(): Promise<RecoveryNotice | null> {
  await useStore.persist.rehydrate();
  const notice = pendingNotice;
  pendingNotice = null;
  // Write the repaired state back so the same problem is not reported on every reload.
  if (notice) useStore.setState({});
  return notice;
}

export const uid = () => crypto.randomUUID();
