import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LINGER_MS } from "@/lib/motion";
import { useStore } from "@/lib/store";
import { Route } from "@/routes/tasks";
import { makeTask } from "./planner-fixtures";

async function renderTasks() {
  const Page = Route.options.component!;
  const root = createRootRoute({ component: Page });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const view = render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { name: "Tasks" });
  return view;
}

beforeEach(() => {
  useStore.getState().reset();
  useStore.setState({
    tasks: [
      makeTask({ id: "a", title: "Integration homework", status: "todo" }),
      makeTask({ id: "b", title: "Waves past paper", status: "done" }),
    ],
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ticking a task off", () => {
  it("rewards the click: the tick draws, sparks leave the circle and the row warms up", async () => {
    const { container } = await renderTasks();
    expect(container.querySelector(".motion-tick")).toBeNull();
    expect(container.querySelector("[data-task-flash]")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Mark done" }));

    expect(useStore.getState().tasks.find((t) => t.id === "a")?.status).toBe("done");
    expect(container.querySelector(".motion-tick")).not.toBeNull();
    expect(container.querySelector("[data-task-flash]")).not.toBeNull();
    expect(container.querySelectorAll("[data-sparkle] .motion-spark")).toHaveLength(7);
  });

  it("keeps the row on screen long enough to see it, then lets it leave the Open view", async () => {
    await renderTasks();
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Mark done" }));
    expect(screen.getByText("Integration homework")).toBeInTheDocument();

    act(() => void vi.advanceTimersByTime(LINGER_MS - 50));
    expect(screen.getByText("Integration homework")).toBeInTheDocument();

    act(() => void vi.advanceTimersByTime(100));
    expect(screen.queryByText("Integration homework")).toBeNull();
  });

  it("undoing it straight away takes the reward away and the task stays open", async () => {
    const { container } = await renderTasks();
    fireEvent.click(screen.getByRole("button", { name: "Mark done" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark not done" }));
    expect(useStore.getState().tasks.find((t) => t.id === "a")?.status).toBe("todo");
    expect(container.querySelector("[data-task-flash]")).toBeNull();
    expect(container.querySelector("[data-sparkle]")).toBeNull();
    expect(screen.getByText("Integration homework")).toBeInTheDocument();
  });

  it("a task that is already done gets no reward just for being shown, or for being un-ticked", async () => {
    const { container } = await renderTasks();
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "" } }); // All
    expect(screen.getByText("Waves past paper")).toBeInTheDocument();
    expect(container.querySelector("[data-task-flash]")).toBeNull();
    expect(container.querySelector("[data-sparkle]")).toBeNull();

    // Only done tasks have the draw-in tick, and it belongs to the moment of ticking.
    fireEvent.click(screen.getByRole("button", { name: "Mark not done" }));
    expect(container.querySelector("[data-task-flash]")).toBeNull();
    expect(container.querySelector("[data-sparkle]")).toBeNull();
  });

  it("ticking again plays the reward again", async () => {
    const { container } = await renderTasks();
    fireEvent.click(screen.getByRole("button", { name: "Mark done" }));
    const first = container.querySelector("[data-task-flash]");
    fireEvent.click(screen.getByRole("button", { name: "Mark not done" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark done" }));
    const second = container.querySelector("[data-task-flash]");
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
  });

  it("rows arrive in a short stagger that never makes a long list wait", async () => {
    useStore.setState({
      tasks: Array.from({ length: 14 }, (_, i) =>
        makeTask({
          id: `t${i}`,
          title: `Task ${i}`,
          status: "todo",
          deadline: `2026-11-${String(i + 1).padStart(2, "0")}`,
        }),
      ),
    });
    const { container } = await renderTasks();
    const rows = [...container.querySelectorAll<HTMLElement>("ul > li")];
    expect(rows).toHaveLength(14);
    expect(rows[0]!.style.getPropertyValue("--i")).toBe("0");
    expect(rows[13]!.style.getPropertyValue("--i")).toBe("8"); // capped
  });
});
