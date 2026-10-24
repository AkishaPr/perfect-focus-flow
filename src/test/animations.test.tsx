import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CheckTick } from "@/components/CheckTick";
import { AnimatedClock } from "@/components/AnimatedClock";
import { ProgressRing } from "@/components/ProgressRing";
import { Recovery } from "@/components/Recovery";
import { SparkleBurst } from "@/components/SparkleBurst";
import { Today } from "@/components/Today";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { useLinger } from "@/hooks/use-linger";
import { useStore } from "@/lib/store";
import { at, dailyWindow, makeSession, makeSettings, makeTask } from "./planner-fixtures";

const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

afterEach(cleanup);

describe("motion rules for the newer animations (styles.css)", () => {
  it("the only animation that repeats is the missed-work pulse, and it stops after two", () => {
    const utilities = [...css.matchAll(/@utility (motion-[\w-]+) \{([\s\S]*?)\n\}/g)];
    const repeating = utilities.filter(([, , body]) => /animation:[^;]*\s\d+\s/.test(body!));
    expect(repeating.map(([, name]) => name)).toEqual(["motion-pulse"]);
    expect(css).toMatch(/animation: motion-pulse 1600ms ease-out 400ms 2 both/);
  });

  it("everything that ends invisible says so explicitly, so nothing is left on screen", () => {
    for (const name of ["motion-sheen", "motion-flash", "motion-spark", "motion-pulse"]) {
      const body = css.match(new RegExp(`@utility ${name} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "";
      expect(body, name).toMatch(/\bboth\b/);
    }
  });
});

describe("AnimatedClock", () => {
  it("reads exactly as the clock text and plays nothing on first paint", () => {
    const { container } = render(
      <div role="timer">
        <AnimatedClock text="45:00" />
      </div>,
    );
    expect(screen.getByRole("timer").textContent).toBe("45:00");
    expect(container.querySelectorAll(".motion-digit")).toHaveLength(0);
  });

  it("settles only the digits that changed", async () => {
    const { container, rerender } = render(
      <div role="timer">
        <AnimatedClock text="44:59" />
      </div>,
    );
    await act(async () => {}); // let the clock arm itself after its first paint
    rerender(
      <div role="timer">
        <AnimatedClock text="44:58" />
      </div>,
    );
    const moving = [...container.querySelectorAll(".motion-digit")].map((e) => e.textContent);
    expect(moving).toEqual(["8"]);
    expect(screen.getByRole("timer").textContent).toBe("44:58");
  });

  it("keeps the places aligned from the right when the clock gets shorter", async () => {
    const { container, rerender } = render(
      <div role="timer">
        <AnimatedClock text="10:00" />
      </div>,
    );
    await act(async () => {});
    rerender(
      <div role="timer">
        <AnimatedClock text="9:59" />
      </div>,
    );
    expect(screen.getByRole("timer").textContent).toBe("9:59");
    expect(container.querySelectorAll(".motion-digit").length).toBeGreaterThan(0);
  });
});

describe("small pieces", () => {
  it("CheckTick draws itself: a measured path with the tick animation", () => {
    const { container } = render(<CheckTick />);
    const path = container.querySelector("path")!;
    expect(path.getAttribute("pathLength")).toBe("20");
    expect(path.getAttribute("stroke-dasharray")).toBe("20 20");
    expect(path.getAttribute("class")).toContain("motion-tick");
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("a checked checkbox shows the drawing tick, an unchecked one shows nothing", () => {
    const { container, rerender } = render(<Checkbox checked={false} aria-label="done" />);
    expect(container.querySelector(".motion-tick")).toBeNull();
    rerender(<Checkbox checked aria-label="done" />);
    expect(container.querySelector(".motion-tick")).not.toBeNull();
  });

  it("SparkleBurst makes the requested number of sparks, each with its own direction", () => {
    const { container } = render(
      <div className="relative">
        <SparkleBurst count={6} radius={20} />
      </div>,
    );
    const sparks = [...container.querySelectorAll<HTMLElement>(".motion-spark")];
    expect(sparks).toHaveLength(6);
    const directions = new Set(
      sparks.map((s) => `${s.style.getPropertyValue("--dx")}|${s.style.getPropertyValue("--dy")}`),
    );
    expect(directions.size).toBe(6);
    expect(container.querySelector("[data-sparkle]")).toHaveAttribute("aria-hidden", "true");
  });

  it("ProgressRing fills to the share it is given and keeps itself out of the reading order", () => {
    const { container } = render(<ProgressRing pct={0.5} />);
    const circumference = 2 * Math.PI * 54;
    const [filled] = container
      .querySelector("[data-ring]")!
      .getAttribute("stroke-dasharray")!
      .split(" ");
    expect(Number(filled) / circumference).toBeCloseTo(0.5, 3);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("ProgressRing clamps, and an empty ring has no stray dot at the top", () => {
    const over = render(<ProgressRing pct={3} />);
    const circumference = 2 * Math.PI * 54;
    const [filled] = over.container
      .querySelector("[data-ring]")!
      .getAttribute("stroke-dasharray")!
      .split(" ");
    expect(Number(filled)).toBeCloseTo(circumference, 3);
    cleanup();
    const empty = render(<ProgressRing pct={0} />);
    expect(empty.container.querySelector("[data-ring]")).toHaveAttribute("stroke-linecap", "butt");
  });

  it("a progress bar gets its sheen only when asked", () => {
    const { container, rerender } = render(<Progress value={100} />);
    expect(container.querySelector("[data-sheen]")).toBeNull();
    rerender(<Progress value={100} sheen />);
    expect(container.querySelector("[data-sheen]")).not.toBeNull();
    expect(container.querySelector("[data-sheen]")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("useLinger", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("holds an id for the time given, then lets go by itself", () => {
    const { result } = renderHook(() => useLinger(1000));
    act(() => result.current.hold("a"));
    expect(result.current.held.has("a")).toBe(true);
    act(() => void vi.advanceTimersByTime(999));
    expect(result.current.held.has("a")).toBe(true);
    act(() => void vi.advanceTimersByTime(2));
    expect(result.current.held.has("a")).toBe(false);
  });

  it("lets go at once when asked, and holding again restarts the time", () => {
    const { result } = renderHook(() => useLinger(1000));
    act(() => result.current.hold("a"));
    act(() => result.current.release("a"));
    expect(result.current.held.has("a")).toBe(false);

    act(() => result.current.hold("a"));
    act(() => void vi.advanceTimersByTime(800));
    act(() => result.current.hold("a"));
    act(() => void vi.advanceTimersByTime(800));
    expect(result.current.held.has("a")).toBe(true);
    act(() => void vi.advanceTimersByTime(300));
    expect(result.current.held.has("a")).toBe(false);
  });

  it("leaves no timers behind when the page goes away", () => {
    const { result, unmount } = renderHook(() => useLinger(1000));
    act(() => result.current.hold("a"));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("missed-work reminder", () => {
  const item = {
    task: makeTask({ id: "a", title: "Integration homework" }),
    days: ["2026-10-18"],
    plannedMin: 60,
    studiedMin: 0,
    stuck: false,
  };

  it("pulses gently around the card when it appears", () => {
    const { container } = render(
      <Recovery items={[item]} onResolve={() => {}} onEdit={() => {}} />,
    );
    const pulse = container.querySelector("[data-pulse]");
    expect(pulse).not.toBeNull();
    expect(pulse?.className).toContain("motion-pulse");
    expect(pulse).toHaveAttribute("aria-hidden", "true");
  });

  it("shows nothing at all when nothing was missed", () => {
    const { container } = render(<Recovery items={[]} onResolve={() => {}} onEdit={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("Today's daily ring", () => {
  const NOW = at(19, 16, 0);
  async function renderToday() {
    const root = createRootRoute({ component: () => <Today now={NOW} /> });
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    const view = render(<RouterProvider router={router} />);
    await screen.findByRole("heading", { name: "Today" });
    return view;
  }
  const seed = (min: number) =>
    useStore.setState({
      settings: makeSettings({ studyWindows: dailyWindow("16:00", "21:00"), dailyGoalMin: 240 }),
      tasks: [makeTask({ id: "a", title: "Integration homework" })],
      sessions: [
        makeSession({
          id: "s1",
          taskId: "a",
          start: at(19, 10, 0).toISOString(),
          end: at(19, 11, 0).toISOString(),
          actualMin: min,
        }),
      ],
    });
  beforeEach(() => useStore.getState().reset());

  it("fills as far as the day's goal has been met", async () => {
    seed(120);
    const { container } = await renderToday();
    const ring = container.querySelector("[data-ring]")!;
    const circumference = 2 * Math.PI * 54;
    const [filled] = ring.getAttribute("stroke-dasharray")!.split(" ");
    expect(Number(filled) / circumference).toBeCloseTo(0.5, 2);
    expect(ring.getAttribute("class")).not.toContain("stroke-success");
  });

  it("turns green with a check once the goal is met", async () => {
    seed(250);
    const { container } = await renderToday();
    expect(container.querySelector("[data-ring]")!.getAttribute("class")).toContain(
      "stroke-success",
    );
  });
});
