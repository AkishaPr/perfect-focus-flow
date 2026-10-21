import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/AppShell";
import { useStore } from "@/lib/store";

/** jsdom has no layout, so give the sidebar and its links the positions a browser would. */
const TOP: Record<string, number> = { "/": 100, "/week": 144, "/tasks": 188, "/settings": 700 };
function rect(left: number, top: number, width: number, height: number) {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON() {},
  } as DOMRect;
}

async function renderShell() {
  const root = createRootRoute({
    component: () => (
      <AppShell>
        <Outlet />
      </AppShell>
    ),
  });
  const page = (path: string) =>
    createRoute({ getParentRoute: () => root, path, component: () => <p>page {path}</p> });
  const router = createRouter({
    routeTree: root.addChildren([page("/"), page("/week"), page("/tasks"), page("/settings")]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByText("page /");
  return router;
}

beforeEach(() => {
  useStore.getState().reset();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.tagName === "ASIDE") return rect(0, 0, 240, 800);
    if (this.tagName === "A") return rect(16, TOP[this.getAttribute("href") ?? ""] ?? 0, 208, 40);
    return rect(0, 0, 0, 0);
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const highlight = () => document.querySelector<HTMLElement>("[data-nav-highlight]");

describe("sidebar selection", () => {
  it("sits behind the current page's link", async () => {
    await renderShell();
    const pill = await waitFor(() => {
      const el = highlight();
      expect(el).not.toBeNull();
      return el!;
    });
    expect(pill.style.transform).toBe("translate(16px, 100px)");
    expect(pill.style.width).toBe("208px");
    expect(pill.style.height).toBe("40px");
    expect(pill).toHaveAttribute("aria-hidden", "true");
  });

  it("slides to the next link instead of vanishing and reappearing", async () => {
    const router = await renderShell();
    const pill = await waitFor(() => {
      const el = highlight();
      expect(el).not.toBeNull();
      return el!;
    });

    await act(async () => {
      await router.navigate({ to: "/week" });
    });
    await waitFor(() => expect(highlight()!.style.transform).toBe("translate(16px, 144px)"));
    expect(highlight()).toBe(pill); // the same element moved: a transition, not a swap

    await act(async () => {
      await router.navigate({ to: "/settings" });
    });
    await waitFor(() => expect(highlight()!.style.transform).toBe("translate(16px, 700px)"));
    expect(highlight()).toBe(pill);
  });

  it("only turns its glide on after the first placement, so it never flies in from a corner", async () => {
    await renderShell();
    const pill = await waitFor(() => {
      const el = highlight();
      expect(el).not.toBeNull();
      return el!;
    });
    // Moves are animated with transform only.
    await waitFor(() => expect(pill.className).toContain("transition-transform"));
  });

  it("the link itself no longer paints the background once the highlight has taken over", async () => {
    await renderShell();
    await waitFor(() => expect(highlight()).not.toBeNull());
    const link = document.querySelector<HTMLElement>('aside a[data-status="active"]')!;
    expect(link.className).not.toContain("bg-sidebar-primary");
    expect(link.className).toContain("relative");
  });
});
