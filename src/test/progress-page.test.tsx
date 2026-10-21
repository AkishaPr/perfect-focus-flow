import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProgressDashboard } from "@/components/ProgressDashboard";
import { useStore } from "@/lib/store";
import type { Session } from "@/lib/types";
import {
  at,
  makeBlock,
  makeGoal,
  makeMark,
  makeSession,
  makeSettings,
  makeTask,
} from "./planner-fixtures";

// Wednesday 21 Oct 2026, midday. The week is Mon 19 – Sun 25 Oct.
const NOW = at(21, 12, 0);

async function renderProgress(now = NOW) {
  const root = createRootRoute({ component: () => <ProgressDashboard now={now} /> });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { name: "Progress" });
}

const session = (id: string, taskId: string, when: Date, actualMin: number): Session =>
  makeSession({
    id,
    taskId,
    start: when.toISOString(),
    end: new Date(when.getTime() + actualMin * 60_000).toISOString(),
    actualMin,
  });

const seedStudy = () =>
  useStore.setState({
    settings: makeSettings({ weeklyGoalMin: 1800, dailyGoalMin: 240 }),
    tasks: [
      makeTask({ id: "m", subject: "maths" }),
      makeTask({ id: "p", subject: "physics" }),
      makeTask({ id: "i", subject: "ict" }),
    ],
    sessions: [
      session("s1", "m", at(19, 16), 120), // Mon
      session("s2", "p", at(20, 16), 60), // Tue
      session("s3", "i", at(21, 9), 50), // Wed
      session("old", "m", at(14, 16), 90), // the Wednesday of last week… no: Wed 14 Oct
    ],
  });

const studySection = () => screen.getByRole("region", { name: "Study time" });
const workSection = () => screen.getByRole("region", { name: "Completed and missed work" });
const marksSection = () => screen.getByRole("region", { name: "Paper marks" });

