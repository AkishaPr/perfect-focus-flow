import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  POPOUT_SIZE,
  canStayOnTop,
  copyStyles,
  isPopoutAvailable,
  preparePopoutWindow,
  syncAppearance,
  usePopout,
} from "@/lib/focus/popout";
import {
  fakePopoutWindow,
  removeFakePopouts,
  removePictureInPictureStub,
  stubPictureInPicture,
} from "./fake-popout";

const finePointer = (fine: boolean) =>
  vi
    .spyOn(window, "matchMedia")
    .mockImplementation(
      (q: string) => ({ matches: fine && q.includes("pointer: fine"), media: q }) as MediaQueryList,
    );

beforeEach(() => usePopout.setState({ win: null, kind: null }));
afterEach(() => {
  removePictureInPictureStub();
  removeFakePopouts();
  vi.restoreAllMocks();
  document.head.querySelectorAll("style[data-test]").forEach((s) => s.remove());
  document.documentElement.removeAttribute("class");
  document.documentElement.removeAttribute("style");
});

describe("is the pop-out on offer?", () => {
  it("is not, on a phone-like browser with no Picture-in-Picture", () => {
    finePointer(false);
    expect(isPopoutAvailable()).toBe(false);
    expect(canStayOnTop()).toBe(false);
  });

  it("is, on a desktop browser that can only make an ordinary small window", () => {
    finePointer(true);
    expect(isPopoutAvailable()).toBe(true);
    expect(canStayOnTop()).toBe(false);
  });

  it("is, wherever Picture-in-Picture exists, and that one stays on top", () => {
    finePointer(false);
    stubPictureInPicture(fakePopoutWindow());
    expect(isPopoutAvailable()).toBe(true);
    expect(canStayOnTop()).toBe(true);
  });
});

describe("opening", () => {
  it("uses Picture-in-Picture when the browser has it, at the default size", async () => {
    const win = fakePopoutWindow();
    const pip = stubPictureInPicture(win);

    expect(await usePopout.getState().open()).toBe("opened");

    expect(pip.requestWindow).toHaveBeenCalledWith({ ...POPOUT_SIZE });
    expect(usePopout.getState()).toMatchObject({ win, kind: "pip" });
  });

  it("falls back to an ordinary small window elsewhere", async () => {
    const win = fakePopoutWindow();
    const open = vi.spyOn(window, "open").mockReturnValue(win);

    expect(await usePopout.getState().open()).toBe("opened");

    const [url, name, features] = open.mock.calls[0]!;
    expect(url).toBe("");
    expect(name).toBe("alcc-timer-popout");
    expect(features).toContain("popup=yes");
    expect(features).toContain(`width=${POPOUT_SIZE.width}`);
    expect(features).toContain(`height=${POPOUT_SIZE.height}`);
    expect(usePopout.getState()).toMatchObject({ win, kind: "window" });
  });

  it("falls back to a small window if Picture-in-Picture is refused", async () => {
    const win = fakePopoutWindow();
    const pip = stubPictureInPicture(win);
    pip.requestWindow.mockRejectedValue(new DOMException("needs a click", "NotAllowedError"));
    vi.spyOn(window, "open").mockReturnValue(win);

    expect(await usePopout.getState().open()).toBe("opened");
    expect(usePopout.getState().kind).toBe("window");
  });

  it("says so when the browser blocks the window, and leaves nothing half-open", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);

    expect(await usePopout.getState().open()).toBe("blocked");
    expect(usePopout.getState()).toMatchObject({ win: null, kind: null });
  });

  it("a double click asks for one window, not two", async () => {
    const win = fakePopoutWindow();
    const pip = stubPictureInPicture(win);

    const results = await Promise.all([usePopout.getState().open(), usePopout.getState().open()]);

    expect(results).toEqual(["opened", "opened"]);
    expect(pip.requestWindow).toHaveBeenCalledTimes(1);
  });

  it("opening while it is already open does nothing", async () => {
    const win = fakePopoutWindow();
    const pip = stubPictureInPicture(win);
    await usePopout.getState().open();
    expect(await usePopout.getState().open()).toBe("opened");
    expect(pip.requestWindow).toHaveBeenCalledTimes(1);
  });
});

