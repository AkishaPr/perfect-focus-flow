import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Focus } from "@/components/Focus";
import { useTimer } from "@/lib/focus/store";
import { MS_PER_MIN, pause, startTimer, toBreak } from "@/lib/focus/timer";
import { useStore } from "@/lib/store";
import { at, dailyWindow, makeSettings, makeTask } from "./planner-fixtures";

const playSound = vi.hoisted(() => vi.fn());
vi.mock("@/lib/sound", () => ({ playSound }));

const NOW = at(19, 16, 0);
const min = (n: number) => n * MS_PER_MIN;

async function renderFocus() {
  const root = createRootRoute({ component: () => <Focus now={NOW} /> });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const view = render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { name: "Focus" });
  return view;
}

const seed = () =>
  useStore.setState({
    settings: makeSettings({ studyWindows: dailyWindow("16:00", "21:00") }),
    tasks: [makeTask({ id: "a", title: "Integration homework", estimateMin: 45 })],
  });
const timerAgo = (agoMin: number) =>
  startTimer(
    { taskId: "a", targetMin: 50, focusMin: 50, breakMin: 10 },
    NOW.getTime() - min(agoMin),
  );

beforeEach(() => {
  useStore.getState().reset();
  useTimer.setState({ timer: null });
  localStorage.clear();
  playSound.mockClear();
  seed();
});
afterEach(cleanup);

describe("focus timer: sound", () => {
  it("starting focus makes the click", async () => {
    await renderFocus();
    expect(playSound).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Start focus/ }));
    expect(playSound).toHaveBeenCalledExactlyOnceWith("start");
    expect(useTimer.getState().timer).not.toBeNull();
  });

  it("resuming makes the same click, and pausing makes none", async () => {
    useTimer.setState({ timer: timerAgo(10) });
    await renderFocus();
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(playSound).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Resume" }));
    expect(playSound).toHaveBeenCalledExactlyOnceWith("start");
  });

  it("starting the next focus after a break clicks too", async () => {
    useTimer.setState({ timer: toBreak(timerAgo(50), NOW.getTime()) });
    await renderFocus();
    fireEvent.click(screen.getByRole("button", { name: "Skip break" }));
    expect(playSound).toHaveBeenCalledExactlyOnceWith("start");
  });
});

describe("focus timer: how it looks", () => {
  it("shows a running clock at full strength and a paused one softened", async () => {
    useTimer.setState({ timer: timerAgo(10) });
    const { container } = await renderFocus();
    const clock = screen.getByRole("timer");
    expect(clock.className).not.toContain("opacity-60");
    expect(screen.queryByText(/paused/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByRole("timer").className).toContain("opacity-60");
    // The word fades in rather than appearing with a jump.
    expect(screen.getByText(/paused/).className).toContain("motion-fade");
    // The bar softens with it.
    expect(container.querySelector('[aria-label="Phase progress"]')!.className).toContain(
      "opacity-60",
    );
  });

  it("the card's edge softens while paused", async () => {
    useTimer.setState({ timer: pause(timerAgo(10), NOW.getTime()) });
    await renderFocus();
    expect(screen.getByRole("region", { name: "Timer" }).className).not.toContain("border-signal");
  });

  it("the clock reads exactly as before, digit by digit", async () => {
    useTimer.setState({ timer: timerAgo(10) });
    await renderFocus();
    expect(screen.getByRole("timer").textContent).toBe("40:00");
  });

  it("a finished block gets a one-time sheen over its bar and an announcement that eases in", async () => {
    useTimer.setState({ timer: timerAgo(55) });
    const { container } = await renderFocus();
    expect(container.querySelector("[data-sheen]")).not.toBeNull();
    expect(screen.getByRole("status").className).toContain("motion-rise");
  });

  it("no sheen while the block is still running", async () => {
    useTimer.setState({ timer: timerAgo(10) });
    const { container } = await renderFocus();
    expect(container.querySelector("[data-sheen]")).toBeNull();
  });

  it("the timer card arrives with an entrance, as the idle card does", async () => {
    const idle = await renderFocus();
    expect(screen.getByRole("region", { name: "Start a focus session" }).className).toContain(
      "motion-rise",
    );
    idle.unmount();
    useTimer.setState({ timer: timerAgo(10) });
    await renderFocus();
    expect(screen.getByRole("region", { name: "Timer" }).className).toContain("motion-rise");
  });
});