beforeEach(() => {
  useStore.getState().reset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("study time", () => {
  it("shows the week's total against the goal, and how many days were studied", async () => {
    seedStudy();
    await renderProgress();
    expect(screen.getByTestId("week-total")).toHaveTextContent("3h 50m"); // 120 + 60 + 50
    expect(within(studySection()).getByText(/13% of your 30h weekly goal/)).toBeInTheDocument();
    expect(
      within(studySection()).getByRole("progressbar", { name: /weekly study goal/ }),
    ).toBeInTheDocument();
    expect(within(studySection()).getByText("3 of 3 so far")).toBeInTheDocument();
  });

  it("compares with the previous week", async () => {
    seedStudy();
    await renderProgress();
    // 230 this week vs 90 the week before
    expect(within(studySection()).getByText("+2h 20m")).toBeInTheDocument();
  });

  it("gives each day its own value, and says 'not yet' for days to come", async () => {
    seedStudy();
    await renderProgress();
    const days = within(screen.getByRole("list", { name: "Study time per day" }));
    expect(days.getByLabelText(/^Monday.*: 2h$/)).toBeInTheDocument();
    expect(days.getByLabelText(/^Tuesday.*: 1h$/)).toBeInTheDocument();
    expect(days.getByLabelText(/^Wednesday.*: 50 min$/)).toBeInTheDocument();
    expect(days.getByLabelText(/^Thursday.*: not yet$/)).toBeInTheDocument();
    expect(days.getByLabelText(/^Sunday.*: not yet$/)).toBeInTheDocument();
  });

  it("splits the week by subject", async () => {
    seedStudy();
    await renderProgress();
    const s = within(studySection());
    expect(s.getByText("2h · 52%")).toBeInTheDocument(); // maths 120 of 230
    expect(s.getByText("1h · 26%")).toBeInTheDocument(); // physics 60
    expect(s.getByText("50 min · 22%")).toBeInTheDocument(); // ICT 50
  });

  it("keeps time on a deleted task visible instead of dropping it", async () => {
    seedStudy();
    useStore.setState((st) => ({
      sessions: [...st.sessions, session("g", "gone", at(20, 18), 30)],
    }));
    await renderProgress();
    expect(screen.getByTestId("week-total")).toHaveTextContent("4h 20m");
    expect(within(studySection()).getByText("Deleted tasks")).toBeInTheDocument();
    expect(within(studySection()).getByText("30 min · 12%")).toBeInTheDocument();
  });

  it("counts a timed block once", async () => {
    useStore.setState({
      settings: makeSettings(),
      tasks: [makeTask({ id: "m", subject: "maths" })],
      blocks: [
        makeBlock({
          id: "b",
          taskId: "m",
          date: "2026-10-19",
          start: "16:00",
          end: "17:10",
          status: "done",
        }),
      ],
      sessions: [{ ...session("s", "m", at(19, 16), 55), blockId: "b" }],
    });
    await renderProgress();
    expect(screen.getByTestId("week-total")).toHaveTextContent("55 min");
  });

  it("lists the last six weeks, highlighting the one being viewed", async () => {
    seedStudy();
    await renderProgress();
    const weeks = within(screen.getByRole("list", { name: "Study time per week" }));
    expect(weeks.getAllByRole("listitem")).toHaveLength(6);
    expect(weeks.getByLabelText(/Week of .*19.*: 3h 50m \(selected\)/)).toBeInTheDocument();
  });

  it("points a brand new user to the timer", async () => {
    await renderProgress();
    expect(screen.getByTestId("week-total")).toHaveTextContent("0 min");
    expect(
      within(studySection()).getByRole("link", { name: "Start a focus session" }),
    ).toHaveAttribute("href", "/focus");
    expect(within(studySection()).getByText("No study logged this week.")).toBeInTheDocument();
  });
});

describe("week navigation", () => {
  it("steps back to an earlier week and returns", async () => {
    seedStudy();
    await renderProgress();
    expect(screen.getByRole("button", { name: "Next week" })).toBeDisabled();
    expect(screen.getByText(/^This week · /)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    expect(screen.getByTestId("week-total")).toHaveTextContent("1h 30m"); // the 90 min last week
    expect(screen.queryByText(/^This week · /)).toBeNull();
    expect(within(studySection()).getByText("Studied that week")).toBeInTheDocument();
    expect(within(studySection()).getByText("1 of 7")).toBeInTheDocument(); // a finished week
    expect(screen.getByRole("button", { name: "Next week" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(screen.getByTestId("week-total")).toHaveTextContent("3h 50m");
    expect(screen.getByRole("button", { name: "Next week" })).toBeDisabled();
  });

  it("jumps straight back to this week", async () => {
    seedStudy();
    await renderProgress();
    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    fireEvent.click(screen.getByRole("button", { name: "This week" }));
    expect(screen.getByTestId("week-total")).toHaveTextContent("3h 50m");
    expect(screen.queryByRole("button", { name: "This week" })).toBeNull();
  });
});

describe("completed and missed work", () => {
  const seedWork = () =>
    useStore.setState({
      tasks: [
        makeTask({
          id: "a",
          status: "done",
          type: "homework",
          completedAt: at(20, 10).toISOString(),
          deadline: "2026-10-21",
          goalId: "g",
        }),
        makeTask({
          id: "b",
          status: "done",
          type: "paper",
          completedAt: at(21, 8).toISOString(),
          deadline: "2026-10-20",
          goalId: "g",
        }),
        makeTask({
          id: "c",
          status: "done",
          type: "homework",
          completedAt: at(14, 8).toISOString(),
        }), // last week
        makeTask({ id: "late", deadline: "2026-10-19" }),
        makeTask({ id: "stuck", status: "missed", carryOverCount: 3 }),
      ],
      goals: [
        makeGoal({ id: "g", title: "Finish integration set", weekStart: "2026-10-19", target: 4 }),
      ],
      blocks: [
        makeBlock({ id: "mb", date: "2026-10-20", start: "16:00", end: "16:45", status: "missed" }),
      ],
    });

  it("counts finished tasks by type and on-time finishing", async () => {
    seedWork();
    await renderProgress();
    expect(screen.getByTestId("week-done")).toHaveTextContent("2 tasks");
    const w = within(workSection());
    expect(w.getByText("homework · 1")).toBeInTheDocument();
    expect(w.getByText("paper · 1")).toBeInTheDocument();
    expect(w.getByText(/1 of 2 with a deadline/)).toBeInTheDocument(); // b was a day late
    expect(w.getByText(/1 pinned block missed \(45 min\)/)).toBeInTheDocument();
  });

  it("shows this week's goals with their progress", async () => {
    seedWork();
    await renderProgress();
    const w = within(workSection());
    expect(w.getByText("Finish integration set")).toBeInTheDocument();
    expect(w.getByText("2 of 4")).toBeInTheDocument();
    expect(
      w.getByRole("progressbar", { name: "Progress on Finish integration set" }),
    ).toBeInTheDocument();
  });

  it("shows what needs attention right now", async () => {
    seedWork();
    await renderProgress();
    const tile = (label: string) => screen.getByText(label, { selector: "dt" }).nextElementSibling;
    expect(tile("Open")?.textContent).toBe("2");
    expect(tile("Overdue")?.textContent).toBe("1");
    expect(tile("Missed")?.textContent).toBe("1");
    expect(tile("Stuck")?.textContent).toBe("1");
  });

  it("follows the week being viewed, but 'right now' does not move", async () => {
    seedWork();
    await renderProgress();
    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    expect(screen.getByTestId("week-done")).toHaveTextContent("1 task");
    expect(within(workSection()).queryByText(/pinned block missed/)).toBeNull();
    expect(screen.getByText("Overdue", { selector: "dt" }).nextElementSibling?.textContent).toBe(
      "1",
    );
  });

  it("explains an empty week and offers a way to set a goal", async () => {
    await renderProgress();
    expect(screen.getByTestId("week-done")).toHaveTextContent("0 tasks");
    expect(within(workSection()).getByRole("link", { name: "Set one" })).toHaveAttribute(
      "href",
      "/goals",
    );
  });
});

describe("paper marks", () => {
  it("starts with an explanation of why to add marks", async () => {
    await renderProgress();
    expect(within(marksSection()).getByText(/No paper marks yet/)).toBeInTheDocument();
    expect(within(marksSection()).getByText(/extra priority/)).toBeInTheDocument();
  });

  it("adds a mark through the dialog", async () => {
    await renderProgress();
    fireEvent.click(screen.getByRole("button", { name: /Add mark/ }));
    const dialog = screen.getByRole("dialog", { name: "Add paper mark" });
    const d = within(dialog);

    expect(d.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.change(d.getByLabelText("Subject"), { target: { value: "physics" } });
    fireEvent.change(d.getByLabelText("Paper"), { target: { value: "  2024 Paper I  " } });
    fireEvent.change(d.getByLabelText("Date sat"), { target: { value: "2026-10-12" } });
    fireEvent.change(d.getByLabelText("Your score"), { target: { value: "45" } });
    fireEvent.change(d.getByLabelText("Out of"), { target: { value: "60" } });
    expect(d.getByText("75%")).toBeInTheDocument(); // live preview
    fireEvent.click(d.getByRole("button", { name: "Save" }));

    expect(useStore.getState().marks).toEqual([
      expect.objectContaining({
        subject: "physics",
        paperName: "2024 Paper I",
        date: "2026-10-12",
        score: 45,
        max: 60,
      }),
    ]);
    expect(screen.queryByRole("dialog")).toBeNull();
    const card = within(screen.getByRole("article", { name: "Physics marks" }));
    expect(card.getByText("75%")).toBeInTheDocument();
    expect(card.getByText(/latest · 1 paper/)).toBeInTheDocument();
    expect(
      within(screen.getByRole("list", { name: "All paper marks" })).getByText("2024 Paper I"),
    ).toBeInTheDocument();
  });

  it("defaults a new mark to today's date, out of 100", async () => {
    await renderProgress();
    fireEvent.click(screen.getByRole("button", { name: /Add mark/ }));
    const d = within(screen.getByRole("dialog"));
    expect((d.getByLabelText("Date sat") as HTMLInputElement).value).toBe("2026-10-21");
    expect((d.getByLabelText("Out of") as HTMLInputElement).value).toBe("100");
    expect((d.getByLabelText("Your score") as HTMLInputElement).value).toBe(""); // not a silent 0
  });

  it("explains why a mark can't be saved, but only after you've started typing", async () => {
    await renderProgress();
    fireEvent.click(screen.getByRole("button", { name: /Add mark/ }));
    const d = within(screen.getByRole("dialog"));
    expect(d.queryByText(/Add the paper's name/)).toBeNull();

    fireEvent.change(d.getByLabelText("Subject"), { target: { value: "ict" } });
    expect(d.getByText("Add the paper's name.")).toBeInTheDocument();

    fireEvent.change(d.getByLabelText("Paper"), { target: { value: "Mock" } });
    expect(d.getByText("Enter your score.")).toBeInTheDocument();
    fireEvent.change(d.getByLabelText("Your score"), { target: { value: "130" } });
    expect(d.getByText("Score can't be more than the total.")).toBeInTheDocument();
    expect(d.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.change(d.getByLabelText("Your score"), { target: { value: "-4" } });
    expect(d.getByText("Score can't be negative.")).toBeInTheDocument();
    fireEvent.change(d.getByLabelText("Out of"), { target: { value: "0" } });
    expect(d.getByText("Enter what the paper was marked out of.")).toBeInTheDocument();
    fireEvent.change(d.getByLabelText("Date sat"), { target: { value: "" } });
    expect(d.getByText("Pick the date you sat the paper.")).toBeInTheDocument();
    expect(useStore.getState().marks).toEqual([]);
  });

  it("cancel adds nothing", async () => {
    await renderProgress();
    fireEvent.click(screen.getByRole("button", { name: /Add mark/ }));
    fireEvent.change(within(screen.getByRole("dialog")).getByLabelText("Paper"), {
      target: { value: "x" },
    });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(useStore.getState().marks).toEqual([]);
  });

  it("edits an existing mark in place", async () => {
    useStore.setState({
      marks: [
        makeMark({
          id: "m1",
          subject: "maths",
          paperName: "Term 1",
          date: "2026-09-01",
          score: 50,
          max: 100,
        }),
      ],
    });
    await renderProgress();
    fireEvent.click(screen.getByRole("button", { name: "Edit mark: Term 1" }));
    const d = within(screen.getByRole("dialog", { name: "Edit paper mark" }));
    expect((d.getByLabelText("Your score") as HTMLInputElement).value).toBe("50");
    fireEvent.change(d.getByLabelText("Your score"), { target: { value: "58.5" } });
    fireEvent.click(d.getByRole("button", { name: "Save" }));
    expect(useStore.getState().marks).toHaveLength(1);
    expect(useStore.getState().marks[0]).toMatchObject({ id: "m1", score: 58.5 });
    expect(
      within(screen.getByRole("article", { name: "Combined Maths marks" })).getByText("58.5%"),
    ).toBeInTheDocument();
  });

  it("deletes a mark after confirming, and keeps it if you decline", async () => {
    useStore.setState({ marks: [makeMark({ id: "m1", paperName: "Term 1" })] });
    await renderProgress();
    fireEvent.click(screen.getByRole("button", { name: "Edit mark: Term 1" }));
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Delete/ }));
    expect(confirm).toHaveBeenCalled();
    expect(useStore.getState().marks).toHaveLength(1);

    confirm.mockReturnValueOnce(true);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Delete/ }));
    expect(useStore.getState().marks).toEqual([]);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText(/No paper marks yet/)).toBeInTheDocument();
  });

  it("offers no Delete when adding", async () => {
    await renderProgress();
    fireEvent.click(screen.getByRole("button", { name: /Add mark/ }));
    expect(within(screen.getByRole("dialog")).queryByRole("button", { name: /Delete/ })).toBeNull();
  });

  describe("per subject", () => {
    const seedMarks = () =>
      useStore.setState({
        marks: [
          makeMark({ id: "m1", subject: "maths", date: "2026-09-01", score: 60, paperName: "M1" }),
          makeMark({ id: "m2", subject: "maths", date: "2026-10-01", score: 80, paperName: "M2" }),
          makeMark({
            id: "p1",
            subject: "physics",
            date: "2026-10-02",
            score: 50,
            paperName: "P1",
          }),
        ],
      });

    it("shows latest, recent average, best and the change since the previous paper", async () => {
      seedMarks();
      await renderProgress();
      const maths = within(screen.getByRole("article", { name: "Combined Maths marks" }));
      expect(maths.getByText("80%")).toBeInTheDocument();
      expect(maths.getByText(/latest · 2 papers · best 80%/)).toBeInTheDocument();
      expect(maths.getByText("70%")).toBeInTheDocument(); // average of 60 and 80
      expect(maths.getByText(/Average of last 2/)).toBeInTheDocument();
      expect(maths.getByText(/up 20 points since the previous paper/)).toBeInTheDocument();
    });

    it("says plainly when the planner is boosting a weaker subject, and why", async () => {
      seedMarks();
      await renderProgress();
      const physics = within(screen.getByRole("article", { name: "Physics marks" }));
      expect(physics.getByText(/20 points behind your strongest subject/)).toBeInTheDocument();
      expect(physics.getByText(/planner gives Physics tasks extra priority/)).toBeInTheDocument();
      const maths = within(screen.getByRole("article", { name: "Combined Maths marks" }));
      expect(maths.queryByText(/extra priority/)).toBeNull();
    });

    it("shows an average only when there is more than one paper to average", async () => {
      seedMarks();
      await renderProgress();
      const physics = within(screen.getByRole("article", { name: "Physics marks" }));
      expect(physics.queryByText(/Average of last/)).toBeNull(); // one paper: it would repeat the latest
      const maths = within(screen.getByRole("article", { name: "Combined Maths marks" }));
      expect(maths.getByText(/Average of last 2/)).toBeInTheDocument();
    });

    it("has a card for a subject with no marks yet", async () => {
      seedMarks();
      await renderProgress();
      const ict = within(screen.getByRole("article", { name: "ICT marks" }));
      expect(ict.getByText("No papers recorded yet.")).toBeInTheDocument();
    });

    it("explains that two subjects are needed before the planner can compare", async () => {
      useStore.setState({ marks: [makeMark({ id: "a", subject: "maths" })] });
      await renderProgress();
      expect(within(marksSection()).getByText(/at least two subjects/)).toBeInTheDocument();
      expect(within(marksSection()).queryByText(/extra priority/)).toBeNull();
    });

    it("describes the trend chart in words", async () => {
      seedMarks();
      await renderProgress();
      const chart = screen.getByRole("img", { name: /Paper marks over time/ });
      expect(chart).toHaveAccessibleName(/Combined Maths: 2 papers, latest 80%/);
      expect(chart).toHaveAccessibleName(/Physics: 1 paper, latest 50%/);
      expect(chart.querySelectorAll("circle")).toHaveLength(3);
      const lines = chart.querySelectorAll("path[data-line]");
      expect(lines).toHaveLength(1); // only maths has two points
      expect(lines[0]).toHaveAttribute("data-line", "maths");
      expect(lines[0]!.getAttribute("d")).toMatch(/^M[\d.,-]+C/); // a curve, not straight segments
    });
  });

  it("shows the newest marks first and the rest on request", async () => {
    useStore.setState({
      marks: Array.from({ length: 10 }, (_, i) =>
        makeMark({
          id: `m${String(i).padStart(2, "0")}`,
          paperName: `Paper ${i}`,
          date: `2026-09-${String(i + 1).padStart(2, "0")}`,
        }),
      ),
    });
    await renderProgress();
    const list = () => within(screen.getByRole("list", { name: "All paper marks" }));
    expect(list().getAllByRole("listitem")).toHaveLength(8);
    expect(list().getAllByRole("listitem")[0]).toHaveTextContent("Paper 9");
    expect(list().queryByText("Paper 0")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show all 10" }));
    expect(list().getAllByRole("listitem")).toHaveLength(10);
    fireEvent.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(list().getAllByRole("listitem")).toHaveLength(8);
  });

  it("never offers 'show all' for a short list", async () => {
    useStore.setState({ marks: [makeMark({ id: "a" })] });
    await renderProgress();
    expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
  });
});
