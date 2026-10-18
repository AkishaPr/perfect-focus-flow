import { z } from "zod";

/**
 * Focus timer state machine (Stage 6). Pure: no React, no store, no clock. Pass `nowMs` in.
 *
 * The timer never counts ticks. It stores *when* things happened (epoch ms) and works out the
 * elapsed time from the clock, so it stays correct across reloads, a sleeping laptop or a
 * background tab that throttles `setInterval`.
 *
 *   focus ──(take a break)──▶ break ──(next focus)──▶ focus …
 *
 * A phase can be paused. It keeps counting past its target as "overtime" instead of stopping,
 * so the real duration is what gets logged; the UI decides what to do when the target is hit.
 */

export const MS_PER_MIN = 60_000;
export type Phase = "focus" | "break";

export interface TimerState {
  taskId: string;
  /** The committed plan block this sitting started from, until its first segment is logged. */
  blockId: string | null;
  phase: Phase;
  /** Planned length of the current phase, in minutes. */
  targetMin: number;
  /** Lengths for the phases that follow (snapshotted from Settings when the sitting began). */
  focusMin: number;
  breakMin: number;
  /** Time already counted in this phase before the current run, i.e. everything before a pause. */
  bankedMs: number;
  /** Epoch ms the current run began, or null while paused. */
  runStartedAt: number | null;
  /** Epoch ms this phase first started. Becomes `Session.start`. */
  phaseStartedAt: number;
  /** Focus segments already logged in this sitting. */
  segments: number;
}

/** A focus phase running longer than this many times its target is treated as forgotten. */
export const STALE_FACTOR = 2;
/** …but never before this many minutes, so short targets don't trip it on a normal long stretch. */
export const STALE_FLOOR_MIN = 90;

const MAX_TARGET_MIN = 24 * 60;
const wholeMin = (n: number, floor: number) =>
  Math.min(MAX_TARGET_MIN, Math.max(floor, Math.round(Number.isFinite(n) ? n : floor)));

export interface StartInput {
  taskId: string;
  blockId?: string | null;
  targetMin: number;
  focusMin: number;
  breakMin: number;
}

export function startTimer(input: StartInput, nowMs: number): TimerState {
  return {
    taskId: input.taskId,
    blockId: input.blockId ?? null,
    phase: "focus",
    targetMin: wholeMin(input.targetMin, 1),
    focusMin: wholeMin(input.focusMin, 1),
    breakMin: wholeMin(input.breakMin, 1),
    bankedMs: 0,
    runStartedAt: nowMs,
    phaseStartedAt: nowMs,
    segments: 0,
  };
}

export const isRunning = (s: TimerState) => s.runStartedAt !== null;

/** Time counted in the current phase. A clock that jumps backwards never makes it negative. */
export const elapsedMs = (s: TimerState, nowMs: number) =>
  s.bankedMs + (s.runStartedAt === null ? 0 : Math.max(0, nowMs - s.runStartedAt));

export function pause(s: TimerState, nowMs: number): TimerState {
  if (s.runStartedAt === null) return s;
  return { ...s, bankedMs: elapsedMs(s, nowMs), runStartedAt: null };
}

export function resume(s: TimerState, nowMs: number): TimerState {
  return s.runStartedAt === null ? { ...s, runStartedAt: nowMs } : s;
}

export interface PhaseProgress {
  elapsedMs: number;
  /** Time left to the target; 0 once it is reached. */
  remainingMs: number;
  /** Time past the target; 0 until it is reached. */
  overtimeMs: number;
  /** 0–1 share of the target covered (capped at 1). */
  fraction: number;
  /** The target has been reached. */
  over: boolean;
}

export function progress(s: TimerState, nowMs: number): PhaseProgress {
  const elapsed = elapsedMs(s, nowMs);
  const target = s.targetMin * MS_PER_MIN;
  return {
    elapsedMs: elapsed,
    remainingMs: Math.max(0, target - elapsed),
    overtimeMs: Math.max(0, elapsed - target),
    fraction: Math.min(1, elapsed / target),
    over: elapsed >= target,
  };
}

/**
 * A focus phase that has run far past its target, which usually means the timer was left on.
 * The wrap-up step then asks for the real minutes instead of trusting the clock.
 */
export function isStale(s: TimerState, nowMs: number): boolean {
  if (s.phase !== "focus") return false;
  const limit = Math.max(s.targetMin * STALE_FACTOR, STALE_FLOOR_MIN) * MS_PER_MIN;
  return elapsedMs(s, nowMs) > limit;
}

/** Minutes to log for the focus phase by default: the clock, or the target if the clock is stale. */
export function suggestedMinutes(s: TimerState, nowMs: number): number {
  return isStale(s, nowMs) ? s.targetMin : Math.round(elapsedMs(s, nowMs) / MS_PER_MIN);
}

/** Start the break after a logged focus segment. */
export function toBreak(s: TimerState, nowMs: number): TimerState {
  return {
    ...s,
    blockId: null,
    phase: "break",
    targetMin: s.breakMin,
    bankedMs: 0,
    runStartedAt: nowMs,
    phaseStartedAt: nowMs,
    segments: s.segments + 1,
  };
}

/** Start the next focus phase (after a break, or skipping it). */
export function toFocus(s: TimerState, nowMs: number): TimerState {
  return {
    ...s,
    phase: "focus",
    targetMin: s.focusMin,
    bankedMs: 0,
    runStartedAt: nowMs,
    phaseStartedAt: nowMs,
  };
}

/** "m:ss", or "h:mm:ss" from an hour up. Rounds down unless told to round up. */
export function formatClock(ms: number, round: "down" | "up" = "down"): string {
  const secs = ms / 1000;
  const total = Math.max(0, round === "up" ? Math.ceil(secs) : Math.floor(secs));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/**
 * What a countdown shows: the time left, rounded up so it only reads 0:00 once time is really up,
 * then "+m:ss" of overtime. Shared by the Focus page and the dock so they never disagree.
 */
export const clockText = (p: PhaseProgress): string =>
  p.over ? `+${formatClock(p.overtimeMs)}` : formatClock(p.remainingMs, "up");

const finiteNonNeg = z.number().finite().min(0);
export const timerStateSchema = z.object({
  taskId: z.string().min(1),
  blockId: z.string().min(1).nullable(),
  phase: z.enum(["focus", "break"]),
  targetMin: z.number().int().min(1).max(MAX_TARGET_MIN),
  focusMin: z.number().int().min(1).max(MAX_TARGET_MIN),
  breakMin: z.number().int().min(1).max(MAX_TARGET_MIN),
  bankedMs: finiteNonNeg,
  runStartedAt: finiteNonNeg.nullable(),
  phaseStartedAt: finiteNonNeg,
  segments: z.number().int().min(0),
});

/** Validate a stored timer. Anything unreadable is dropped rather than crashing the app. */
export function parseTimerState(raw: unknown): TimerState | null {
  const r = timerStateSchema.safeParse(raw);
  return r.success ? r.data : null;
}
