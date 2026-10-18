import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Focus } from "@/components/Focus";
import { TIMER_KEY, hydrateTimer, useTimer } from "@/lib/focus/store";
import { MS_PER_MIN, startTimer } from "@/lib/focus/timer";
import { useStore } from "@/lib/store";
import { at, dailyWindow, makeSettings, makeTask } from "./planner-fixtures";

const NOW = at(19, 16, 0); // Monday 16:00; the study window opens at 16:00
const min = (n: number) => n * MS_PER_MIN;

async function renderFocus(now = NOW) {
  const root = createRootRoute({ component: () => <Focus now={now} /> });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { name: "Focus" });
}

const seed = (tasks = [makeTask({ id: "a", title: "Integration homework", estimateMin: 45 })]) =>
  useStore.setState({
    settings: makeSettings({ studyWindows: dailyWindow("16:00", "21:00") }),
    tasks,
  });

/** A timer that began `agoMin` minutes before NOW. */
const runningSince = (agoMin: number, over: Partial<Parameters<typeof startTimer>[0]> = {}) =>
  useTimer.setState({
    timer: startTimer(
      { taskId: "a", targetMin: 50, focusMin: 50, breakMin: 10, ...over },
      NOW.getTime() - min(agoMin),
    ),
  });

const clock = () => screen.getByRole("timer").textContent;

