import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ComponentProps } from "react";
import { createPortal } from "react-dom";
import {
  ArrowUpRight,
  Coffee,
  Pause,
  PictureInPicture,
  PictureInPicture2,
  Play,
} from "lucide-react";
import { toast } from "sonner";
import { AnimatedClock } from "@/components/AnimatedClock";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useNow } from "@/hooks/use-now";
import { breakFrom, useTimer } from "@/lib/focus/store";
import {
  canStayOnTop,
  isElectron,
  isPopoutAvailable,
  preparePopoutWindow,
  usePopout,
} from "@/lib/focus/popout";
import { clockText, isRunning, isStale, progress, type TimerState } from "@/lib/focus/timer";
import { formatMinutes } from "@/lib/format";
import { playSound } from "@/lib/sound";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * The pop-out timer: a small player that floats above whatever you are studying from, so the
 * clock stays in sight without keeping this tab open. It shows the same timer as the Focus page
 * (one store, nothing to sync) and does the same things: pause, resume, take a break once a block
 * is done, start the next focus. Stopping and saving a session needs the minutes confirmed, so
 * that is a button back to the app.
 */

export interface PopoutActions {
  pause: () => void;
  resume: () => void;
  takeBreak: () => void;
  nextFocus: () => void;
  back: () => void;
}

/**
 * The player's picture, with no state of its own: give it a timer, a time and some actions. It
 * is drawn with the app's own classes, so it follows the theme, and it adapts to the size the
 * window is dragged to: the clock scales with the window, a short window drops the caption, and a
 * very short one (under 140px tall) becomes a slim bar: the clock on the left, the button on the
 * right, the progress along the bottom edge. Nothing is ever clipped.
 */
export function PopoutView({
  timer,
  taskTitle,
  nowMs,
  actions,
}: {
  timer: TimerState;
  taskTitle: string;
  nowMs: number;
  actions: PopoutActions;
}) {
  const p = progress(timer, nowMs);
  const running = isRunning(timer);
  const isBreak = timer.phase === "break";
  // A block left running for hours is a forgotten timer, not a completed one (as on the Focus page).
  const complete = !isBreak && p.over && !isStale(timer, nowMs);
  const soft = running ? "" : "opacity-60";

  const caption = complete ? (
    <span className="font-medium text-foreground">Focus block complete</span>
  ) : (
    <>
      {isBreak && p.over ? "Break's over" : p.over ? "past the target" : "left"} · target{" "}
      {formatMinutes(timer.targetMin)}
      {!running && <span className="motion-fade"> · paused</span>}
    </>
  );

  const pauseResume = running ? (
    <Button size="sm" variant="secondary" onClick={actions.pause}>
      <Pause className="h-4 w-4" /> Pause
    </Button>
  ) : (
    <Button
      size="sm"
      variant={complete || isBreak ? "secondary" : "default"}
      onClick={actions.resume}
    >
      <Play className="h-4 w-4" /> Resume
    </Button>
  );

  return (
    <div
      data-popout=""
      data-phase={timer.phase}
      data-state={running ? "running" : "paused"}
      className={cn(
        "relative flex h-full min-h-screen select-none flex-col bg-background text-foreground transition-colors duration-500 [@media(max-height:140px)]:flex-row [@media(max-height:140px)]:items-center",
        complete && "bg-signal/15",
      )}
    >
      <header className="flex items-center gap-2 px-3 pt-2.5 [@media(max-height:140px)]:hidden">
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {isBreak ? (
            <Coffee className="h-3 w-3" aria-hidden="true" />
          ) : (
            <span
              aria-hidden="true"
              className={cn(
                "h-1.5 w-1.5 rounded-full transition-colors duration-300",
                running ? "bg-signal" : "bg-muted-foreground/60",
              )}
            />
          )}
          {isBreak ? "Break" : "Focus"}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-foreground/80" title={taskTitle}>
          {taskTitle}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          aria-label="Back to the app"
          title="Back to the app"
          onClick={actions.back}
        >
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Button>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-3 text-center [@media(max-height:140px)]:items-start [@media(max-height:140px)]:text-left">
        <div
          role="timer"
          aria-label={p.over ? "Time over target" : "Time left"}
          className={cn(
            // Scales with the window: whichever of its width and height is tighter decides.
            "font-mono text-[length:min(22vw,30vh)] font-medium leading-none tabular-nums transition-opacity duration-300 [@media(max-height:140px)]:text-[length:min(14vw,58vh)]",
            soft,
          )}
        >
          <AnimatedClock text={clockText(p)} />
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground [@media(max-height:150px)]:hidden">
          {caption}
        </p>
      </div>

      <div className="flex items-center justify-center gap-2 px-3 pb-3 pt-2 [@media(max-height:140px)]:p-0 [@media(max-height:140px)]:pr-3">
        {complete ? (
          <>
            <Button size="sm" onClick={actions.takeBreak}>
              <Coffee className="h-4 w-4" /> Take a break
            </Button>
            {pauseResume}
          </>
        ) : isBreak ? (
          <>
            <Button size="sm" onClick={actions.nextFocus}>
              <Play className="h-4 w-4" /> {p.over ? "Start next focus" : "Skip break"}
            </Button>
            {!p.over && pauseResume}
          </>
        ) : (
          pauseResume
        )}
      </div>

      <Progress
        value={Math.round(p.fraction * 100)}
        aria-label="Phase progress"
        // Edge to edge along the bottom; a soft light passes over it once the target is reached.
        sheen={p.over}
        className={cn(
          "h-1.5 rounded-none bg-muted transition-opacity duration-300 [@media(max-height:140px)]:absolute [@media(max-height:140px)]:inset-x-0 [@media(max-height:140px)]:bottom-0",
          soft,
        )}
      />
    </div>
  );
}

