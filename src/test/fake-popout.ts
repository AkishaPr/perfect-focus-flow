import { vi } from "vitest";

/**
 * A stand-in for the pop-out window: an iframe has its own window and document (as the real
 * thing does), and `close` behaves like a real window's: it flips `closed` and fires `pagehide`.
 */
export function fakePopoutWindow(): Window {
  const frame = document.createElement("iframe");
  document.body.appendChild(frame);
  const win = frame.contentWindow!;
  let closed = false;
  Object.defineProperty(win, "closed", { configurable: true, get: () => closed });
  win.close = vi.fn(() => {
    if (closed) return;
    closed = true;
    win.dispatchEvent(new Event("pagehide"));
  }) as typeof win.close;
  return win;
}

/** What closing the window by hand does, as opposed to the app closing it. */
export const closeByHand = (win: Window) => win.close();

export const removeFakePopouts = () =>
  document.querySelectorAll("iframe").forEach((f) => f.remove());

type PipStub = { requestWindow: ReturnType<typeof vi.fn> };

/** Gives this browser Document Picture-in-Picture, handing out `win`. */
export function stubPictureInPicture(win: Window): PipStub {
  const stub = { requestWindow: vi.fn(async () => win) };
  Object.defineProperty(window, "documentPictureInPicture", {
    configurable: true,
    writable: true,
    value: stub,
  });
  return stub;
}

export const removePictureInPictureStub = () => {
  delete (window as unknown as { documentPictureInPicture?: unknown }).documentPictureInPicture;
};