beforeEach(() => {
  useStore.getState().reset();
  useTimer.setState({ timer: null });
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("starting", () => {
  it("offers the planner's pick, and starts on the length of the block it scheduled", async () => {
    seed();
    await renderFocus();
    const select = screen.getByLabelText("What are you working on?") as HTMLSelectElement;
    expect(select.value).toBe("a");
    expect(select).toHaveDisplayValue(/★ .*Integration homework/);

    fireEvent.click(screen.getByRole("button", { name: /Start focus · 45 min/ }));

    const timer = useTimer.getState().timer;
    expect(timer).toMatchObject({ taskId: "a", phase: "focus", targetMin: 45 });
    expect(timer?.blockId).toBeTruthy();
    // Starting from the planner's block pins it and puts the task in progress, like Today's Start.
    expect(useStore.getState().tasks[0]?.status).toBe("in_progress");
    expect(useStore.getState().blocks).toHaveLength(1);
    expect(await screen.findByRole("region", { name: "Timer" })).toBeInTheDocument();
    expect(clock()).toBe("45:00");
  });

  it("uses the Settings focus length for a task the planner didn't pick", async () => {
    seed([
      makeTask({
        id: "a",
        title: "Urgent",
        estimateMin: 45,
        deadline: "2026-10-17",
        importance: 5,
      }),
      makeTask({ id: "b", title: "Chill reading", estimateMin: 45, importance: 1 }),
    ]);
    await renderFocus();
    fireEvent.change(screen.getByLabelText("What are you working on?"), { target: { value: "b" } });
    fireEvent.click(screen.getByRole("button", { name: /Start focus · 50 min/ }));

    expect(useTimer.getState().timer).toMatchObject({ taskId: "b", targetMin: 50, blockId: null });
    expect(useStore.getState().blocks).toEqual([]);
    expect(useStore.getState().tasks.find((t) => t.id === "b")?.status).toBe("in_progress");
  });

  it("shows how much of the estimate is already logged", async () => {
    seed();
    useStore.setState({
      sessions: [
        { id: "s", taskId: "a", start: NOW.toISOString(), end: NOW.toISOString(), actualMin: 30 },
      ],
    });
    await renderFocus();
    expect(screen.getByText(/30 min logged of 45 min/)).toBeInTheDocument();
  });

  it("says when the estimate is used up", async () => {
    seed();
    useStore.setState({
      sessions: [
        { id: "s", taskId: "a", start: NOW.toISOString(), end: NOW.toISOString(), actualMin: 45 },
      ],
    });
    await renderFocus();
    expect(screen.getByText(/estimate used up/)).toBeInTheDocument();
  });

  it("points to Tasks when there's nothing to focus on", async () => {
    seed([]);
    await renderFocus();
    expect(screen.getByRole("link", { name: "Add a task" })).toHaveAttribute("href", "/tasks");
    expect(screen.queryByRole("button", { name: /Start focus/ })).toBeNull();
  });
});

describe("running", () => {
  it("counts down from the clock, not from how long the page has been open", async () => {
    seed();
    runningSince(10);
    await renderFocus();
    expect(clock()).toBe("40:00");
  });

  it("freezes on Pause and carries on after Resume", async () => {
    seed();
    runningSince(10);
    await renderFocus();
    fireEvent.click(screen.getByRole("button", { name: /Pause/ }));
    expect(useTimer.getState().timer?.runStartedAt).toBeNull();
    expect(screen.getByText(/paused/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: /Resume/ }));
    expect(useTimer.getState().timer?.runStartedAt).toBe(NOW.getTime());
  });

  it("shows overtime past the target and offers a break", async () => {
    seed();
    runningSince(55);
    await renderFocus();
    expect(clock()).toBe("+5:00");
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Focus block complete.");

    fireEvent.click(within(status).getByRole("button", { name: /Take a 10 min break/ }));

    const { sessions, blocks } = useStore.getState();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ taskId: "a", actualMin: 55 });
    expect(blocks[0]).toMatchObject({ status: "done", start: "15:05", end: "16:00" });
    expect(useTimer.getState().timer).toMatchObject({ phase: "break", targetMin: 10, segments: 1 });
    expect(await screen.findByText("Break")).toBeInTheDocument();
    expect(clock()).toBe("10:00");
  });

  it("'Keep going' dismisses the prompt without logging anything", async () => {
    seed();
    runningSince(55);
    await renderFocus();
    fireEvent.click(screen.getByRole("button", { name: "Keep going" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(useStore.getState().sessions).toEqual([]);
    expect(useTimer.getState().timer?.phase).toBe("focus");
  });

  it("after a break, starts the next focus on the same task", async () => {
    seed();
    runningSince(55);
    await renderFocus();
    fireEvent.click(screen.getByRole("button", { name: /Take a 10 min break/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Skip break/ }));
    expect(useTimer.getState().timer).toMatchObject({ phase: "focus", taskId: "a", segments: 1 });
    expect(await screen.findByText(/session 2/)).toBeInTheDocument();
  });

  it("ends the sitting from a break without logging anything extra", async () => {
    seed();
    runningSince(55);
    await renderFocus();
    fireEvent.click(screen.getByRole("button", { name: /Take a 10 min break/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Done for now" }));
    expect(useTimer.getState().timer).toBeNull();
    expect(useStore.getState().sessions).toHaveLength(1);
  });
});

describe("wrapping up", () => {
  it("pauses while deciding, then logs the minutes you confirm", async () => {
    seed();
    runningSince(20);
    await renderFocus();
    fireEvent.click(screen.getByRole("button", { name: /Stop/ }));

    expect(useTimer.getState().timer?.runStartedAt).toBeNull(); // clock frozen
    const input = screen.getByLabelText("Minutes studied") as HTMLInputElement;
    expect(input.value).toBe("20");

    fireEvent.change(input, { target: { value: "18" } });
    fireEvent.click(screen.getByRole("button", { name: "Save and stop" }));

    const { sessions, blocks, tasks } = useStore.getState();
    expect(sessions[0]).toMatchObject({ taskId: "a", actualMin: 18 });
    expect(blocks[0]?.status).toBe("partial"); // 18 of a 50 min plan
    expect(tasks[0]?.status).toBe("in_progress");
    expect(useTimer.getState().timer).toBeNull();

    // Back to the picker, with the session listed and the estimate updated.
    expect(
      await screen.findByRole("region", { name: "Start a focus session" }),
    ).toBeInTheDocument();
    const list = screen.getByRole("region", { name: "Today's sessions" });
    expect(within(list).getByText("Integration homework")).toBeInTheDocument();
    expect(within(list).getByText("18 min")).toBeInTheDocument();
    expect(screen.getByText(/18 min logged of 45 min/)).toBeInTheDocument();
  });

  it("'Save and mark task done' finishes the task", async () => {
    seed();
    runningSince(30);
    await renderFocus();
    fireEvent.click(screen.getByRole("button", { name: /Stop/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save and mark task done" }));

    const task = useStore.getState().tasks[0];
    expect(task?.status).toBe("done");
    expect(task?.completedAt).toBe(NOW.toISOString());
    expect(useStore.getState().sessions[0]?.actualMin).toBe(30);
    expect(await screen.findByText(/Nothing to focus on yet/)).toBeInTheDocument();
  });

  it("Cancel resumes the clock where it was", async () => {
    seed();
    runningSince(20);
    await renderFocus();
    fireEvent.click(screen.getByRole("button", { name: /Stop/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(useTimer.getState().timer?.runStartedAt).toBe(NOW.getTime());
    expect(screen.queryByLabelText("Minutes studied")).toBeNull();
    expect(useStore.getState().sessions).toEqual([]);
  });

  it("Cancel leaves a timer that was already paused paused", async () => {
    seed();
    runningSince(20);
    await renderFocus();
    fireEvent.click(screen.getByRole("button", { name: /Pause/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Stop/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(useTimer.getState().timer?.runStartedAt).toBeNull();
  });

  it("won't save a nonsense number of minutes", async () => {
    seed();
    runningSince(20);
    await renderFocus();
    fireEvent.click(screen.getByRole("button", { name: /Stop/ }));
    const input = screen.getByLabelText("Minutes studied");
    for (const bad of ["", "-3", "5000"]) {
      fireEvent.change(input, { target: { value: bad } });
      expect(screen.getByRole("button", { name: "Save and stop" })).toBeDisabled();
    }
  });

  it("doesn't trust a timer that was left on: asks for the real minutes", async () => {
    seed();
    runningSince(5 * 60);
    await renderFocus();
    expect(screen.queryByRole("status")).toBeNull(); // no 'block complete' prompt for a forgotten timer
    fireEvent.click(screen.getByRole("button", { name: /Stop/ }));
    expect(screen.getByRole("group", { name: "Wrap up" })).toHaveTextContent(
      /running for 5h.*how long you actually studied/,
    );
    expect((screen.getByLabelText("Minutes studied") as HTMLInputElement).value).toBe("50");
  });

  it("logs nothing for a start-and-stop under a minute", async () => {
    seed();
    useTimer.setState({
      timer: startTimer(
        { taskId: "a", targetMin: 50, focusMin: 50, breakMin: 10 },
        NOW.getTime() - 20_000,
      ),
    });
    await renderFocus();
    fireEvent.click(screen.getByRole("button", { name: /Stop/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save and stop" }));
    expect(useStore.getState().sessions).toEqual([]);
    expect(useStore.getState().blocks).toEqual([]);
    expect(useTimer.getState().timer).toBeNull();
  });

  it("releases the pinned block when a timer started from it logs nothing", async () => {
    seed();
    await renderFocus();
    fireEvent.click(screen.getByRole("button", { name: /Start focus/ }));
    expect(useStore.getState().blocks).toHaveLength(1);
    fireEvent.click(await screen.findByRole("button", { name: /Stop/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save and stop" })); // 0 minutes elapsed
    expect(useStore.getState().blocks).toEqual([]);
  });
});

describe("a timer whose task is gone", () => {
  it("explains and lets you discard it", async () => {
    seed();
    useTimer.setState({
      timer: startTimer(
        { taskId: "ghost", targetMin: 50, focusMin: 50, breakMin: 10 },
        NOW.getTime(),
      ),
    });
    await renderFocus();
    expect(screen.getByText(/no longer exists/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Discard timer/ }));
    expect(useTimer.getState().timer).toBeNull();
  });
});

describe("today's sessions", () => {
  async function logOne() {
    seed();
    runningSince(25);
    await renderFocus();
    fireEvent.click(screen.getByRole("button", { name: /Stop/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save and stop" }));
    await screen.findByRole("region", { name: "Today's sessions" });
  }

  it("deleting a session removes its minutes and its block", async () => {
    await logOne();
    expect(screen.getByText(/Studied today: 25 min/)).toBeInTheDocument();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: /Delete session: Integration homework/ }));
    expect(useStore.getState().sessions).toEqual([]);
    expect(useStore.getState().blocks).toEqual([]);
    expect(await screen.findByText(/No focus sessions logged yet today/)).toBeInTheDocument();
    expect(screen.getByText(/Studied today: 0 min/)).toBeInTheDocument();
  });

  it("keeps the session if you decline the confirmation", async () => {
    await logOne();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: /Delete session/ }));
    expect(useStore.getState().sessions).toHaveLength(1);
  });

  it("only lists today's sessions", async () => {
    seed();
    useStore.setState({
      sessions: [
        {
          id: "old",
          taskId: "a",
          start: at(18, 16, 0).toISOString(),
          end: at(18, 17, 0).toISOString(),
          actualMin: 60,
        },
      ],
    });
    await renderFocus();
    expect(screen.getByText(/No focus sessions logged yet today/)).toBeInTheDocument();
  });
});

describe("the saved timer", () => {
  it("survives a reload", async () => {
    seed();
    await renderFocus();
    fireEvent.click(screen.getByRole("button", { name: /Start focus/ }));
    const saved = useTimer.getState().timer;
    const raw = localStorage.getItem(TIMER_KEY);
    expect(raw).toBeTruthy();

    cleanup(); // "close the tab"
    useTimer.setState({ timer: null });
    localStorage.setItem(TIMER_KEY, raw!);
    await hydrateTimer();
    expect(useTimer.getState().timer).toEqual(saved);
  });

  it("starts clean, without crashing, on unreadable or invalid saved data", async () => {
    for (const junk of [
      "{not json",
      JSON.stringify({ state: { timer: { taskId: 5 } }, version: 1 }),
      JSON.stringify({ state: {}, version: 1 }),
    ]) {
      useTimer.setState({ timer: null });
      localStorage.setItem(TIMER_KEY, junk);
      await hydrateTimer();
      expect(useTimer.getState().timer).toBeNull();
    }
  });

  it("won't start a second timer while one is running, or on a finished task", () => {
    seed([makeTask({ id: "a" }), makeTask({ id: "b" }), makeTask({ id: "d", status: "done" })]);
    useTimer.getState().begin("a", NOW.getTime());
    useTimer.getState().begin("b", NOW.getTime() + 1);
    expect(useTimer.getState().timer?.taskId).toBe("a");
    useTimer.getState().clear();
    useTimer.getState().begin("d", NOW.getTime());
    expect(useTimer.getState().timer).toBeNull();
  });
});
