import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Ids that stay "held" for `ms` after being added, then let go on their own. A list that hides
 * finished tasks uses it to keep a just-finished one on screen long enough to see its reward,
 * instead of the row vanishing the instant it is ticked.
 */
export function useLinger(ms: number) {
  const [held, setHeld] = useState<ReadonlySet<string>>(() => new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const drop = useCallback((id: string) => {
    setHeld((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  /** Let go at once (the tick was undone before the time was up). */
  const release = useCallback(
    (id: string) => {
      clearTimeout(timers.current.get(id));
      timers.current.delete(id);
      drop(id);
    },
    [drop],
  );

  const hold = useCallback(
    (id: string) => {
      clearTimeout(timers.current.get(id));
      setHeld((prev) => new Set(prev).add(id));
      timers.current.set(
        id,
        setTimeout(() => {
          timers.current.delete(id);
          drop(id);
        }, ms),
      );
    },
    [ms, drop],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((t) => clearTimeout(t));
      pending.clear();
    };
  }, []);

  return { held, hold, release };
}
