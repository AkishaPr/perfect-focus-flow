import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route } from "@/routes/week";
import { useStore } from "@/lib/store";
import { at, makeBlock, makeEvent, makeSettings, makeTask } from "./planner-fixtures";

// Wednesday 21 Oct 2026, 12:00. The week is Mon 19 – Sun 25 Oct.
const NOW = at(21, 12, 0);

async function renderWeek() {
  const Week = Route.options.component!;
  const root = createRootRoute({ component: () => <Week /> });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { name: "Week" });
}

beforeEach(() => {
  // Only the clock is faked, so the router and testing-library keep their real timers.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  useStore.getState().reset();
  useStore.setState({ settings: makeSettings() });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("week timetable", () => {
  it("marks today's column, and only today's", async () => {
    await renderWeek();
    const current = document.querySelectorAll('[aria-current="date"]');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("21");
  });

  it("draws the now line in today's column only", async () => {
    await renderWeek();
    // The line carries a glow made from the accent colour; nothing else on the page does.
    const lines = document.querySelectorAll("[class*='shadow-[0_0_6px_var(--signal)]']");
    expect(lines).toHaveLength(1);
    expect(screen.getByRole("group", { name: "Wednesday 21" }).contains(lines[0]!)).toBe(true);
  });

  it("puts overlapping events side by side instead of stacking them", async () => {
    useStore.setState({
      events: [
        makeEvent({ id: "a", title: "Maths class", weekday: 3, start: "14:00", end: "16:00" }),
        makeEvent({ id: "b", title: "Physics lab", weekday: 3, start: "15:00", end: "17:00" }),
        makeEvent({ id: "c", title: "ICT club", weekday: 3, start: "18:00", end: "19:00" }),
      ],
    });
    await renderWeek();
    const style = (name: string) =>
      screen.getByRole("button", { name: new RegExp(name) }).getAttribute("style") ?? "";
    expect(style("Maths class")).toContain("50%");
    expect(style("Physics lab")).toContain("50%");
    // Starts at the halfway point.
    expect(style("Physics lab")).toContain("left: calc(50%");
    // An event with the day to itself keeps the full width.
    expect(style("ICT club")).toContain("width: calc(100%");
  });

  it("colours a planned study block by its subject", async () => {
    useStore.setState({
      tasks: [makeTask({ id: "p", title: "Waves practice", subject: "physics" })],
      blocks: [
        makeBlock({ id: "b", taskId: "p", date: "2026-10-21", start: "16:00", end: "17:00" }),
      ],
    });
    await renderWeek();
    const block = screen.getByTitle("Waves practice, 16:00–17:00");
    expect(block.className).toContain("bg-physics");
  });

  it("shows a finished block as done and a missed one as missed", async () => {
    useStore.setState({
      tasks: [makeTask({ id: "m", title: "Past paper", subject: "maths" })],
      blocks: [
        makeBlock({
          id: "d",
          taskId: "m",
          date: "2026-10-20",
          start: "09:00",
          end: "10:00",
          status: "done",
        }),
        makeBlock({
          id: "x",
          taskId: "m",
          date: "2026-10-20",
          start: "11:00",
          end: "12:00",
          status: "missed",
        }),
      ],
    });
    await renderWeek();
    expect(screen.getByLabelText("Done")).toBeInTheDocument();
    expect(screen.getByTitle("Past paper, 11:00–12:00 (missed)").className).toContain(
      "border-dashed",
    );
  });

  it("labels an exam so it stands out from a class", async () => {
    useStore.setState({
      events: [
        makeEvent({
          id: "x",
          title: "Mock paper",
          kind: "exam",
          weekday: 4,
          start: "09:00",
          end: "12:00",
        }),
      ],
    });
    await renderWeek();
    expect(
      within(screen.getByRole("button", { name: /Mock paper/ })).getByText("Exam"),
    ).toBeInTheDocument();
  });

  it("runs the time grid past midnight to 03:00, where the study day ends", async () => {
    await renderWeek();
    for (const label of ["23:00", "00:00", "01:00", "02:00"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});

describe("overnight timetable", () => {
  it("draws the complete Sunday class and opens the original event when editing", async () => {
    useStore.setState({
      events: [
        makeEvent({
          id: "overnight",
          title: "Late Physics",
          weekday: 0,
          start: "23:09",
          end: "02:29",
        }),
      ],
    });
    await renderWeek();
    const sunday = screen.getByRole("group", { name: "Sunday 25" });
    const event = within(sunday).getByRole("button", { name: /Late Physics/ });
    expect(event.style.height).toBe("200px");
    expect(event.title).toContain("23:09–02:29 (+1 day)");
    fireEvent.click(event);
    expect(screen.getByDisplayValue("23:09")).toBeInTheDocument();
    expect(screen.getByDisplayValue("02:29")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("creates a Monday event when clicking Sunday after midnight", async () => {
    await renderWeek();
    const sunday = screen.getByRole("group", { name: "Sunday 25" });
    // 01:00 next morning, relative to the column's 03:00 start.
    fireEvent.click(sunday, { clientY: (25 - 3) * 60 });
    expect(screen.getByDisplayValue("01:00")).toBeInTheDocument();
    expect(screen.getByDisplayValue("03:00")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Monday")).toBeInTheDocument();
  });
});
