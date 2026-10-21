import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Today } from "@/components/Today";
import { Button } from "@/components/ui/button";
import { stagger } from "@/lib/motion";
import { useStore } from "@/lib/store";
import { at, dailyWindow, makeSettings, makeTask } from "./planner-fixtures";

const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

async function renderToday() {
  const root = createRootRoute({ component: () => <Today now={at(19, 16, 0)} /> });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { name: "Today" });
}

beforeEach(() => useStore.getState().reset());
afterEach(cleanup);

describe("motion rules (styles.css)", () => {
  it("switches animations and transitions off for people who ask for reduced motion", () => {
    const block =
      css.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(block).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
    expect(block).toMatch(/animation-delay:\s*0s\s*!important/);
    expect(block).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
  });

  it("only animates properties that don't cause layout (transform, opacity, the ring's dash)", () => {
    const keyframes = [...css.matchAll(/@keyframes (motion-[\w-]+) \{([\s\S]*?)\n\}/g)];
    expect(keyframes.length).toBeGreaterThan(0);
    for (const [, name, body] of keyframes) {
      const props = [...body!.matchAll(/([a-z-]+):\s*[^;]+;/g)].map((m) => m[1]);
      for (const p of props) {
        expect(["opacity", "transform", "stroke-dasharray"], `${name} animates ${p}`).toContain(p);
      }
    }
  });

  it("never loops: nothing in the motion system repeats forever", () => {
    const motion = css.slice(css.indexOf("Motion. Every animation"));
    expect(motion).not.toMatch(/infinite/);
  });

  it("stagger() sets the position the utilities turn into a delay", () => {
    expect(stagger(3)).toEqual({ "--i": 3 });
  });
});

describe("motion in the UI", () => {
  it("a started task is a new card that eases in, not an edit of the old one", async () => {
    useStore.setState({
      settings: makeSettings({ studyWindows: dailyWindow("16:00", "21:00") }),
      tasks: [makeTask({ id: "a", title: "Integration homework", estimateMin: 45 })],
    });
    await renderToday();
    const next = screen.getByRole("region", { name: "Next task" });
    expect(next.className).toContain("motion-rise");
    fireEvent.click(screen.getByRole("button", { name: /Start next task/ }));
    const active = await screen.findByRole("region", { name: "In progress" });
    expect(active.className).toContain("motion-rise");
    expect(active).not.toBe(next);
  });

  it("buttons give press feedback, except link-style ones", () => {
    render(
      <>
        <Button>Save</Button>
        <Button variant="link">More</Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "Save" }).className).toContain("active:scale-[0.97]");
    expect(screen.getByRole("button", { name: "More" }).className).toContain("active:scale-100");
  });
});
