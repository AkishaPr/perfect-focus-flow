import { z } from "zod";
import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";
import type { Decision, DayPlan } from "../planner/recovery";
import { useStore } from "../store";

/**
 * What each day's plan promised, kept in its own small localStorage slice until the next day's
 * review. Like the timer it is transient bookkeeping, not study history: the outcome of a review
 * lands on the tasks themselves (carry-over count, status), so backups and the data schema
 * version are untouched. Losing it only means one missed review.
 */
export const PLAN_LOG_KEY = "alcc:v1:planlog";
/** Oldest snapshots are dropped past this many days. */
export const MAX_LOGS = 21;

const dayPlanSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z.array(
    z.object({ taskId: z.string().min(1), plannedMin: z.number().finite().positive() }),
  ),
});

/** The valid snapshots in a saved value, one per date, oldest first. Anything else is dropped. */
export function parsePlanLogs(raw: unknown): DayPlan[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: DayPlan[] = [];
  for (const entry of raw) {
    const r = dayPlanSchema.safeParse(entry);
    if (!r.success || r.data.items.length === 0 || seen.has(r.data.date)) continue;
    seen.add(r.data.date);
    out.push(r.data);
  }
  return out.sort((a, z) => a.date.localeCompare(z.date)).slice(-MAX_LOGS);
}

type Persisted = { logs: DayPlan[] };

interface PlanLogState {
  logs: DayPlan[];
  /** Remember a day's plan. The first snapshot of a day wins, so later changes don't move the goalposts. */
  record: (plan: DayPlan) => void;
  /** Forget these tasks on days before `before` (they've been dealt with). */
  dropTasks: (taskIds: string[], before: string) => void;
  /** Forget every day before `date`. */
  clearBefore: (date: string) => void;
}

const safeStorage: PersistStorage<Persisted> = {
  getItem: (name) => {
    try {
      const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(name);
      return raw === null ? null : (JSON.parse(raw) as StorageValue<Persisted>);
    } catch {
      return null; // unreadable log: start empty, nothing of value is lost
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, JSON.stringify(value));
    } catch (e) {
      console.error("Could not save the plan log", e);
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
};

export const usePlanLog = create<PlanLogState>()(
  persist<PlanLogState, [], [], Persisted>(
    (set) => ({
      logs: [],
      record: (plan) =>
        set((s) =>
          s.logs.some((l) => l.date === plan.date) ? s : { logs: parsePlanLogs([...s.logs, plan]) },
        ),
      dropTasks: (taskIds, before) =>
        set((s) => {
          const drop = new Set(taskIds);
          const logs = s.logs
            .map((l) =>
              l.date < before ? { ...l, items: l.items.filter((i) => !drop.has(i.taskId)) } : l,
            )
            .filter((l) => l.items.length > 0);
          return { logs };
        }),
      clearBefore: (date) => set((s) => ({ logs: s.logs.filter((l) => l.date >= date) })),
    }),
    {
      name: PLAN_LOG_KEY,
      version: 1,
      storage: safeStorage,
      // Like the main store: load on the client only (the app is server-rendered).
      skipHydration: true,
      partialize: (s) => ({ logs: s.logs }),
      merge: (persisted, current) => ({
        ...current,
        logs: parsePlanLogs((persisted as Persisted | undefined)?.logs),
      }),
    },
  ),
);

/** Load the saved plan log (call once on the client, next to `hydrateStore`). */
export async function hydratePlanLog(): Promise<void> {
  await usePlanLog.persist.rehydrate();
}

/** Apply the user's choices for missed tasks, then forget those tasks in the earlier-day snapshots. */
export function resolveReview(decisions: Decision[], today: string, now = new Date()): void {
  if (decisions.length === 0) return;
  useStore.getState().resolveMissed(decisions, now);
  usePlanLog.getState().dropTasks(
    decisions.map((d) => d.taskId),
    today,
  );
}
