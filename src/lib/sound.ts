import { useSyncExternalStore } from "react";

/**
 * A few soft sounds, made with the Web Audio API so the app ships no audio files:
 *   start   a small click when focus begins
 *   chime   two gentle notes when a focus block or break reaches its target
 *   goal    a rising three-note phrase for the daily goal
 *   weekly  the same phrase with a fourth, longer note for the weekly goal
 * Errors never make a sound.
 *
 * Whether sound is on is a device preference, so it lives in its own small localStorage key (like
 * the running timer), not in StoreData or backups. It is on until the person turns it off.
 */

const KEY = "alcc:v1:sound";

export type SoundKind = "start" | "chime" | "goal" | "weekly";

const listeners = new Set<() => void>();

export function isSoundEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // Storage can be blocked; the choice then lasts only until the page is closed.
  }
  listeners.forEach((l) => l());
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

/** Live value of the preference, for the Settings switch. */
export function useSoundEnabled() {
  return useSyncExternalStore(subscribe, isSoundEnabled, () => true);
}

type ContextCtor = typeof AudioContext;
let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: ContextCtor; webkitAudioContext?: ContextCtor };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }
  return ctx;
}

/**
 * Browsers only let a page make sound after the person has interacted with it. Waiting for the
 * first tap or key press and opening the audio context then means a chime that arrives later,
 * while the person is looking at their book, is allowed to play. Returns a cleanup function.
 */
export function armSound(): () => void {
  if (typeof window === "undefined") return () => {};
  const events = ["pointerdown", "keydown"] as const;
  const stop = () => events.forEach((e) => window.removeEventListener(e, unlock));
  function unlock() {
    const c = context();
    if (c && c.state === "suspended") void c.resume().catch(() => {});
    stop();
  }
  events.forEach((e) => window.addEventListener(e, unlock));
  return stop;
}

interface Note {
  freq: number;
  /** Seconds after the sound starts. */
  at?: number;
  dur: number;
  peak: number;
  /** Slide to this frequency over the note (a click is a quick downward slide). */
  glideTo?: number;
}

function play(c: AudioContext, notes: Note[]) {
  for (const n of notes) {
    const t0 = c.currentTime + (n.at ?? 0);
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(n.freq, t0);
    if (n.glideTo) osc.frequency.exponentialRampToValueAtTime(n.glideTo, t0 + n.dur);
    // A short attack and a long exponential decay: no clicks at the edges, nothing sharp.
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(n.peak, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + n.dur + 0.05);
  }
}

const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const B5 = 987.77;
const C6 = 1046.5;

const SOUNDS: Record<SoundKind, Note[]> = {
  start: [{ freq: 880, glideTo: 520, dur: 0.06, peak: 0.05 }],
  chime: [
    { freq: E5, dur: 1.1, peak: 0.07 },
    { freq: B5, at: 0.16, dur: 1.4, peak: 0.05 },
  ],
  goal: [
    { freq: C5, dur: 0.7, peak: 0.06 },
    { freq: E5, at: 0.12, dur: 0.7, peak: 0.06 },
    { freq: G5, at: 0.24, dur: 0.9, peak: 0.06 },
  ],
  weekly: [
    { freq: C5, dur: 0.7, peak: 0.06 },
    { freq: E5, at: 0.13, dur: 0.7, peak: 0.06 },
    { freq: G5, at: 0.26, dur: 0.8, peak: 0.06 },
    { freq: C6, at: 0.39, dur: 1.4, peak: 0.07 },
  ],
};

/** Plays a sound unless the person has turned sound off. Never throws: no sound is a fine outcome. */
export function playSound(kind: SoundKind) {
  if (!isSoundEnabled()) return;
  try {
    const c = context();
    if (!c) return;
    if (c.state === "suspended") void c.resume().catch(() => {});
    play(c, SOUNDS[kind]);
  } catch {
    // Audio can fail for many reasons (no output device, blocked by policy). Stay quiet.
  }
}
