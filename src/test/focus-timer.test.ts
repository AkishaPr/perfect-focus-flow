import { describe, expect, it } from "vitest";
import {
  MS_PER_MIN,
  STALE_FLOOR_MIN,
  clockText,
  elapsedMs,
  formatClock,
  isRunning,
  isStale,
  parseTimerState,
  pause,
  progress,
  resume,
  startTimer,
  suggestedMinutes,
  toBreak,
  toFocus,
} from "@/lib/focus/timer";

const T0 = 1_800_000_000_000;
const min = (n: number) => n * MS_PER_MIN;
const start = (over: Partial<Parameters<typeof startTimer>[0]> = {}) =>
  startTimer({ taskId: "a", targetMin: 50, focusMin: 50, breakMin: 10, ...over }, T0);

describe("timer clock", () => {
  it("counts elapsed time from timestamps, not ticks", () => {
    const t = start();
    expect(isRunning(t)).toBe(true);
    expect(elapsedMs(t, T0)).toBe(0);
    expect(elapsedMs(t, T0 + min(7))).toBe(min(7));
    // A tab that slept for an hour and woke up reports the right time on its first read.
    expect(elapsedMs(t, T0 + min(60))).toBe(min(60));
  });

  it("stops counting while paused and carries on after resume", () => {
    let t = pause(start(), T0 + min(10));
    expect(isRunning(t)).toBe(false);
    expect(elapsedMs(t, T0 + min(500))).toBe(min(10));
    t = resume(t, T0 + min(30));
    expect(elapsedMs(t, T0 + min(35))).toBe(min(15));
  });

  it("treats pausing a paused timer and resuming a running one as no-ops", () => {
    const paused = pause(start(), T0 + min(5));
    expect(pause(paused, T0 + min(99))).toBe(paused);
    const running = start();
    expect(resume(running, T0 + min(99))).toBe(running);
  });

  it("never goes negative if the clock moves backwards", () => {
    expect(elapsedMs(start(), T0 - min(5))).toBe(0);
  });
});

describe("progress", () => {
  it("reports what is left, then overtime once the target is reached", () => {
    const t = start();
    expect(progress(t, T0 + min(20))).toMatchObject({
      remainingMs: min(30),
      overtimeMs: 0,
      over: false,
      fraction: 0.4,
    });
    expect(progress(t, T0 + min(50))).toMatchObject({ remainingMs: 0, overtimeMs: 0, over: true });
    expect(progress(t, T0 + min(57))).toMatchObject({
      remainingMs: 0,
      overtimeMs: min(7),
      over: true,
      fraction: 1,
    });
  });
});

describe("stale timers", () => {
  it("flags a focus phase far past its target, and logs the target instead of the clock", () => {
    const t = start();
    expect(isStale(t, T0 + min(100))).toBe(false); // exactly 2× target
    expect(isStale(t, T0 + min(101))).toBe(true);
    expect(suggestedMinutes(t, T0 + min(40))).toBe(40);
    expect(suggestedMinutes(t, T0 + min(14 * 60))).toBe(50);
  });

  it("gives short targets room: nothing is stale before the floor", () => {
    const t = start({ targetMin: 10 });
    expect(isStale(t, T0 + min(STALE_FLOOR_MIN))).toBe(false);
    expect(isStale(t, T0 + min(STALE_FLOOR_MIN + 1))).toBe(true);
  });

  it("is never stale while paused (the clock isn't running) or on a break", () => {
    const paused = pause(start(), T0 + min(30));
    expect(isStale(paused, T0 + min(24 * 60))).toBe(false);
    expect(isStale(toBreak(start(), T0), T0 + min(24 * 60))).toBe(false);
  });
});

describe("phases", () => {
  it("moves focus → break → focus, counting segments and releasing the block", () => {
    const t0 = start({ blockId: "b1" });
    expect(t0.blockId).toBe("b1");
    const brk = toBreak(t0, T0 + min(50));
    expect(brk).toMatchObject({ phase: "break", targetMin: 10, blockId: null, segments: 1 });
    expect(elapsedMs(brk, T0 + min(53))).toBe(min(3));
    const next = toFocus(brk, T0 + min(60));
    expect(next).toMatchObject({ phase: "focus", targetMin: 50, segments: 1 });
    expect(next.phaseStartedAt).toBe(T0 + min(60));
    expect(elapsedMs(next, T0 + min(61))).toBe(min(1));
  });

  it("keeps lengths sane whatever Settings holds", () => {
    const t = start({ targetMin: 0, focusMin: -5, breakMin: Number.NaN });
    expect([t.targetMin, t.focusMin, t.breakMin]).toEqual([1, 1, 1]);
    expect(start({ targetMin: 49.6 }).targetMin).toBe(50);
  });
});

describe("formatClock", () => {
  it("formats m:ss and h:mm:ss", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(1_000)).toBe("0:01");
    expect(formatClock(min(49) + 5_000)).toBe("49:05");
    expect(formatClock(min(60))).toBe("1:00:00");
    expect(formatClock(min(125) + 9_000)).toBe("2:05:09");
    expect(formatClock(-4_000)).toBe("0:00");
  });
});

describe("parseTimerState", () => {
  it("round-trips a real timer", () => {
    const t = pause(start({ blockId: "b" }), T0 + min(3));
    expect(parseTimerState(JSON.parse(JSON.stringify(t)))).toEqual(t);
  });

  it("drops anything unreadable instead of throwing", () => {
    expect(parseTimerState(null)).toBeNull();
    expect(parseTimerState("nope")).toBeNull();
    expect(parseTimerState({ ...start(), phase: "nap" })).toBeNull();
    expect(parseTimerState({ ...start(), bankedMs: -1 })).toBeNull();
    expect(parseTimerState({ ...start(), taskId: "" })).toBeNull();
    expect(parseTimerState({ ...start(), targetMin: 0 })).toBeNull();
  });
});

describe("clockText", () => {
  it("rounds the countdown up, so a fresh 50 min timer reads 50:00 and 0:00 means time is up", () => {
    const t = start();
    expect(clockText(progress(t, T0))).toBe("50:00");
    expect(clockText(progress(t, T0 + 1))).toBe("50:00"); // a millisecond in
    expect(clockText(progress(t, T0 + min(49) + 59_500))).toBe("0:01"); // half a second left
    expect(clockText(progress(t, T0 + min(50)))).toBe("+0:00"); // over, not a stuck "0:00"
  });

  it("shows overtime rounded down", () => {
    expect(clockText(progress(start(), T0 + min(53) + 59_900))).toBe("+3:59");
  });

  it("formatClock can round up on request", () => {
    expect(formatClock(1, "up")).toBe("0:01");
    expect(formatClock(0, "up")).toBe("0:00");
    expect(formatClock(min(2) + 1, "down")).toBe("2:00");
  });
});
