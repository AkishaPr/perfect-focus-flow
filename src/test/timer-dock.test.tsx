import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimerDock } from "@/components/TimerDock";
import { useTimer } from "@/lib/focus/store";
import { MS_PER_MIN, pause, startTimer, toBreak } from "@/lib/focus/timer";
import { useStore } from "@/lib/store";
import { makeTask } from "./planner-fixtures";

const toast = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast }));

const min = (n: number) => n * MS_PER_MIN;

async function renderDock(path = "/") {
  const root = createRootRoute({ component: () => <TimerDock /> });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(<RouterProvider router={router} />);
  await router.load();
}

/** A focus timer that began `agoMs` ago on the real clock (the dock reads the real clock). */
const startedAgo = (agoMs: number, over: Partial<Parameters<typeof startTimer>[0]> = {}) =>
  startTimer(
    { taskId: "a", targetMin: 50, focusMin: 50, breakMin: 10, ...over },
    Date.now() - agoMs,
  );

beforeEach(() => {
  useStore.getState().reset();
  useStore.setState({ tasks: [makeTask({ id: "a", title: "Integration homework" })] });
  useTimer.setState({ timer: null });
  document.title = "Today — A/L Command Center";
  toast.mockClear();
});
afterEach(() => {
  cleanup();
});

describe("TimerDock", () => {
  it("renders nothing without a timer", async () => {
    await renderDock();
    expect(screen.queryByRole("link")).toBeNull();
    expect(document.title).toBe("Today — A/L Command Center");
  });

  it("links back to the timer from other pages, showing the time left", async () => {
    useTimer.setState({ timer: startedAgo(min(10)) });
    await renderDock();
    const link = await screen.findByRole("link", { name: /Focus timer 40:0\d\. Open the timer/ });
    expect(link).toHaveAttribute("href", "/focus");
    expect(link).toHaveTextContent("Integration homework");
  });

  it("says when the timer is paused", async () => {
    useTimer.setState({ timer: pause(startedAgo(min(10)), Date.now()) });
    await renderDock();
    expect(await screen.findByRole("link", { name: /paused/ })).toBeInTheDocument();
  });

  it("shows a break as a break", async () => {
    useTimer.setState({ timer: toBreak(startedAgo(min(50)), Date.now()) });
    await renderDock();
    expect(await screen.findByRole("link", { name: /Break 10:0\d/ })).toBeInTheDocument();
  });

  it("hides the pill on the Focus page itself", async () => {
    useTimer.setState({ timer: startedAgo(min(10)) });
    await renderDock("/focus");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("puts the countdown in the tab title, and takes it out again", async () => {
    useTimer.setState({ timer: startedAgo(min(10)) });
    await renderDock();
    await waitFor(() => expect(document.title).toMatch(/^⏱ 40:0\d — Today — A\/L Command Center$/));
    cleanup();
    expect(document.title).toBe("Today — A/L Command Center");
  });

  it("shows overtime in the title once past the target", async () => {
    useTimer.setState({ timer: startedAgo(min(53)) });
    await renderDock();
    await waitFor(() => expect(document.title).toMatch(/^⏱ \+3:0\d — /));
  });

  it("announces a phase reaching its target while you're watching", async () => {
    useTimer.setState({ timer: startedAgo(min(50) - 400) }); // 0.4 s short of the target
    await renderDock();
    expect(toast).not.toHaveBeenCalled();
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(toast).toHaveBeenCalledWith("Focus block complete.", {
      description: "Integration homework",
    });
  });

  it("doesn't announce a target that was already passed when the page loaded", async () => {
    useTimer.setState({ timer: startedAgo(min(55)) });
    await renderDock();
    await new Promise((r) => setTimeout(r, 1300)); // let at least one tick pass
    expect(toast).not.toHaveBeenCalled();
  });
});