describe("closing", () => {
  it("close() closes the window and forgets it", async () => {
    const win = fakePopoutWindow();
    stubPictureInPicture(win);
    await usePopout.getState().open();

    usePopout.getState().close();

    expect(win.close).toHaveBeenCalledTimes(1);
    expect(usePopout.getState()).toMatchObject({ win: null, kind: null });
  });

  it("the person closing the window themselves is noticed", async () => {
    const win = fakePopoutWindow();
    stubPictureInPicture(win);
    await usePopout.getState().open();

    win.close(); // the title-bar button, not the app

    expect(usePopout.getState().win).toBeNull();
  });

  it("an old window closing doesn't take a newer one down with it", async () => {
    const first = fakePopoutWindow();
    const second = fakePopoutWindow();
    const pip = stubPictureInPicture(first);
    await usePopout.getState().open();
    usePopout.setState({ win: null, kind: null });
    pip.requestWindow.mockResolvedValue(second);
    await usePopout.getState().open();

    first.dispatchEvent(new Event("pagehide"));

    expect(usePopout.getState().win).toBe(second);
  });

  it("close() is safe if the window refuses to close or there is none", () => {
    expect(() => usePopout.getState().close()).not.toThrow();
    const win = fakePopoutWindow();
    win.close = () => {
      throw new Error("already closed");
    };
    usePopout.setState({ win, kind: "window" });
    expect(() => usePopout.getState().close()).not.toThrow();
    expect(usePopout.getState().win).toBeNull();
    win.close = () => {}; // jsdom calls this when the test's iframe is removed
  });
});

describe("copyStyles", () => {
  const sheet = (rules: string[]) => ({ cssRules: rules.map((cssText) => ({ cssText })) });
  const unreadable = (href: string | null) => ({
    href,
    get cssRules(): never {
      throw new DOMException("cross-origin", "SecurityError");
    },
  });

  it("copies readable stylesheets as one <style> each, and links the ones it can't read", () => {
    const to = fakePopoutWindow().document;
    const from = {
      styleSheets: [
        sheet([".a { color: red; }", ".b { color: blue; }"]),
        unreadable("https://fonts.example/f.css"),
        unreadable(null),
      ],
    } as unknown as Document;

    const added = copyStyles(from, to);

    expect(added).toHaveLength(2); // the sheet with no rules to read and no address is skipped
    const style = to.head.querySelector("style")!;
    expect(style.textContent).toContain(".a { color: red; }");
    expect(style.textContent).toContain(".b { color: blue; }");
    expect(to.head.querySelector<HTMLLinkElement>("link[rel=stylesheet]")?.href).toBe(
      "https://fonts.example/f.css",
    );
  });
});

describe("syncAppearance", () => {
  it("copies the theme now and follows it afterwards, until told to stop", async () => {
    const dst = fakePopoutWindow().document.documentElement;
    document.documentElement.className = "dark";
    document.documentElement.style.colorScheme = "dark";

    const stop = syncAppearance(document.documentElement, dst);
    expect(dst.className).toBe("dark");
    expect(dst.style.colorScheme).toBe("dark");

    document.documentElement.className = "";
    await waitFor(() => expect(dst.className).toBe(""));

    stop();
    document.documentElement.className = "dark";
    await new Promise((r) => setTimeout(r, 20));
    expect(dst.className).toBe(""); // no longer following
  });

  it("removes an attribute the app's page no longer has", async () => {
    const dst = fakePopoutWindow().document.documentElement;
    document.documentElement.setAttribute("lang", "en");
    const stop = syncAppearance(document.documentElement, dst);
    expect(dst.getAttribute("lang")).toBe("en");
    document.documentElement.removeAttribute("lang");
    await waitFor(() => expect(dst.hasAttribute("lang")).toBe(false));
    stop();
  });
});

describe("preparePopoutWindow", () => {
  it("dresses a bare window as the app, and undoes it all on request", () => {
    const style = document.createElement("style");
    style.dataset["test"] = "";
    style.textContent = ".probe { color: red; }";
    document.head.appendChild(style);
    document.documentElement.className = "dark";
    document.title = "Focus — A/L Command Center";
    const win = fakePopoutWindow();

    const { root, dispose } = preparePopoutWindow(window, win);

    const doc = win.document;
    expect(doc.title).toBe("Focus — A/L Command Center");
    expect(doc.documentElement.className).toBe("dark");
    expect(doc.head.querySelector("base")?.href).toBe(document.baseURI);
    expect(
      [...doc.head.querySelectorAll("style")].some((s) => s.textContent?.includes(".probe")),
    ).toBe(true);
    expect(root.id).toBe("popout-root");
    expect(doc.body.contains(root)).toBe(true);

    dispose();
    expect(doc.body.contains(root)).toBe(false);
    expect(doc.head.querySelector("base")).toBeNull();
    expect(doc.head.querySelectorAll("style")).toHaveLength(0);
  });
});
