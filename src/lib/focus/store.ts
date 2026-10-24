import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";
import { toMin } from "../calendar";
import { uid, useStore } from "../store";
import type { PlanBlock } from "../types";
import {
  parseTimerState,
  pause,
  resume,
  startTimer,
  suggestedMinutes,
  toBreak,
  toFocus,
  type TimerState,
} from "./timer";

/**
 * The running timer, kept in its own small localStorage slice. It is transient UI state, not
 * study history: finished work is saved as sessions in the main store (see `logFocusSegment`),
 * so backups, import/export and the data schema version are untouched by the timer.
 */
export const TIMER_KEY = "alcc:v1:timer";

type Persisted = { timer: TimerState | null };

interface TimerActions {
  /**
   * Start a focus phase on a task. Pass the planned block to follow its length and pin it
   * (committing it if it isn't yet); with no block the phase uses the Settings focus length.
   */
  begin: (taskId: string, nowMs: number, block?: PlanBlock) => void;
  pause: (nowMs: number) => void;
  resume: (nowMs: number) => void;
  /**
   * End the focus phase and log it. `then: "break"` carries on into a break; otherwise (or if
   * the task is done) the sitting ends.
   */
  finishFocus: (args: {
    nowMs: number;
    minutes: number;
    taskDone: boolean;
    then: "stop" | "break";
  }) => void;
  /** After a break (or skipping it): the next focus phase on the same task. */
  nextFocus: (nowMs: number) => void;
  /** Drop the timer without logging anything. */
  clear: () => void;
}

const safeStorage: PersistStorage<Persisted> = {
  getItem: (name) => {
    try {
      const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(name);
      return raw === null ? null : (JSON.parse(raw) as StorageValue<Persisted>);
    } catch {
      return null; // unreadable timer: start with none; nothing of value is lost
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, JSON.stringify(value));
    } catch (e) {
      console.error("Could not save the focus timer", e);
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

export const useTimer = create<{ timer: TimerState | null } & TimerActions>()(
  persist<{ timer: TimerState | null } & TimerActions, [], [], Persisted>(
    (set, get) => ({
      timer: null,

      begin: (taskId, nowMs, block) => {
        if (get().timer) return; // one timer at a time
        const main = useStore.getState();
        const task = main.tasks.find((t) => t.id === taskId);
        if (!task || task.status === "done") return;

        let blockId: string | null = null;
        let targetMin = main.settings.focusMin;
        if (block && block.taskId === taskId) {
          const alreadyCommitted = main.blocks.some(
            (b) => b.id === block.id && b.status === "planned",
          );
          if (alreadyCommitted) main.markTaskInProgress(taskId);
          else main.startBlock(block);
          blockId = block.id;
          targetMin = toMin(block.end) - toMin(block.start);
        } else {
          main.markTaskInProgress(taskId);
        }
        set({
          timer: startTimer(
            {
              taskId,
              blockId,
              targetMin,
              focusMin: main.settings.focusMin,
              breakMin: main.settings.breakMin,
            },
            nowMs,
          ),
        });
      },

      pause: (nowMs) => set((s) => (s.timer ? { timer: pause(s.timer, nowMs) } : s)),
      resume: (nowMs) => set((s) => (s.timer ? { timer: resume(s.timer, nowMs) } : s)),

      finishFocus: ({ nowMs, minutes, taskDone, then }) => {
        const t = get().timer;
        if (!t || t.phase !== "focus") return;
        useStore.getState().logFocusSegment({
          sessionId: uid(),
          taskId: t.taskId,
          blockId: t.blockId,
          startedAtMs: t.phaseStartedAt,
          endedAtMs: nowMs,
          minutes,
          plannedMin: t.targetMin,
          taskDone,
        });
        set({ timer: then === "break" && !taskDone ? toBreak(t, nowMs) : null });
      },

      nextFocus: (nowMs) =>
        set((s) => (s.timer?.phase === "break" ? { timer: toFocus(s.timer, nowMs) } : s)),

      clear: () => set({ timer: null }),
    }),
    {
      name: TIMER_KEY,
      version: 1,
      storage: safeStorage,
      // Like the main store: load on the client only (the app is server-rendered).
      skipHydration: true,
      partialize: (s) => ({ timer: s.timer }),
      merge: (persisted, current) => ({
        ...current,
        timer: parseTimerState((persisted as Persisted | undefined)?.timer),
      }),
    },
  ),
);

/**
 * What "Take a break" logs when a focus block has reached its target: the minutes the clock
 * suggests, the task not done, then on into the break. Shared by the Focus page and the pop-out
 * player so the two always do the same thing.
 */
export const breakFrom = (timer: TimerState, nowMs: number) => ({
  nowMs,
  minutes: suggestedMinutes(timer, nowMs),
  taskDone: false,
  then: "break" as const,
});

/** Load a saved timer (call once on the client, next to `hydrateStore`). */
export async function hydrateTimer(): Promise<void> {
  await useTimer.persist.rehydrate();
}
