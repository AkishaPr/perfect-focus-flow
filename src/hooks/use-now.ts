import { useEffect, useState } from "react";

/**
 * The current time, refreshed on an interval (default: every minute).
 *
 * Pass `view` to tick from another window's timers instead. A browser slows the timers of a
 * page that is in the background, so a clock that must keep time while the person is in another
 * tab (the timer, while its pop-out is open) ticks from the pop-out window, which is on screen.
 */
export function useNow(intervalMs = 60_000, view?: Window | null) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    if (view) {
      const id = view.setInterval(tick, intervalMs);
      return () => {
        try {
          view.clearInterval(id);
        } catch {
          // The window is already gone, and its timers went with it.
        }
      };
    }
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, view]);
  return now;
}
