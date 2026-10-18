import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Today } from "@/components/Today";
import { usePlanLog } from "@/lib/recovery/log";
import { useStore } from "@/lib/store";
import { at, dailyWindow, makeSession, makeSettings, makeTask } from "./planner-fixtures";

const TUESDAY = at(20, 16, 0);

async function renderToday(now = TUESDAY) {
  const root = createRootRoute({ component: () => <Today now={now} /> });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { name: "Today" });
}

/** Yesterday's plan promised `plannedMin` for each task. */
const promisedYesterday = (...items: [string, number][]) =>
  usePlanLog.setState({
    logs: [
      {
        date: "2026-10-19",
        items: items.map(([taskId, plannedMin]) => ({ taskId, plannedMin })),
      },
    ],
  });

const seed = (tasks = [makeTask({ id: "a", title: "Integration homework", estimateMin: 60 })]) =>
  useStore.setState({
    settings: makeSettings({ studyWindows: dailyWindow("16:00", "21:00") }),
    tasks,
  });

const card = () => screen.getByRole("region", { name: "Missed work" });
const taskNow = (id: string) => useStore.getState().tasks.find((t) => t.id === id)!;

beforeEach(() => useStore.getState().reset());
afterEach(cleanup);

describe("Today remembers the plan", () => {
  it("snapshots what today's plan promised, once", async () => {
    seed();
    await renderToday();
    await waitFor(() => expect(usePlanLog.getState().logs).toHaveLength(1));
    expect(usePlanLog.getState().logs[0]).toEqual({
      date: "2026-10-20",
      items: [{ taskId: "a", plannedMin: 60 }],
    });
    cleanup();

    // A task added later in the day doesn't change what was promised
    seed([
      makeTask({ id: "a", title: "Integration homework", estimateMin: 60 }),
      makeTask({ id: "b", title: "Late addition", estimateMin: 30 }),
    ]);
    await renderToday(at(20, 17, 0));
    expect(usePlanLog.getState().logs[0]?.items.map((i) => i.taskId)).toEqual(["a"]);
  });

  it("doesn't snapshot a day with no plan", async () => {
    seed([]);
    await renderToday();
    expect(usePlanLog.getState().logs).toEqual([]);
  });
});

