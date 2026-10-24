import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Focus } from "@/components/Focus";
import { PopoutButton, PopoutHost, PopoutView, type PopoutActions } from "@/components/TimerPopout";
import { TimerDock } from "@/components/TimerDock";
import { useNow } from "@/hooks/use-now";
import { usePopout } from "@/lib/focus/popout";
import { useTimer } from "@/lib/focus/store";
import { MS_PER_MIN, pause, startTimer, toBreak, type TimerState } from "@/lib/focus/timer";
import { useStore } from "@/lib/store";
import {
  fakePopoutWindow,
  removeFakePopouts,
  removePictureInPictureStub,
  stubPictureInPicture,
} from "./fake-popout";
import { at, dailyWindow, makeSettings, makeTask } from "./planner-fixtures";

const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), toast) }));
const playSound = vi.hoisted(() => vi.fn());
vi.mock("@/lib/sound", () => ({ playSound }));

const min = (n: number) => n * MS_PER_MIN;
const timerAgo = (agoMin: number): TimerState =>
  startTimer({ taskId: "a", targetMin: 50, focusMin: 50, breakMin: 10 }, Date.now() - min(agoMin));

beforeEach(() => {
  useStore.getState().reset();
  useStore.setState({
    settings: makeSettings({ studyWindows: dailyWindow("16:00", "21:00") }),
    tasks: [makeTask({ id: "a", title: "Integration homework", estimateMin: 45 })],
  });
  useTimer.setState({ timer: null });
  usePopout.setState({ win: null, kind: null });
  localStorage.clear();
  toast.error.mockClear();
  playSound.mockClear();
});
afterEach(() => {
  cleanup();
  removePictureInPictureStub();
  removeFakePopouts();
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("class");
  document.documentElement.removeAttribute("style");
  document.head.querySelectorAll("style[data-test]").forEach((s) => s.remove());
});

// ---------------------------------------------------------------------------------------------
// The picture
// ---------------------------------------------------------------------------------------------

function actions(): PopoutActions {
  return {
    pause: vi.fn(),
    resume: vi.fn(),
    takeBreak: vi.fn(),
    nextFocus: vi.fn(),
    back: vi.fn(),
  };
}
const view = (timer: TimerState, a = actions(), title = "Integration homework") => {
  const result = render(
    <PopoutView timer={timer} taskTitle={title} nowMs={Date.now()} actions={a} />,
  );
  return { ...result, a, root: result.container.querySelector<HTMLElement>("[data-popout]")! };
};
const clock = () => screen.getByRole("timer").textContent;

