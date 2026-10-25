import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProgressDashboard } from "@/components/ProgressDashboard";
import { Today } from "@/components/Today";
import { useStore } from "@/lib/store";
import { at, dailyWindow, makeMark, makeSettings } from "./planner-fixtures";

const NOW = at(21, 12, 0); // Wednesday 21 Oct 2026, midday

async function renderPage(page: "today" | "progress") {
  const root = createRootRoute({
    component: () => (page === "today" ? <Today now={NOW} /> : <ProgressDashboard now={NOW} />),
  });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { name: page === "today" ? "Today" : "Progress" });
}

/** The same long date the banner shows, so the tests don't depend on the browser's language. */
const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

beforeEach(() => useStore.getState().reset());
afterEach(cleanup);

describe("exam countdown on Today", () => {
  const seed = (examDate: string) =>
    useStore.setState({
      settings: makeSettings({ examDate, studyWindows: dailyWindow("16:00", "21:00") }),
    });
  const banner = () => screen.getByRole("region", { name: "Exam countdown" });

  it("counts the days and weeks to the A/L", async () => {
    seed("2026-11-04"); // 14 days away
    await renderPage("today");
    expect(banner()).toHaveTextContent("14 days to the A/L");
    expect(banner()).toHaveTextContent("about 2 weeks");
    expect(banner()).toHaveTextContent(longDate("2026-11-04"));
  });

  it("uses singular words, and leaves out weeks under a week", async () => {
    seed("2026-10-22");
    await renderPage("today");
    expect(banner()).toHaveTextContent("1 day to the A/L");
    expect(banner()).not.toHaveTextContent("week");
  });

  it("says so on the day, and afterwards", async () => {
    seed("2026-10-21");
    await renderPage("today");
    expect(banner()).toHaveTextContent("The A/L starts today.");
    cleanup();
    seed("2026-10-14");
    await renderPage("today");
    expect(banner()).toHaveTextContent(`The A/L started on ${longDate("2026-10-14")}.`);
  });
});

describe("targets on the Progress page", () => {
  const seed = (marks = [makeMark({ id: "a", subject: "maths", score: 50 })]) =>
    useStore.setState({
      settings: makeSettings({
        examDate: "2026-12-21", // 61 days away, about two months
        targets: { maths: 78, physics: 78, ict: 85 },
      }),
      marks,
    });
  const card = (name: string) => within(screen.getByRole("article", { name }));

  it("shows how far a subject is from its target, and the pace needed", async () => {
    seed();
    await renderPage("progress");
    const maths = card("Combined Maths marks");
    expect(maths.getByText(/Target 78%:/)).toBeInTheDocument();
    expect(maths.getByText(/28 points to go/)).toBeInTheDocument();
    expect(maths.getByText(/About \+14 points a month/)).toBeInTheDocument();
  });

  it("says when the target is already met on the recent average", async () => {
    seed([makeMark({ id: "i", subject: "ict", score: 90 })]);
    await renderPage("progress");
    expect(card("ICT marks").getByText(/reached on your recent average/)).toBeInTheDocument();
    expect(card("ICT marks").queryByText(/points a month/)).toBeNull();
  });

  it("still shows the target for a subject with no papers yet", async () => {
    seed();
    await renderPage("progress");
    const physics = card("Physics marks");
    expect(physics.getByText(/No papers recorded yet/)).toBeInTheDocument();
    expect(physics.getByText("Target 78%")).toBeInTheDocument();
  });

  it("drops the monthly pace once the exam date has passed", async () => {
    seed();
    useStore.setState({ settings: { ...useStore.getState().settings, examDate: "2026-10-01" } });
    await renderPage("progress");
    const maths = card("Combined Maths marks");
    expect(maths.getByText(/28 points to go/)).toBeInTheDocument();
    expect(maths.queryByText(/points a month/)).toBeNull();
  });
});