describe("Missed work card", () => {
  it("asks about yesterday's task that didn't get done", async () => {
    seed();
    promisedYesterday(["a", 60]);
    await renderToday();
    const c = card();
    expect(c).toHaveTextContent("1 task from earlier didn't get done");
    expect(within(c).getByText("Integration homework")).toBeInTheDocument();
    expect(c).toHaveTextContent(/Planned 60 min on .*Mon.* studied 0 min/);
    for (const label of ["Carry over", "Keep as is", "Defer", "Mark done"]) {
      expect(
        within(c).getByRole("button", { name: `${label}: Integration homework` }),
      ).toBeEnabled();
    }
  });

  it("stays away when the task got enough time", async () => {
    seed();
    promisedYesterday(["a", 60]);
    useStore.setState({
      sessions: [
        makeSession({
          taskId: "a",
          start: new Date(2026, 9, 19, 17, 0).toISOString(),
          end: new Date(2026, 9, 19, 17, 40).toISOString(),
          actualMin: 40,
        }),
      ],
    });
    await renderToday();
    expect(screen.queryByRole("region", { name: "Missed work" })).toBeNull();
    // and the settled day is forgotten rather than asked about again
    await waitFor(() =>
      expect(usePlanLog.getState().logs.every((l) => l.date >= "2026-10-20")).toBe(true),
    );
  });

  it("Carry over raises the task's carry-over count, flags it missed and closes the card", async () => {
    seed();
    promisedYesterday(["a", 60]);
    await renderToday();
    fireEvent.click(screen.getByRole("button", { name: "Carry over: Integration homework" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Missed work" })).toBeNull());
    expect(taskNow("a")).toMatchObject({ carryOverCount: 1, status: "missed" });
    expect(usePlanLog.getState().logs.every((l) => l.date >= "2026-10-20")).toBe(true);
  });

  it("Keep as is changes nothing about the task but still closes the card", async () => {
    seed();
    promisedYesterday(["a", 60]);
    await renderToday();
    fireEvent.click(screen.getByRole("button", { name: "Keep as is: Integration homework" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Missed work" })).toBeNull());
    expect(taskNow("a")).toMatchObject({ carryOverCount: 0, status: "todo" });
  });

  it("Defer takes the task out of planning", async () => {
    seed();
    promisedYesterday(["a", 60]);
    await renderToday();
    fireEvent.click(screen.getByRole("button", { name: "Defer: Integration homework" }));
    await waitFor(() => expect(taskNow("a").status).toBe("deferred"));
    expect(screen.queryByRole("region", { name: "Missed work" })).toBeNull();
  });

  it("Mark done completes the task", async () => {
    seed();
    promisedYesterday(["a", 60]);
    await renderToday();
    fireEvent.click(screen.getByRole("button", { name: "Mark done: Integration homework" }));
    await waitFor(() => expect(taskNow("a").status).toBe("done"));
    expect(taskNow("a").completedAt).toBeTruthy();
  });

  it("carries everything over in one click, except tasks that need a decision first", async () => {
    seed([
      makeTask({ id: "a", title: "Easy one", estimateMin: 60 }),
      makeTask({ id: "b", title: "Another easy one", estimateMin: 30 }),
      makeTask({ id: "c", title: "Avoided one", estimateMin: 45, carryOverCount: 2 }),
    ]);
    promisedYesterday(["a", 60], ["b", 30], ["c", 45]);
    await renderToday();
    const c = card();
    expect(c).toHaveTextContent("3 tasks from earlier didn't get done");
    expect(c).toHaveTextContent("1 needs a decision first.");
    expect(c).toHaveTextContent(/Carried over 2× already\. Split it or shrink the estimate/);

    fireEvent.click(within(c).getByRole("button", { name: "Carry 2 of them over" }));
    await waitFor(() => expect(taskNow("a").carryOverCount).toBe(1));
    expect(taskNow("b").carryOverCount).toBe(1);
    expect(taskNow("c").carryOverCount).toBe(2); // untouched

    const left = await screen.findByRole("region", { name: "Missed work" });
    expect(left).toHaveTextContent("1 task from earlier didn't get done");
    expect(within(left).getByText("Avoided one")).toBeInTheDocument();
    expect(within(left).queryByText("Easy one")).toBeNull();
  });

  it("lists tasks most in need of a decision first", async () => {
    seed([
      makeTask({ id: "a", title: "Calm", estimateMin: 90 }),
      makeTask({ id: "b", title: "Avoided", estimateMin: 30, carryOverCount: 2 }),
    ]);
    promisedYesterday(["a", 90], ["b", 30]);
    await renderToday();
    const titles = within(card())
      .getAllByRole("listitem")
      .map((li) => li.textContent ?? "");
    expect(titles[0]).toContain("Avoided");
    expect(titles[1]).toContain("Calm");
  });

  it("opens the task editor from a row so it can be split or shrunk first", async () => {
    seed();
    promisedYesterday(["a", 60]);
    await renderToday();
    fireEvent.click(screen.getByRole("button", { name: "Edit: Integration homework" }));
    expect(await screen.findByRole("heading", { name: "Edit task" })).toBeInTheDocument();
    // editing doesn't resolve it: the card is still there to make the choice
    expect(taskNow("a").carryOverCount).toBe(0);
  });

  it("covers several missed days in one card, counting the carry-over once", async () => {
    seed();
    usePlanLog.setState({
      logs: [
        { date: "2026-10-18", items: [{ taskId: "a", plannedMin: 60 }] },
        { date: "2026-10-19", items: [{ taskId: "a", plannedMin: 60 }] },
      ],
    });
    await renderToday();
    expect(card()).toHaveTextContent("Missed on 2 days");
    fireEvent.click(screen.getByRole("button", { name: "Carry over: Integration homework" }));
    await waitFor(() => expect(taskNow("a").carryOverCount).toBe(1));
  });
});