/** The player wired to the real timer. It lives in the pop-out window and ticks from its timers. */
function PopoutPlayer({ win }: { win: Window }) {
  const timer = useTimer((s) => s.timer);
  const pause = useTimer((s) => s.pause);
  const resume = useTimer((s) => s.resume);
  const finishFocus = useTimer((s) => s.finishFocus);
  const nextFocus = useTimer((s) => s.nextFocus);
  const taskTitle = useStore((s) => s.tasks.find((t) => t.id === timer?.taskId)?.title);
  const close = usePopout((s) => s.close);
  const navigate = useNavigate();
  // Ticking from this window keeps the clock exact even when the app's own tab is in the background.
  const nowMs = useNow(500, win).getTime();

  // The window's title bar shows the countdown, like the app's tab does.
  const clock = timer ? clockText(progress(timer, nowMs)) : "";
  const phase = timer?.phase === "break" ? "Break" : "Focus";
  useEffect(() => {
    if (!clock) return;
    try {
      win.document.title = `${clock} · ${phase}`;
    } catch {
      // The window is closing.
    }
  }, [win, clock, phase]);

  const running = timer ? isRunning(timer) : false;
  // Space pauses and resumes, as in a video player. A focused button keeps its own Space.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      if ((e.target as Element | null)?.closest?.("button")) return;
      e.preventDefault();
      const now = Date.now();
      if (running) pause(now);
      else {
        playSound("start");
        resume(now);
      }
    };
    win.document.addEventListener("keydown", onKey);
    return () => {
      try {
        win.document.removeEventListener("keydown", onKey);
      } catch {
        // The window is already gone.
      }
    };
  }, [win, running, pause, resume]);

  if (!timer) return null;
  const actions: PopoutActions = {
    pause: () => pause(Date.now()),
    resume: () => {
      playSound("start");
      resume(Date.now());
    },
    takeBreak: () => finishFocus(breakFrom(timer, Date.now())),
    nextFocus: () => {
      playSound("start");
      nextFocus(Date.now());
    },
    back: () => {
      void navigate({ to: "/focus" });
      try {
        window.focus();
      } catch {
        // Some browsers don't let a page raise its own window; the route has changed regardless.
      }
      close();
    },
  };
  return (
    <PopoutView timer={timer} taskTitle={taskTitle ?? "Focus"} nowMs={nowMs} actions={actions} />
  );
}

/**
 * Renders the player into the pop-out window while one is open. Mount it once, inside the app
 * (it needs the router). It also looks after the window's life: dressing a bare window as the
 * app, and closing it when the timer ends, the page goes away, or the person closes the window.
 */
export function PopoutHost() {
  const win = usePopout((s) => s.win);
  const close = usePopout((s) => s.close);
  const hasTimer = useTimer((s) => s.timer !== null);
  const [root, setRoot] = useState<HTMLElement | null>(null);

  // The timer is over (saved, discarded): there is nothing left to show.
  useEffect(() => {
    if (win && !hasTimer) close();
  }, [win, hasTimer, close]);

  // A popup can be closed without a word; PiP windows close with this page. Either way, tidy up.
  useEffect(() => {
    if (!win) return;
    const onLeave = () => close();
    window.addEventListener("pagehide", onLeave);
    const watch = window.setInterval(() => {
      if (win.closed) close();
    }, 1000);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      window.clearInterval(watch);
    };
  }, [win, close]);

  useEffect(() => {
    if (!win) {
      setRoot(null);
      return;
    }
    const { root: mount, dispose } = preparePopoutWindow(window, win);
    setRoot(mount);
    return () => {
      dispose();
      setRoot(null);
    };
  }, [win]);

  // If the app itself goes away, the pop-out must not be left orphaned.
  useEffect(() => () => usePopout.getState().close(), []);

  return win && root && hasTimer ? createPortal(<PopoutPlayer win={win} />, root) : null;
}

/**
 * Opens the pop-out, or brings it back. It is not shown where there is nothing useful to open
 * (a phone's browser would just make a tab).
 */
export function PopoutButton({
  iconOnly = false,
  variant = "ghost",
  className,
}: {
  iconOnly?: boolean;
  variant?: ComponentProps<typeof Button>["variant"];
  className?: string;
}) {
  const isOpen = usePopout((s) => s.win !== null);
  const open = usePopout((s) => s.open);
  const close = usePopout((s) => s.close);
  // Decided after mount: the server can't know what this browser supports.
  const [available, setAvailable] = useState(false);
  const [onTop, setOnTop] = useState(false);
  useEffect(() => {
    setAvailable(isPopoutAvailable());
    setOnTop(canStayOnTop());
  }, []);
  if (!available) return null;

  const label = isOpen ? "Bring back" : "Pop out";
  const Icon = isOpen ? PictureInPicture : PictureInPicture2;
  const onClick = async () => {
    if (isOpen) return close();
    if ((await open()) === "blocked") {
      toast.error("Couldn't open the pop-out", {
        description: isElectron()
          ? "This app's window settings blocked the new window."
          : "Your browser blocked the window. Allow pop-ups for this site and try again.",
      });
    }
  };
  return (
    <Button
      type="button"
      variant={variant}
      size={iconOnly ? "icon" : "default"}
      className={className}
      aria-pressed={isOpen}
      aria-label={iconOnly ? (isOpen ? "Bring the timer back" : "Pop out the timer") : undefined}
      title={
        isOpen
          ? "Close the pop-out and bring the timer back to this page"
          : onTop
            ? "Open the timer in a small window that stays on top of other apps"
            : "Open the timer in a small window"
      }
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
      {!iconOnly && label}
    </Button>
  );
}
