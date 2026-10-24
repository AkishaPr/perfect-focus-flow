import { create } from "zustand";

/**
 * The pop-out timer's window: where it opens, how it is tracked, and how a bare new window is
 * made to look like the app. The player itself is in components/TimerPopout.tsx.
 *
 * Two kinds of window, one player:
 *  - "pip": a Document Picture-in-Picture window (Chrome and Edge, desktop). A real always-on-top
 *    mini window that stays above everything else, including other apps. This is the one worth
 *    having.
 *  - "window": an ordinary small popup, for every other desktop browser. It does not stay on top
 *    (browsers don't allow that), but it is still a separate window you can put beside your book.
 *
 * The window shares this page's JavaScript, so the player reads the very same timer store: there
 * is nothing to sync and nothing to get out of step.
 */

export type PopoutKind = "pip" | "window";
export type OpenResult = "opened" | "blocked";

/** Default size: the clock, the task, two buttons and the bar. People can resize it. */
export const POPOUT_SIZE = { width: 340, height: 200 } as const;
const POPOUT_NAME = "alcc-timer-popout";

/** The parts of the Document Picture-in-Picture API this uses (not yet in TypeScript's DOM types). */
interface DocumentPictureInPicture {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
}

const pipApi = (): DocumentPictureInPicture | undefined =>
  typeof window === "undefined"
    ? undefined
    : (window as unknown as { documentPictureInPicture?: DocumentPictureInPicture })
        .documentPictureInPicture;

/** Whether this browser can make a window that stays on top of other apps (Chrome and Edge). */
export const canStayOnTop = (): boolean => pipApi() !== undefined;

/**
 * Whether to offer the pop-out at all. Picture-in-Picture: always. Without it the fallback is a
 * small window, which only makes sense on a desktop with a mouse: a phone would just open a tab.
 */
export function isPopoutAvailable(): boolean {
  if (typeof window === "undefined") return false;
  if (pipApi()) return true;
  return window.matchMedia?.("(pointer: fine)").matches ?? false;
}

async function requestWindow(): Promise<{ win: Window; kind: PopoutKind } | null> {
  const pip = pipApi();
  if (pip) {
    try {
      return { win: await pip.requestWindow({ ...POPOUT_SIZE }), kind: "pip" };
    } catch {
      // Refused (for instance, there was no click behind it): try an ordinary window instead.
    }
  }
  const { width, height } = POPOUT_SIZE;
  const left = Math.max(0, (window.screen?.availWidth ?? 1280) - width - 24);
  const features = `popup=yes,width=${width},height=${height},left=${left},top=80,resizable=yes,scrollbars=no`;
  const win = window.open("", POPOUT_NAME, features);
  return win ? { win, kind: "window" } : null;
}

interface PopoutState {
  /** The open pop-out window, or null. */
  win: Window | null;
  kind: PopoutKind | null;
  /** Must be called from a click or key press: browsers only allow a new window then. */
  open: () => Promise<OpenResult>;
  close: () => void;
}

let opening: Promise<OpenResult> | null = null;

export const usePopout = create<PopoutState>()((set, get) => ({
  win: null,
  kind: null,

  open: () => {
    if (get().win) return Promise.resolve("opened");
    // A double click must not ask for two windows (the second request would fall back to a popup).
    opening ??= (async (): Promise<OpenResult> => {
      try {
        const got = await requestWindow();
        if (!got) return "blocked";
        // The person can close it themselves at any moment; keep the store in step.
        got.win.addEventListener(
          "pagehide",
          () => {
            if (get().win === got.win) set({ win: null, kind: null });
          },
          { once: true },
        );
        set({ win: got.win, kind: got.kind });
        return "opened";
      } finally {
        opening = null;
      }
    })();
    return opening;
  },

  close: () => {
    const { win } = get();
    set({ win: null, kind: null });
    try {
      win?.close();
    } catch {
      // Already closed.
    }
  },
}));

/**
 * Copies this page's stylesheets into the new window, so the player is drawn by the very same
 * CSS as the app (the same Tailwind classes, fonts and light/dark colours). A sheet whose rules
 * can't be read (served from another origin) is linked instead. Returns what it added, so it
 * can be taken out again.
 */
export function copyStyles(from: Pick<Document, "styleSheets">, to: Document): HTMLElement[] {
  const added: HTMLElement[] = [];
  for (const sheet of Array.from(from.styleSheets)) {
    try {
      const style = to.createElement("style");
      style.textContent = Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .join("\n");
      to.head.appendChild(style);
      added.push(style);
    } catch {
      if (!sheet.href) continue;
      const link = to.createElement("link");
      link.rel = "stylesheet";
      link.href = sheet.href;
      to.head.appendChild(link);
      added.push(link);
    }
  }
  return added;
}

const APPEARANCE = ["class", "style", "lang", "dir"] as const;

/**
 * Keeps the new window's <html> in step with this page's: the light/dark class and colour scheme
 * above all, so switching the theme in the app switches the pop-out too, live. Returns a function
 * that stops following.
 */
export function syncAppearance(src: HTMLElement, dst: HTMLElement): () => void {
  const copy = () => {
    for (const name of APPEARANCE) {
      const value = src.getAttribute(name);
      if (value === null) dst.removeAttribute(name);
      else dst.setAttribute(name, value);
    }
  };
  copy();
  const MutationObserverCtor = src.ownerDocument.defaultView?.MutationObserver ?? MutationObserver;
  const observer = new MutationObserverCtor(copy);
  observer.observe(src, { attributes: true, attributeFilter: [...APPEARANCE] });
  return () => observer.disconnect();
}

/**
 * Dresses a bare new window as the app and makes a root for the player to render into. Returns
 * that root and a function that undoes everything it did.
 */
export function preparePopoutWindow(
  from: Window,
  to: Window,
): { root: HTMLElement; dispose: () => void } {
  const doc = to.document;
  doc.title = from.document.title;

  // Relative URLs in the copied CSS (fonts, mostly) must resolve as they do on the app's page.
  const base = doc.createElement("base");
  base.href = from.document.baseURI;
  doc.head.appendChild(base);

  const added = [base, ...copyStyles(from.document, doc)];

  // The app's own base rules fill the window; the player owns every pixel of it.
  const fit = doc.createElement("style");
  fit.textContent = "html,body,#popout-root{height:100%;margin:0;overflow:hidden}";
  doc.head.appendChild(fit);
  added.push(fit);

  doc.body.className = from.document.body.className;
  const root = doc.createElement("div");
  root.id = "popout-root";
  doc.body.appendChild(root);

  const stop = syncAppearance(from.document.documentElement, doc.documentElement);
  return {
    root,
    dispose: () => {
      stop();
      added.forEach((el) => el.remove());
      root.remove();
    },
  };
}
