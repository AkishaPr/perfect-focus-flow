import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProgressDashboard } from "@/components/ProgressDashboard";
import { exportData, useStore } from "@/lib/store";
import type { Mistake } from "@/lib/types";
import { at, makeTask } from "./planner-fixtures";

// Wednesday 21 Oct 2026, midday.
const NOW = at(21, 12, 0);

async function renderProgress() {
  const root = createRootRoute({ component: () => <ProgressDashboard now={NOW} /> });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { name: "Progress" });
}

const log = () => screen.getByRole("region", { name: "Mistake log" });
const mistake = (over: Partial<Mistake> = {}): Mistake => ({
  id: "x1",
  subject: "maths",
  topic: "Vectors",
  date: "2026-10-16",
  marksLost: 5,
  cause: "concept",
  ...over,
});

beforeEach(() => {
  useStore.getState().reset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("mistake store", () => {
  it("adds, replaces by id, and deletes", () => {
    const { upsertMistake, deleteMistake } = useStore.getState();
    upsertMistake(mistake());
    upsertMistake(mistake({ marksLost: 7 }));
    upsertMistake(mistake({ id: "x2", topic: "Series" }));
    expect(useStore.getState().mistakes.map((m) => [m.id, m.marksLost])).toEqual([
      ["x1", 7],
      ["x2", 5],
    ]);
    deleteMistake("x1");
    expect(useStore.getState().mistakes.map((m) => m.id)).toEqual(["x2"]);
  });

  it("is included in exports and cleared by reset", () => {
    useStore.getState().upsertMistake(mistake());
    expect(exportData().mistakes).toHaveLength(1);
    useStore.getState().reset();
    expect(useStore.getState().mistakes).toEqual([]);
  });
});

describe("Mistake log on the Progress page", () => {
  it("explains itself when empty", async () => {
    await renderProgress();
    expect(within(log()).getByText(/No mistakes logged yet/)).toBeInTheDocument();
    expect(within(log()).getByText(/extra priority/)).toBeInTheDocument();
  });

  it("logs a mistake through the dialog and shows the planner boost", async () => {
    await renderProgress();
    fireEvent.click(screen.getByRole("button", { name: /Log mistake/ }));
    const d = within(screen.getByRole("dialog", { name: "Log a mistake" }));

    expect(d.getByRole("button", { name: "Save" })).toBeDisabled();
    expect((d.getByLabelText("Date of the paper") as HTMLInputElement).value).toBe("2026-10-21");
    expect((d.getByLabelText("Marks lost") as HTMLInputElement).value).toBe(""); // not a silent 0

    fireEvent.change(d.getByLabelText("Subject"), { target: { value: "physics" } });
    fireEvent.change(d.getByLabelText("Topic"), { target: { value: "  Circular motion " } });
    fireEvent.change(d.getByLabelText("Marks lost"), { target: { value: "4" } });
    fireEvent.change(d.getByLabelText("Why"), { target: { value: "time" } });
    fireEvent.click(d.getByRole("button", { name: "Save" }));

    expect(useStore.getState().mistakes).toEqual([
      expect.objectContaining({
        subject: "physics",
        topic: "Circular motion",
        marksLost: 4,
        cause: "time",
        date: "2026-10-21",
      }),
    ]);
    expect(useStore.getState().mistakes[0]!.paperName).toBeUndefined();
    expect(screen.queryByRole("dialog")).toBeNull();

    const topics = within(
      within(log()).getByRole("list", { name: "Topics losing the most marks" }),
    );
    expect(topics.getByText("Circular motion")).toBeInTheDocument();
    expect(topics.getByText("planner boost")).toBeInTheDocument();
    expect(
      within(within(log()).getByRole("list", { name: "All mistakes" })).getByText(
        /Physics · Ran out of time/,
      ),
    ).toBeInTheDocument();
  });

  it("doesn't boost a topic that only lost marks to careless slips", async () => {
    useStore.setState({ mistakes: [mistake({ cause: "careless", marksLost: 9 })] });
    await renderProgress();
    const topics = within(
      within(log()).getByRole("list", { name: "Topics losing the most marks" }),
    );
    expect(topics.getByText("Vectors")).toBeInTheDocument();
    expect(topics.queryByText("planner boost")).toBeNull();
  });

  it("says nothing is recent when every mistake is old", async () => {
    useStore.setState({ mistakes: [mistake({ date: "2026-07-01" })] });
    await renderProgress();
    expect(within(log()).getByText(/Nothing logged in the last 4 weeks/)).toBeInTheDocument();
    // …but the entry is still in the full list.
    expect(within(log()).getByRole("list", { name: "All mistakes" })).toHaveTextContent("Vectors");
  });

  it("explains why a mistake can't be saved, but only after you've started typing", async () => {
    await renderProgress();
    fireEvent.click(screen.getByRole("button", { name: /Log mistake/ }));
    const d = within(screen.getByRole("dialog"));
    expect(d.queryByText(/Add the topic/)).toBeNull();

    fireEvent.change(d.getByLabelText("Paper (optional)"), { target: { value: "2024 P1" } });
    expect(d.getByText("Add the topic the question was about.")).toBeInTheDocument();
    fireEvent.change(d.getByLabelText("Topic"), { target: { value: "Vectors" } });
    expect(d.getByText("Enter how many marks you lost.")).toBeInTheDocument();
    fireEvent.change(d.getByLabelText("Marks lost"), { target: { value: "0" } });
    expect(d.getByText("Marks lost must be more than zero.")).toBeInTheDocument();
    expect(d.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.change(d.getByLabelText("Marks lost"), { target: { value: "2.5" } });
    expect(d.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("tells you careless slips don't boost a topic", async () => {
    await renderProgress();
    fireEvent.click(screen.getByRole("button", { name: /Log mistake/ }));
    const d = within(screen.getByRole("dialog"));
    fireEvent.change(d.getByLabelText("Why"), { target: { value: "careless" } });
    expect(d.getByText(/Careless slips don't make the planner boost/)).toBeInTheDocument();
  });

  it("suggests topics already used for the chosen subject, once each", async () => {
    useStore.setState({
      tasks: [
        makeTask({ id: "a", subject: "maths", topic: "Calculus" }),
        makeTask({ id: "b", subject: "physics", topic: "Optics" }),
      ],
      mistakes: [mistake({ topic: "calculus" }), mistake({ id: "x2", topic: "Vectors" })],
    });
    await renderProgress();
    fireEvent.click(screen.getByRole("button", { name: /Log mistake/ }));
    const options = Array.from(
      document.querySelectorAll("#mistake-topic-options option"),
      (o) => (o as HTMLOptionElement).value,
    );
    expect(options).toEqual(["Calculus", "Vectors"]);

    fireEvent.change(within(screen.getByRole("dialog")).getByLabelText("Subject"), {
      target: { value: "physics" },
    });
    expect(
      Array.from(
        document.querySelectorAll("#mistake-topic-options option"),
        (o) => (o as HTMLOptionElement).value,
      ),
    ).toEqual(["Optics"]);
  });

  it("edits a mistake", async () => {
    useStore.setState({ mistakes: [mistake({ paperName: "2024 P1", note: "Draw it" })] });
    await renderProgress();
    fireEvent.click(screen.getByRole("button", { name: "Edit mistake: Vectors" }));
    const d = within(screen.getByRole("dialog", { name: "Edit mistake" }));
    expect((d.getByLabelText("Marks lost") as HTMLInputElement).value).toBe("5");
    expect((d.getByLabelText("Paper (optional)") as HTMLInputElement).value).toBe("2024 P1");
    fireEvent.change(d.getByLabelText("Marks lost"), { target: { value: "6" } });
    fireEvent.click(d.getByRole("button", { name: "Save" }));
    expect(useStore.getState().mistakes).toEqual([
      expect.objectContaining({ id: "x1", marksLost: 6, paperName: "2024 P1", note: "Draw it" }),
    ]);
  });

  it("deletes a mistake after confirming, and keeps it if you decline", async () => {
    useStore.setState({ mistakes: [mistake()] });
    await renderProgress();
    fireEvent.click(screen.getByRole("button", { name: "Edit mistake: Vectors" }));
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Delete/ }));
    expect(confirm).toHaveBeenCalled();
    expect(useStore.getState().mistakes).toHaveLength(1);

    confirm.mockReturnValueOnce(true);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Delete/ }));
    expect(useStore.getState().mistakes).toEqual([]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("offers no Delete when logging a new mistake", async () => {
    await renderProgress();
    fireEvent.click(screen.getByRole("button", { name: /Log mistake/ }));
    expect(within(screen.getByRole("dialog")).queryByRole("button", { name: /Delete/ })).toBeNull();
  });

  it("shows the latest eight and offers the rest", async () => {
    useStore.setState({
      mistakes: Array.from({ length: 10 }, (_, i) =>
        mistake({ id: `m${i}`, topic: `Topic ${i}`, date: `2026-10-${10 + i}` }),
      ),
    });
    await renderProgress();
    const list = () => within(log()).getByRole("list", { name: "All mistakes" });
    expect(within(list()).getAllByRole("listitem")).toHaveLength(8);
    fireEvent.click(screen.getByRole("button", { name: "Show all 10" }));
    expect(within(list()).getAllByRole("listitem")).toHaveLength(10);
  });
});