describe("the player's picture", () => {
  it("a running focus block: the clock, the task, and a Pause button", () => {
    const { root } = view(timerAgo(10));
    expect(clock()).toBe("40:00");
    expect(screen.getByText("Focus")).toBeInTheDocument();
    expect(screen.getByText("Integration homework")).toBeInTheDocument();
    expect(screen.getByText(/left · target 50 min/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pause/ })).toBeInTheDocument();
    expect(screen.queryByText(/paused/)).toBeNull();
    expect(root).toHaveAttribute("data-state", "running");
  });

  it("paused: the numbers and bar soften, 'paused' fades in, and Resume takes over", () => {
    const { root, container } = view(pause(timerAgo(10), Date.now()));
    expect(root).toHaveAttribute("data-state", "paused");
    expect(screen.getByRole("timer").className).toContain("opacity-60");
    expect(screen.getByText(/paused/).className).toContain("motion-fade");
    expect(container.querySelector('[aria-label="Phase progress"]')!.className).toContain(
      "opacity-60",
    );
    expect(screen.getByRole("button", { name: /Resume/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pause/ })).toBeNull();
  });

  it("a finished block says so, offers the break first, and lights up", () => {
    const { root, container } = view(timerAgo(55));
    expect(screen.getByText("Focus block complete")).toBeInTheDocument();
    expect(clock()).toMatch(/^\+5:0\d$/);
    expect(screen.getByRole("button", { name: /Take a break/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pause/ })).toBeInTheDocument();
    expect(root.className).toContain("bg-signal/15");
    expect(container.querySelector("[data-sheen]")).not.toBeNull();
  });

  it("a block left running for hours is a forgotten timer, not a finished one", () => {
    view(timerAgo(6 * 60));
    expect(screen.queryByText("Focus block complete")).toBeNull();
    expect(screen.queryByRole("button", { name: /Take a break/ })).toBeNull();
    expect(screen.getByText(/past the target/)).toBeInTheDocument();
  });

  it("a break: labelled as one, with Skip break and Pause", () => {
    view(toBreak(timerAgo(50), Date.now()));
    expect(screen.getByText("Break")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Skip break/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pause/ })).toBeInTheDocument();
    expect(clock()).toMatch(/^(10:00|9:5\d)$/);
  });

  it("a break that is over offers the next focus, and no Pause", () => {
    view(toBreak(timerAgo(70), Date.now() - min(15)));
    expect(screen.getByText(/Break's over/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start next focus/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pause/ })).toBeNull();
  });

  it("each button does its one thing", () => {
    const run = view(timerAgo(55));
    fireEvent.click(screen.getByRole("button", { name: /Take a break/ }));
    fireEvent.click(screen.getByRole("button", { name: /Pause/ }));
    fireEvent.click(screen.getByRole("button", { name: "Back to the app" }));
    expect(run.a.takeBreak).toHaveBeenCalledTimes(1);
    expect(run.a.pause).toHaveBeenCalledTimes(1);
    expect(run.a.back).toHaveBeenCalledTimes(1);
    cleanup();

    const paused = view(pause(timerAgo(10), Date.now()));
    fireEvent.click(screen.getByRole("button", { name: /Resume/ }));
    expect(paused.a.resume).toHaveBeenCalledTimes(1);
    cleanup();

    const brk = view(toBreak(timerAgo(50), Date.now()));
    fireEvent.click(screen.getByRole("button", { name: /Skip break/ }));
    expect(brk.a.nextFocus).toHaveBeenCalledTimes(1);
  });

  it("the clock text reads exactly as on the Focus page, and the clock scales with the window", () => {
    view(timerAgo(10));
    const timer = screen.getByRole("timer");
    expect(timer.textContent).toBe("40:00");
    expect(timer.className).toContain("text-[length:min(22vw,30vh)]");
  });

  it("collapses to a slim bar in a very short window: no header, clock left, progress on the edge", () => {
    const { root, container } = view(timerAgo(10));
    expect(root.className).toContain("[@media(max-height:140px)]:flex-row");
    expect(container.querySelector("header")!.className).toContain(
      "[@media(max-height:140px)]:hidden",
    );
    expect(screen.getByRole("timer").className).toContain(
      "[@media(max-height:140px)]:text-[length:",
    );
    expect(container.querySelector('[aria-label="Phase progress"]')!.className).toContain(
      "[@media(max-height:140px)]:absolute",
    );
    // The buttons stay: a slim bar is still a working player.
    expect(screen.getByRole("button", { name: /Pause/ })).toBeInTheDocument();
  });

  it("a long task title is cut short, with the full title one hover away", () => {
    view(timerAgo(10), actions(), "A very long task title that cannot possibly fit a small window");
    const title = screen.getByText(/A very long task title/);
    expect(title.className).toContain("truncate");
    expect(title).toHaveAttribute("title", expect.stringContaining("cannot possibly fit"));
  });
});

// ---------------------------------------------------------------------------------------------
// The live player, in its own window
// ---------------------------------------------------------------------------------------------

