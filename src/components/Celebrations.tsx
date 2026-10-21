import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { SparkleBurst } from "@/components/SparkleBurst";
import { useNow } from "@/hooks/use-now";
import { formatMinutes } from "@/lib/format";
import { goalSnapshot, newMilestone, type GoalSnapshot, type Milestone } from "@/lib/milestones";
import { playSound } from "@/lib/sound";
import { useStore } from "@/lib/store";

const BURST: Record<Milestone, { count: number; radius: number; durationMs: number }> = {
  daily: { count: 10, radius: 64, durationMs: 800 },
  // Slightly bigger, as asked: more sparks, farther, a little longer.
  weekly: { count: 18, radius: 120, durationMs: 1100 },
};

/**
 * Marks the moment study time crosses the daily or weekly goal, wherever in the app it happens:
 * a few sparks, a soft phrase of sound and a toast. Renders nothing until then. Mount it once,
 * after saved data has loaded (the totals jumping from empty to saved would otherwise look like a
 * crossing). The rules live in lib/milestones.ts.
 */
export function Celebrations() {
  const tasks = useStore((s) => s.tasks);
  const blocks = useStore((s) => s.blocks);
  const sessions = useStore((s) => s.sessions);
  const settings = useStore((s) => s.settings);
  const now = useNow(60_000);
  const snapshot = useMemo(
    () => goalSnapshot({ tasks, blocks, sessions, settings }, now),
    [tasks, blocks, sessions, settings, now],
  );

  const previous = useRef<GoalSnapshot | null>(null);
  const fired = useRef(new Set<string>());
  const [burst, setBurst] = useState<{ id: number; kind: Milestone } | null>(null);

  useEffect(() => {
    const hit = newMilestone(previous.current, snapshot, fired.current);
    previous.current = snapshot;
    if (!hit) return;
    fired.current.add(hit.key);
    setBurst({ id: Date.now(), kind: hit.kind });
    if (hit.kind === "weekly") {
      playSound("weekly");
      toast.success("Weekly goal reached", {
        description: `${formatMinutes(snapshot.weekMin)} studied this week. Well earned.`,
        duration: 6000,
      });
    } else {
      playSound("goal");
      toast.success("Daily goal reached", {
        description: `${formatMinutes(snapshot.dayMin)} studied today.`,
      });
    }
  }, [snapshot]);

  useEffect(() => {
    if (!burst) return;
    const t = setTimeout(() => setBurst(null), 1800);
    return () => clearTimeout(t);
  }, [burst]);

  if (!burst) return null;
  const b = BURST[burst.kind];
  return (
    <div
      key={burst.id}
      aria-hidden="true"
      data-celebration={burst.kind}
      className="pointer-events-none fixed left-1/2 top-28 z-50 h-0 w-0"
    >
      <SparkleBurst count={b.count} radius={b.radius} durationMs={b.durationMs} />
    </div>
  );
}
