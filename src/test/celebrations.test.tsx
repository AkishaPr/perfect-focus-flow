import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Celebrations } from "@/components/Celebrations";
import { useStore } from "@/lib/store";
import { makeSession, makeSettings, makeTask } from "./planner-fixtures";

const toast = vi.hoisted(() => ({ success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
const playSound = vi.hoisted(() => vi.fn());
vi.mock("@/lib/sound", () => ({ playSound }));

/** A session that began now, so it counts for today and this week on the real clock. */
const studied = (min: number, id = "s1") =>
  makeSession({
    id,
    taskId: "a",
    start: new Date().toISOString(),
    end: new Date().toISOString(),
    actualMin: min,
  });

const seed = (
  settings: Parameters<typeof makeSettings>[0],
  sessions = [] as ReturnType<typeof studied>[],
) =>
  useStore.setState({
    settings: makeSettings(settings),
    tasks: [makeTask({ id: "a" })],
    sessions,
  });

beforeEach(() => {
  useStore.getState().reset();
  toast.success.mockClear();
  playSound.mockClear();
});
afterEach(cleanup);

describe("goal celebrations", () => {
  it("marks the moment the daily goal is reached: sparks, a soft phrase and a toast", () => {
    seed({ dailyGoalMin: 60, weeklyGoalMin: 5000 });
    const { container } = render(<Celebrations />);
    expect(container.querySelector("[data-celebration]")).toBeNull();

    act(() => useStore.setState({ sessions: [studied(70)] }));

    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.success.mock.calls[0]![0]).toBe("Daily goal reached");
    expect(playSound).toHaveBeenCalledWith("goal");
    expect(container.querySelector('[data-celebration="daily"]')).not.toBeNull();
  });

  it("makes the weekly goal a slightly bigger moment", () => {
    seed({ dailyGoalMin: 5000, weeklyGoalMin: 100 });
    const { container } = render(<Celebrations />);
    act(() => useStore.setState({ sessions: [studied(120)] }));

    expect(toast.success.mock.calls[0]![0]).toBe("Weekly goal reached");
    expect(playSound).toHaveBeenCalledWith("weekly");
    const weekly = container.querySelectorAll('[data-celebration="weekly"] .motion-spark').length;
    expect(weekly).toBeGreaterThan(10); // the daily burst has 10
  });

  it("stays quiet when the app opens on a day the goal is already met", () => {
    seed({ dailyGoalMin: 60, weeklyGoalMin: 100 }, [studied(200)]);
    const { container } = render(<Celebrations />);
    expect(toast.success).not.toHaveBeenCalled();
    expect(playSound).not.toHaveBeenCalled();
    expect(container.querySelector("[data-celebration]")).toBeNull();
  });

  it("celebrates once: more study after the goal is met adds nothing", () => {
    seed({ dailyGoalMin: 60, weeklyGoalMin: 5000 });
    render(<Celebrations />);
    act(() => useStore.setState({ sessions: [studied(70)] }));
    act(() => useStore.setState({ sessions: [studied(70), studied(30, "s2")] }));
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it("does not treat a restored backup as an achievement", () => {
    seed({ dailyGoalMin: 60, weeklyGoalMin: 100 });
    render(<Celebrations />);
    act(() => useStore.setState({ sessions: [studied(10 * 60)] }));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("is silent when the goal was only lowered", () => {
    seed({ dailyGoalMin: 300, weeklyGoalMin: 5000 }, [studied(100)]);
    render(<Celebrations />);
    act(() => useStore.getState().updateSettings({ dailyGoalMin: 60 }));
    expect(toast.success).not.toHaveBeenCalled();
  });
});
