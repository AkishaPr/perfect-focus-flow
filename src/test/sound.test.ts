import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isSoundEnabled, playSound, setSoundEnabled } from "@/lib/sound";

/** A stand-in for the browser's audio: it records each note that is started. */
const started: number[] = [];
let failOnNote = false;
class FakeAudioContext {
  currentTime = 0;
  state = "running";
  destination = {};
  createGain() {
    return {
      gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect() {},
    };
  }
  createOscillator() {
    if (failOnNote) throw new Error("no audio device");
    const osc = {
      type: "",
      freq: 0,
      frequency: {
        setValueAtTime(f: number) {
          osc.freq = f;
        },
        exponentialRampToValueAtTime() {},
      },
      connect() {},
      start() {
        started.push(osc.freq);
      },
      stop() {},
    };
    return osc;
  }
  resume() {
    return Promise.resolve();
  }
}

const install = (ctor: unknown) =>
  Object.defineProperty(window, "AudioContext", {
    configurable: true,
    writable: true,
    value: ctor,
  });

beforeAll(() => install(FakeAudioContext));
afterAll(() => install(undefined));
beforeEach(() => {
  localStorage.clear();
  started.length = 0;
  failOnNote = false;
});

describe("sound", () => {
  it("is on until the person turns it off", () => {
    expect(isSoundEnabled()).toBe(true);
    setSoundEnabled(false);
    expect(isSoundEnabled()).toBe(false);
    expect(localStorage.getItem("alcc:v1:sound")).toBe("off");
    setSoundEnabled(true);
    expect(isSoundEnabled()).toBe(true);
  });

  it("start is one short click, the chime is two notes, goals add notes", () => {
    playSound("start");
    expect(started).toHaveLength(1);
    started.length = 0;
    playSound("chime");
    expect(started).toHaveLength(2);
    started.length = 0;
    playSound("goal");
    expect(started).toHaveLength(3);
    started.length = 0;
    playSound("weekly");
    expect(started).toHaveLength(4);
  });

  it("the weekly phrase rises to a higher final note than the daily one", () => {
    playSound("goal");
    const daily = Math.max(...started);
    started.length = 0;
    playSound("weekly");
    expect(Math.max(...started)).toBeGreaterThan(daily);
  });

  it("makes no sound at all while turned off", () => {
    setSoundEnabled(false);
    playSound("start");
    playSound("chime");
    expect(started).toHaveLength(0);
    setSoundEnabled(true);
    playSound("start");
    expect(started).toHaveLength(1);
  });

  it("never throws when audio fails", () => {
    failOnNote = true;
    expect(() => playSound("chime")).not.toThrow();
  });
});

describe("sound without audio support, and unlocking", () => {
  it("does nothing, quietly, in a browser with no Web Audio", async () => {
    vi.resetModules();
    install(undefined);
    const fresh = await import("@/lib/sound");
    expect(() => fresh.playSound("chime")).not.toThrow();
    install(FakeAudioContext);
  });

  it("opens the audio context on the first tap, once", async () => {
    vi.resetModules();
    const resume = vi.fn(() => Promise.resolve());
    class Suspended extends FakeAudioContext {
      override state = "suspended";
      override resume = resume;
    }
    install(Suspended);
    const fresh = await import("@/lib/sound");
    const stop = fresh.armSound();
    window.dispatchEvent(new Event("pointerdown"));
    expect(resume).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("pointerdown"));
    expect(resume).toHaveBeenCalledTimes(1); // the listener removed itself
    stop();
    install(FakeAudioContext);
  });
});