async function renderApp(initial = "/") {
  const root = createRootRoute({
    component: () => (
      <>
        <PopoutHost />
        <Outlet />
      </>
    ),
  });
  const home = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => <p>home page</p>,
  });
  const focus = createRoute({
    getParentRoute: () => root,
    path: "/focus",
    component: () => <p>focus page</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([home, focus]),
    history: createMemoryHistory({ initialEntries: [initial] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByText(/home page|focus page/);
  return router;
}

/** Opens a pop-out the way the app does (through the store), and returns its window and contents. */
async function popOut(timer: TimerState = timerAgo(10)) {
  useTimer.setState({ timer });
  const router = await renderApp();
  const win = fakePopoutWindow();
  act(() => usePopout.setState({ win, kind: "pip" }));
  const inside = within(win.document.body);
  await inside.findByRole("timer");
  return { win, inside, router };
}

describe("the pop-out window", () => {
  it("is drawn in its own window, not on the app's page", async () => {
    const { inside } = await popOut();
    expect(inside.getByRole("timer").textContent).toBe("40:00");
    expect(inside.getByText("Integration homework")).toBeInTheDocument();
    expect(screen.queryByRole("timer")).toBeNull(); // nothing leaked into the main page
  });

  it("looks like the app: its styles and its theme are carried over, and the theme stays live", async () => {
    const probe = document.createElement("style");
    probe.dataset["test"] = "";
    probe.textContent = ".probe { color: red; }";
    document.head.appendChild(probe);
    document.documentElement.className = "dark";

    const { win } = await popOut();

    expect(
      [...win.document.head.querySelectorAll("style")].some((s) =>
        s.textContent?.includes(".probe"),
      ),
    ).toBe(true);
    expect(win.document.documentElement.classList.contains("dark")).toBe(true);

    document.documentElement.classList.remove("dark"); // the person switches theme in the app
    await waitFor(() =>
      expect(win.document.documentElement.classList.contains("dark")).toBe(false),
    );
  });

  it("its Pause and Resume drive the real timer", async () => {
    const { inside } = await popOut();
    fireEvent.click(inside.getByRole("button", { name: /Pause/ }));
    expect(useTimer.getState().timer?.runStartedAt).toBeNull();

    fireEvent.click(await inside.findByRole("button", { name: /Resume/ }));
    expect(useTimer.getState().timer?.runStartedAt).not.toBeNull();
    expect(playSound).toHaveBeenCalledExactlyOnceWith("start"); // resuming clicks, pausing doesn't
  });

  it("Space pauses and resumes, but a focused button keeps its own Space", async () => {
    const { win, inside } = await popOut();
    const press = (target: Element) =>
      target.dispatchEvent(
        new (win as unknown as typeof globalThis).KeyboardEvent("keydown", {
          code: "Space",
          key: " ",
          bubbles: true,
          cancelable: true,
        }),
      );

    act(() => void press(win.document.body));
    expect(useTimer.getState().timer?.runStartedAt).toBeNull();
    act(() => void press(win.document.body));
    expect(useTimer.getState().timer?.runStartedAt).not.toBeNull();

    act(() => void press(inside.getByRole("button", { name: /Pause/ })));
    expect(useTimer.getState().timer?.runStartedAt).not.toBeNull(); // left to the button itself
  });

  it("Take a break logs the block and moves on to the break, as on the Focus page", async () => {
    const { inside } = await popOut(timerAgo(55));
    expect(useStore.getState().sessions).toHaveLength(0);

    fireEvent.click(inside.getByRole("button", { name: /Take a break/ }));

    expect(useStore.getState().sessions).toHaveLength(1);
    expect(useStore.getState().sessions[0]!.actualMin).toBeGreaterThan(0);
    expect(useTimer.getState().timer?.phase).toBe("break");
    expect(await inside.findByRole("button", { name: /Skip break/ })).toBeInTheDocument();
  });

  it("Skip break starts the next focus, with the click", async () => {
    const { inside } = await popOut(toBreak(timerAgo(50), Date.now()));
    fireEvent.click(inside.getByRole("button", { name: /Skip break/ }));
    expect(useTimer.getState().timer?.phase).toBe("focus");
    expect(playSound).toHaveBeenCalledExactlyOnceWith("start");
  });

  it("puts the countdown in the window's title bar", async () => {
    const { win } = await popOut();
    await waitFor(() => expect(win.document.title).toMatch(/^\d+:\d\d · Focus$/));
  });

  it("ticks from its own window's timers, which a browser doesn't slow down", async () => {
    useTimer.setState({ timer: timerAgo(10) });
    await renderApp();
    const win = fakePopoutWindow();
    const spy = vi.spyOn(win, "setInterval");
    act(() => usePopout.setState({ win, kind: "pip" }));
    await within(win.document.body).findByRole("timer");
    expect(spy).toHaveBeenCalledWith(expect.any(Function), 500);
  });

  it("Back to the app opens the Focus page and closes the window", async () => {
    const raise = vi.spyOn(window, "focus").mockImplementation(() => {});
    const { win, inside, router } = await popOut();
    fireEvent.click(inside.getByRole("button", { name: "Back to the app" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/focus"));
    expect(raise).toHaveBeenCalled(); // and tries to bring the app's window forward
    expect(win.close).toHaveBeenCalled();
    expect(usePopout.getState().win).toBeNull();
  });
});

describe("the pop-out window's life", () => {
  it("closes when the timer is saved or discarded: there is nothing left to show", async () => {
    const { win } = await popOut();
    act(() => useTimer.getState().clear());
    await waitFor(() => expect(win.close).toHaveBeenCalled());
    expect(usePopout.getState().win).toBeNull();
  });

  it("closes when the app's page goes away", async () => {
    const { win } = await popOut();
    act(() => void window.dispatchEvent(new Event("pagehide")));
    expect(win.close).toHaveBeenCalled();
    expect(usePopout.getState().win).toBeNull();
  });

  it("closes with the app if the app is torn down", async () => {
    const { win } = await popOut();
    cleanup();
    expect(win.close).toHaveBeenCalled();
  });

  it("notices a popup that was closed without a word", async () => {
    const { win } = await popOut();
    // Some browsers close a popup without telling the page: the host checks on it.
    Object.defineProperty(win, "closed", { configurable: true, get: () => true });
    await waitFor(() => expect(usePopout.getState().win).toBeNull(), { timeout: 2500 });
  });

  it("never opens for a timer that does not exist", async () => {
    await renderApp();
    const win = fakePopoutWindow();
    act(() => usePopout.setState({ win, kind: "pip" }));
    await waitFor(() => expect(usePopout.getState().win).toBeNull());
    expect(within(win.document.body).queryByRole("timer")).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// Ticking from another window
// ---------------------------------------------------------------------------------------------

describe("useNow from another window", () => {
  it("uses that window's timers, and stops them on unmount", () => {
    const view = { setInterval: vi.fn(() => 7), clearInterval: vi.fn() };
    const { unmount } = renderHook(() => useNow(1000, view as unknown as Window));
    expect(view.setInterval).toHaveBeenCalledWith(expect.any(Function), 1000);
    unmount();
    expect(view.clearInterval).toHaveBeenCalledWith(7);
  });

  it("shrugs off a window that is already gone", () => {
    const view = {
      setInterval: () => 1,
      clearInterval: () => {
        throw new Error("window closed");
      },
    };
    const { unmount } = renderHook(() => useNow(1000, view as unknown as Window));
    expect(() => unmount()).not.toThrow();
  });

  it("without a window it ticks as it always did", () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useNow(1000));
      const before = result.current.getTime();
      act(() => void vi.advanceTimersByTime(3000));
      expect(result.current.getTime() - before).toBeGreaterThanOrEqual(3000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("switches timers when the window opens and closes", () => {
    const view = { setInterval: vi.fn(() => 3), clearInterval: vi.fn() };
    const { rerender } = renderHook(({ w }) => useNow(1000, w), {
      initialProps: { w: null as Window | null },
    });
    rerender({ w: view as unknown as Window });
    expect(view.setInterval).toHaveBeenCalledTimes(1);
    rerender({ w: null });
    expect(view.clearInterval).toHaveBeenCalledWith(3);
  });
});

// ---------------------------------------------------------------------------------------------
// The buttons
// ---------------------------------------------------------------------------------------------

function mount(ui: React.ReactElement) {
  const root = createRootRoute({ component: () => ui });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router} />);
}

describe("the Pop out button", () => {
  it("is not offered where there is nothing useful to open", async () => {
    mount(<PopoutButton />);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("opens the pop-out, then brings it back", async () => {
    const win = fakePopoutWindow();
    const pip = stubPictureInPicture(win);
    mount(<PopoutButton />);

    const button = await screen.findByRole("button", { name: /Pop out/ });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button.title).toMatch(/stays on top of other apps/);

    fireEvent.click(button);
    await waitFor(() => expect(usePopout.getState().win).toBe(win));
    expect(pip.requestWindow).toHaveBeenCalledTimes(1);
    const back = await screen.findByRole("button", { name: /Bring back/ });
    expect(back).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(back);
    expect(usePopout.getState().win).toBeNull();
    expect(win.close).toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: /Pop out/ })).toBeInTheDocument();
  });

  it("is honest that an ordinary window will not stay on top", async () => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      (q: string) => ({ matches: q.includes("pointer: fine"), media: q }) as MediaQueryList,
    );
    mount(<PopoutButton />);
    const button = await screen.findByRole("button", { name: /Pop out/ });
    expect(button.title).toBe("Open the timer in a small window");
  });

  it("explains a blocked window clearly, and stays a Pop out button", async () => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      (q: string) => ({ matches: q.includes("pointer: fine"), media: q }) as MediaQueryList,
    );
    vi.spyOn(window, "open").mockReturnValue(null);
    mount(<PopoutButton />);

    fireEvent.click(await screen.findByRole("button", { name: /Pop out/ }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(toast.error.mock.calls[0]![0]).toBe("Couldn't open the pop-out");
    expect(toast.error.mock.calls[0]![1].description).toMatch(/Allow pop-ups/);
    expect(screen.getByRole("button", { name: /Pop out/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("the compact version says what it does without a visible label", async () => {
    stubPictureInPicture(fakePopoutWindow());
    mount(<PopoutButton iconOnly />);
    expect(await screen.findByRole("button", { name: "Pop out the timer" })).toBeInTheDocument();
  });
});

describe("where the button lives", () => {
  const NOW = at(19, 16, 0);
  async function renderFocus() {
    const root = createRootRoute({ component: () => <Focus now={NOW} /> });
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    render(<RouterProvider router={router} />);
    await screen.findByRole("heading", { name: "Focus" });
  }

  it("beside a running focus block's controls", async () => {
    stubPictureInPicture(fakePopoutWindow());
    useTimer.setState({ timer: timerAgo(10) });
    await renderFocus();
    expect(await screen.findByRole("button", { name: /Pop out/ })).toBeInTheDocument();
  });

  it("beside a break's controls", async () => {
    stubPictureInPicture(fakePopoutWindow());
    useTimer.setState({ timer: toBreak(timerAgo(50), Date.now()) });
    await renderFocus();
    expect(await screen.findByRole("button", { name: /Pop out/ })).toBeInTheDocument();
  });

  it("not on the start screen, where there is no timer to pop out", async () => {
    stubPictureInPicture(fakePopoutWindow());
    await renderFocus();
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole("button", { name: /Pop out/ })).toBeNull();
  });

  it("on the floating pill, which keeps its link to the timer", async () => {
    stubPictureInPicture(fakePopoutWindow());
    useTimer.setState({ timer: timerAgo(10) });
    const root = createRootRoute({ component: () => <TimerDock /> });
    const focus = createRoute({
      getParentRoute: () => root,
      path: "/focus",
      component: () => null,
    });
    const router = createRouter({
      routeTree: root.addChildren([focus]),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    render(<RouterProvider router={router} />);

    expect(await screen.findByRole("link", { name: /Focus timer 40:0\d/ })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Pop out the timer" })).toBeInTheDocument();
  });

  it("the pill ticks from the pop-out's window while it is open", async () => {
    const win = fakePopoutWindow();
    const spy = vi.spyOn(win, "setInterval");
    useTimer.setState({ timer: timerAgo(10) });
    const root = createRootRoute({ component: () => <TimerDock /> });
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    render(<RouterProvider router={router} />);
    await screen.findByRole("link", { name: /Focus timer/ });
    expect(spy).not.toHaveBeenCalled();

    act(() => usePopout.setState({ win, kind: "pip" }));

    await waitFor(() => expect(spy).toHaveBeenCalledWith(expect.any(Function), 1000));
  });
});
