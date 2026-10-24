import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { Coffee, Timer } from "lucide-react";
import { toast } from "sonner";
import { PopoutButton } from "@/components/TimerPopout";
import { useNow } from "@/hooks/use-now";
import { usePopout } from "@/lib/focus/popout";
import { useTimer } from "@/lib/focus/store";
import { clockText, isRunning, progress, type TimerState } from "@/lib/focus/timer";
import { playSound } from "@/lib/sound";
import { useStore } from "@/lib/store";

/**
 * Keeps a running timer visible on every page: a small link back to /focus, the countdown in
 * the browser tab title, and a notice when a phase reaches its target. Renders nothing while
 * there is no timer, and only ticks while there is one.
 */
export function TimerDock() {
  const timer = useTimer((s) => s.timer);
  return timer ? <ActiveDock timer={timer} /> : null;
}

// "⏱ 12:03 — " or "⏱ +1:05 — ", stripped before the page title is rebuilt.
const TITLE_PREFIX = /^⏱ \+?[0-9:]+ — /;

function ActiveDock({ timer }: { timer: TimerState }) {
  // While the pop-out is open it is the window on screen, so its timers are the ones a browser
  // doesn't slow down: tick from there, and the title and the completion chime stay on time even
  // with this tab in the background.
  const popout = usePopout((s) => s.win);
  const nowMs = useNow(1000, popout).getTime();
  const task = useStore((s) => s.tasks.find((t) => t.id === timer.taskId));
  const onFocusPage = useRouterState({ select: (s) => s.location.pathname === "/focus" });
  const p = progress(timer, nowMs);
  const clock = clockText(p);
  const isBreak = timer.phase === "break";

  // Countdown in the tab title. Route changes reset the title, so rebuild it from the current one.
  useEffect(() => {
    document.title = `⏱ ${clock} — ${document.title.replace(TITLE_PREFIX, "")}`;
  }, [clock]);
  useEffect(
    () => () => {
      document.title = document.title.replace(TITLE_PREFIX, "");
    },
    [],
  );

  // Tell the user when a phase reaches its target. Never on load: only a crossing we watched.
  const seen = useRef<{ key: string; over: boolean } | null>(null);
  const key = `${timer.phase}:${timer.phaseStartedAt}`;
  useEffect(() => {
    const prev = seen.current;
    seen.current = { key, over: p.over };
    if (prev && prev.key === key && !prev.over && p.over) {
      playSound("chime");
      toast(isBreak ? "Break's over. Ready for the next focus?" : "Focus block complete.", {
        description: task?.title,
      });
    }
  }, [key, p.over, isBreak, task?.title]);

  if (onFocusPage) return null;
  const Icon = isBreak ? Coffee : Timer;
  return (
    <div className="motion-rise fixed bottom-20 right-4 z-30 flex items-center rounded-full border bg-card text-sm shadow-lg md:bottom-6 md:right-6">
      <Link
        to="/focus"
        aria-label={`${isBreak ? "Break" : "Focus timer"} ${clock}${isRunning(timer) ? "" : ", paused"}. Open the timer.`}
        className="flex items-center gap-2 rounded-l-full py-2 pl-4 pr-3"
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span className="font-mono tabular-nums">{clock}</span>
        <span className="max-w-[10rem] truncate text-xs text-muted-foreground">
          {isRunning(timer) ? (task?.title ?? "") : "Paused"}
        </span>
      </Link>
      <PopoutButton iconOnly className="mr-1 h-7 w-7 rounded-full" />
    </div>
  );
}
