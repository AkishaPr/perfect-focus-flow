import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Today } from "@/components/Today";
import { useStore } from "@/lib/store";
import { at, dailyWindow, makeSettings, makeTask } from "./planner-fixtures";

const NOW = at(19, 16, 0); // Monday 16:00

async function renderToday(now = NOW) {
  const root = createRootRoute({ component: () => <Today now={now} /> });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { name: "Today" });
}

const seed = (tasks = [makeTask({ id: "a", title: "Integration homework", estimateMin: 45 })]) =>
  useStore.setState({
    settings: makeSettings({ studyWindows: dailyWindow("16:00", "21:00") }),
    tasks,
  });

beforeEach(() => useStore.getState().reset());
afterEach(cleanup);

describe("Today page", () => {
  it("shows the next task with why it was picked, and a Start button", async () => {
    seed([
      makeTask({
        id: "a",
        title: "Integration homework",
        estimateMin: 45,
        deadline: "2026-10-17",
        importance: 5,
      }),
    ]);
    await renderToday();
    const next = screen.getByRole("region", { name: "Next task" });
    expect(within(next).getByText("Integration homework")).toBeInTheDocument();
    expect(within(next).getByText(/Now · 16:00–16:45/)).toBeInTheDocument();
    expect(within(next).getByRole("list", { name: "Why this task" })).toHaveTextContent("overdue");
    expect(within(next).getByRole("button", { name: /Start next task/ })).toBeEnabled();
  });

  it("shows importance as gold stars, not a fraction", async () => {
    seed([
      makeTask({
        id: "a",
        title: "Integration homework",
        estimateMin: 45,
        deadline: "2026-10-17",
        importance: 4,
      }),
    ]);
    await renderToday();
    const why = within(screen.getByRole("region", { name: "Next task" })).getByRole("list", {
      name: "Why this task",
    });
    const stars = within(why).getByRole("img", { name: "Importance 4 of 5" });
    expect(stars.querySelectorAll("svg")).toHaveLength(5);
    expect(stars.querySelectorAll('svg[data-filled="true"]')).toHaveLength(4);
    expect(why).not.toHaveTextContent("4/5");
  });

  it("Start commits the block and switches to the in-progress card", async () => {
    seed();
    await renderToday();
    fireEvent.click(screen.getByRole("button", { name: /Start next task/ }));

    const active = await screen.findByRole("region", { name: "In progress" });
    expect(within(active).getByText("Integration homework")).toBeInTheDocument();
    expect(within(active).getByText(/Planned 16:00–16:45/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Start next task/ })).toBeNull();
    expect(useStore.getState().tasks[0]?.status).toBe("in_progress");
    expect(useStore.getState().blocks).toHaveLength(1);
  });

  it("Put back returns the task to Next up", async () => {
    seed();
    await renderToday();
    fireEvent.click(screen.getByRole("button", { name: /Start next task/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Put back/ }));

    expect(await screen.findByRole("region", { name: "Next task" })).toBeInTheDocument();
    expect(useStore.getState().tasks[0]?.status).toBe("todo");
    expect(useStore.getState().blocks).toEqual([]);
  });

  it("Mark done finishes the task and records the study time", async () => {
    seed();
    await renderToday();
    fireEvent.click(screen.getByRole("button", { name: /Start next task/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Mark done/ }));

    expect(useStore.getState().tasks[0]?.status).toBe("done");
    expect(useStore.getState().blocks[0]?.status).toBe("done");
    expect(await screen.findByText(/Nothing to plan yet/)).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument(); // timeline tag
  });

  it("says what to do when there are no tasks", async () => {
    seed([]);
    await renderToday();
    expect(screen.getByText(/Nothing to plan yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add a task" })).toHaveAttribute("href", "/tasks");
  });

  it("explains an empty plan and links to Settings when there is no study time", async () => {
    useStore.setState({
      settings: makeSettings({ studyWindows: [] }),
      tasks: [makeTask({ id: "a" })],
    });
    await renderToday();
    expect(screen.getByRole("region", { name: "Planner warnings" })).toHaveTextContent(
      /No free study time/,
    );
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
  });

  it("shows warnings in words, not just colour", async () => {
    seed([makeTask({ id: "a", title: "Late paper", deadline: "2026-10-15" })]);
    await renderToday();
    const warnings = screen.getByRole("region", { name: "Planner warnings" });
    expect(warnings).toHaveTextContent(/"Late paper" is 4 days overdue/);
    expect(warnings).toHaveTextContent(/Needs attention:/);
  });

  it("doesn't offer Start for a block that is on another day", async () => {
    seed();
    await renderToday(at(19, 22, 0));
    const next = screen.getByRole("region", { name: "Next task" });
    expect(next).toHaveTextContent(/Nothing more today\. Next study block: 2026-10-20 at 16:00/);
    expect(screen.queryByRole("button", { name: /Start next task/ })).toBeNull();
  });

  it("shows progress against the daily goal", async () => {
    seed();
    useStore.setState({
      blocks: [
        {
          id: "d",
          taskId: "gone",
          date: "2026-10-19",
          start: "07:00",
          end: "09:00",
          status: "done",
        },
      ],
    });
    await renderToday();
    expect(screen.getByText("2h")).toBeInTheDocument();
    expect(screen.getByText(/50% of your 4h goal/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: /today's study goal/i })).toBeInTheDocument();
  });

  it("splits today's study by subject and shows deleted-task time as Other", async () => {
    seed([makeTask({ id: "m", title: "Maths task", subject: "maths" })]);
    useStore.setState({
      blocks: [
        { id: "d1", taskId: "m", date: "2026-10-19", start: "07:00", end: "08:00", status: "done" },
        {
          id: "d2",
          taskId: "gone",
          date: "2026-10-19",
          start: "09:00",
          end: "09:30",
          status: "done",
        },
      ],
    });
    await renderToday();
    const glance = screen.getByRole("complementary", { name: "Today at a glance" });
    expect(within(glance).getByText("1h 00m")).toBeInTheDocument(); // Maths
    expect(within(glance).getByText("Other")).toBeInTheDocument();
    expect(within(glance).getByText("30m")).toBeInTheDocument();
  });

  it("puts a now line in the timeline where the clock is", async () => {
    seed([makeTask({ id: "a", title: "Integration homework", estimateMin: 45 })]);
    useStore.setState({
      blocks: [
        {
          id: "d1",
          taskId: "gone",
          date: "2026-10-19",
          start: "07:00",
          end: "08:00",
          status: "done",
        },
      ],
    });
    await renderToday();
    const timeline = within(screen.getByRole("region", { name: "Today's timeline" }));
    const items = timeline.getAllByRole("listitem");
    // finished block, then the current time, then what's planned
    expect(items[0]).toHaveTextContent("Done");
    expect(items[1]).toHaveTextContent("Current time 16:00");
    expect(items[2]).toHaveTextContent("Integration homework");
  });

  it("shows how much of the planned block is left while a task is in progress", async () => {
    seed();
    await renderToday(at(19, 16, 0));
    fireEvent.click(screen.getByRole("button", { name: /Start next task/ }));
    const active = await screen.findByRole("region", { name: "In progress" });
    expect(within(active).getByRole("img", { name: "45m left in block" })).toBeInTheDocument();
    // no "now" line in the timeline: the in-progress row carries the marker
    expect(screen.queryByText(/Current time/)).toBeNull();
  });

  it("says when a block has gone past its planned end", async () => {
    seed();
    await renderToday(at(19, 16, 0));
    fireEvent.click(screen.getByRole("button", { name: /Start next task/ }));
    cleanup();
    await renderToday(at(19, 17, 0)); // 15 minutes after the 16:45 end
    const active = await screen.findByRole("region", { name: "In progress" });
    expect(within(active).getByRole("img", { name: "+15m past planned end" })).toBeInTheDocument();
  });

  it("lists the longest-overdue task and opens it for rescheduling", async () => {
    seed([
      makeTask({ id: "a", title: "Late paper", deadline: "2026-10-15" }),
      makeTask({ id: "b", title: "Late notes", deadline: "2026-10-18" }),
    ]);
    await renderToday();
    const glance = screen.getByRole("complementary", { name: "Today at a glance" });
    expect(within(glance).getByText("4 days overdue")).toBeInTheDocument();
    expect(within(glance).getByText(/and 1 more in/)).toBeInTheDocument();
    fireEvent.click(within(glance).getByRole("button", { name: "Reschedule" }));
    expect(await screen.findByRole("heading", { name: "Edit task" })).toBeInTheDocument();
  });

  it("opens an empty task form from Add task", async () => {
    seed([]);
    await renderToday();
    fireEvent.click(screen.getByRole("button", { name: /Add task/ }));
    expect(await screen.findByRole("heading", { name: "New task" })).toBeInTheDocument();
  });

  it("describes the week chart in words, not just bar heights", async () => {
    seed();
    useStore.setState({
      blocks: [
        {
          id: "d1",
          taskId: "gone",
          date: "2026-10-19",
          start: "07:00",
          end: "09:00",
          status: "done",
        },
      ],
    });
    await renderToday();
    const chart = screen.getByRole("img", { name: /^Study time per day\./ });
    expect(chart.getAttribute("aria-label")).toMatch(/Monday 2h/);
    expect(chart.getAttribute("aria-label")).toMatch(/Tuesday not yet/);
  });
});
