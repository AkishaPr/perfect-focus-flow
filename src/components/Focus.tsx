import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check, Coffee, Pause, Play, Square, Trash2 } from "lucide-react";
import { AnimatedClock } from "@/components/AnimatedClock";
import { PageHeader } from "@/components/AppShell";
import { PopoutButton } from "@/components/TimerPopout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useNow } from "@/hooks/use-now";
import { toMin, ymd } from "@/lib/calendar";
import { breakFrom, useTimer } from "@/lib/focus/store";
import {
  MS_PER_MIN,
  clockText,
  isRunning,
  isStale,
  progress,
  suggestedMinutes,
  type TimerState,
} from "@/lib/focus/timer";
import { remainingMin, sessionDate, spentMin, studiedMinOn } from "@/lib/planner";
import { buildToday } from "@/lib/planner/today";
import { stagger } from "@/lib/motion";
import { playSound } from "@/lib/sound";
import { useStore } from "@/lib/store";
import { SUBJECT_LABEL, type PlanBlock, type Task } from "@/lib/types";

const PLAN_STEP_MS = 5 * 60_000;
const CARD = "rounded-xl border bg-card p-5 shadow-xs";

const fmtMin = (n: number) =>
  n >= 60 ? `${Math.floor(n / 60)}h ${n % 60 ? `${n % 60}m` : ""}`.trim() : `${n} min`;
const fmtLong = (ms: number) => fmtMin(Math.round(ms / MS_PER_MIN));

function TaskLine({ task }: { task: Task }) {
  return (
    <>
      <h2 className="text-xl font-medium">{task.title}</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {SUBJECT_LABEL[task.subject]}
        {task.topic && ` · ${task.topic}`} · <span className="capitalize">{task.type}</span>
      </p>
    </>
  );
}

/** Focus page body. `now` is injectable so tests don't depend on the clock. */
export function Focus({ now: nowOverride }: { now?: Date }) {
  const liveNow = useNow(1000);
  const now = nowOverride ?? liveNow;
  const timer = useTimer((s) => s.timer);
  return (
    <>
      <PageHeader title="Focus" subtitle="Study timer with actual-duration tracking." />
      <div className="mx-auto max-w-2xl space-y-6">
        {timer ? <Running timer={timer} now={now} /> : <Idle now={now} />}
        <SessionsToday now={now} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Idle: pick a task and start
// ---------------------------------------------------------------------------------------------

function Idle({ now }: { now: Date }) {
  const settings = useStore((s) => s.settings);
  const events = useStore((s) => s.events);
  const tasks = useStore((s) => s.tasks);
  const goals = useStore((s) => s.goals);
  const blocks = useStore((s) => s.blocks);
  const sessions = useStore((s) => s.sessions);
  const marks = useStore((s) => s.marks);
  const begin = useTimer((s) => s.begin);
  const [choice, setChoice] = useState<string | null>(null);

  const step = Math.floor(now.getTime() / PLAN_STEP_MS);
  const planNow = useMemo(() => new Date(step * PLAN_STEP_MS), [step]);
  const view = useMemo(
    () => buildToday({ settings, events, tasks, goals, blocks, sessions, marks }, planNow),
    [settings, events, tasks, goals, blocks, sessions, marks, planNow],
  );

  const open = tasks.filter((t) => t.status !== "done" && t.status !== "deferred");
  const recommended = view.active?.task ?? (view.next?.isToday ? view.next.task : undefined);
  const selectedId =
    choice && open.some((t) => t.id === choice) ? choice : (recommended?.id ?? open[0]?.id ?? "");
  const task = open.find((t) => t.id === selectedId);

  /** The planned block to follow when the chosen task is the one the planner picked for now. */
  const block: PlanBlock | undefined =
    view.active && view.active.task.id === selectedId
      ? view.active.block
      : view.next?.isToday && view.next.task.id === selectedId
        ? view.next.block
        : undefined;
  const lengthMin = block ? toMin(block.end) - toMin(block.start) : settings.focusMin;

  if (open.length === 0) {
    return (
      <section
        aria-label="Start a focus session"
        className={`${CARD} motion-rise text-sm text-muted-foreground`}
      >
        Nothing to focus on yet.{" "}
        <Link to="/tasks" className="underline">
          Add a task
        </Link>{" "}
        and come back to start the timer.
      </section>
    );
  }

  return (
    <section aria-label="Start a focus session" className={`${CARD} motion-rise`}>
      <label
        htmlFor="focus-task"
        className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
      >
        What are you working on?
      </label>
      <select
        id="focus-task"
        value={selectedId}
        onChange={(e) => setChoice(e.target.value)}
        className="mt-2 h-10 w-full rounded-md border bg-input/30 px-2 text-sm"
      >
        {open.map((t) => (
          <option key={t.id} value={t.id}>
            {t.id === recommended?.id ? "★ " : ""}
            {SUBJECT_LABEL[t.subject]} · {t.title}
          </option>
        ))}
      </select>
      {recommended && (
        <p className="mt-2 text-xs text-muted-foreground">
          ★ is what the planner would have you do now.
        </p>
      )}

      {task && (
        <div className="mt-5">
          <TaskLine task={task} />
          <TaskProgress task={task} />
          <div className="mt-4">
            <Button
              onClick={() => {
                playSound("start");
                begin(task.id, now.getTime(), block);
              }}
            >
              <Play className="h-4 w-4" /> Start focus · {fmtMin(lengthMin)}
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {block
              ? "Follows the block the planner scheduled."
              : `Uses your ${settings.focusMin}-minute focus length`}
            {" · "}
            {settings.breakMin}-minute breaks.{" "}
            <Link to="/settings" className="underline">
              Change in Settings
            </Link>
          </p>
        </div>
      )}
    </section>
  );
}

function TaskProgress({ task }: { task: Task }) {
  const sessions = useStore((s) => s.sessions);
  const spent = spentMin(task, sessions);
  if (task.estimateMin <= 0) return null;
  const left = remainingMin(task, sessions);
  return (
    <>
      <Progress
        value={Math.min(100, Math.round((spent / task.estimateMin) * 100))}
        aria-label="Time logged against the estimate"
        className="mt-3"
      />
      <p className="mt-1.5 text-xs text-muted-foreground">
        {spent > 0
          ? `${fmtMin(spent)} logged of ${fmtMin(task.estimateMin)}`
          : `Estimate ${fmtMin(task.estimateMin)}`}
        {left === 0 && " · estimate used up: mark it done or raise the estimate in Tasks"}
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Running: focus or break
// ---------------------------------------------------------------------------------------------

function Running({ timer, now }: { timer: TimerState; now: Date }) {
  const nowMs = now.getTime();
  const task = useStore((s) => s.tasks.find((t) => t.id === timer.taskId));
  const clear = useTimer((s) => s.clear);

  if (!task) {
    return (
      <section aria-label="Timer" className={CARD}>
        <p className="text-sm">The task this timer was for no longer exists.</p>
        <Button className="mt-4" variant="secondary" onClick={clear}>
          <Trash2 className="h-4 w-4" /> Discard timer
        </Button>
      </section>
    );
  }
  return timer.phase === "break" ? (
    <Break timer={timer} task={task} nowMs={nowMs} />
  ) : (
    <FocusPhase timer={timer} task={task} nowMs={nowMs} />
  );
}

function Clock({ timer, nowMs }: { timer: TimerState; nowMs: number }) {
  const p = progress(timer, nowMs);
  const running = isRunning(timer);
  // Paused reads as a calm state change: the numbers and the bar soften, the word fades in.
  const soft = running ? "" : "opacity-60";
  return (
    <div className="mt-5">
      <div
        role="timer"
        aria-label={p.over ? "Time over target" : "Time left"}
        className={`font-mono text-6xl font-medium tabular-nums transition-opacity duration-300 ${soft}`}
      >
        <AnimatedClock text={clockText(p)} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {p.over ? "past the target" : "left"} · target {fmtMin(timer.targetMin)}
        {!running && <span className="motion-fade"> · paused</span>}
      </p>
      <Progress
        value={Math.round(p.fraction * 100)}
        aria-label="Phase progress"
        // The bar fills, then a soft light passes over it once when the target is reached.
        sheen={p.over}
        className={`mt-4 transition-opacity duration-300 ${soft}`}
      />
    </div>
  );
}

function FocusPhase({ timer, task, nowMs }: { timer: TimerState; task: Task; nowMs: number }) {
  const pauseTimer = useTimer((s) => s.pause);
  const resumeTimer = useTimer((s) => s.resume);
  const finishFocus = useTimer((s) => s.finishFocus);
  const [wrap, setWrap] = useState<{ minutes: string; resumeOnCancel: boolean } | null>(null);
  const [keptGoing, setKeptGoing] = useState<number | null>(null);

  const p = progress(timer, nowMs);
  const stale = isStale(timer, nowMs);
  const running = isRunning(timer);

  const openWrap = () => {
    // Stop the clock while deciding, so the minutes don't move under the input.
    const minutes = String(suggestedMinutes(timer, nowMs));
    if (running) pauseTimer(nowMs);
    setWrap({ minutes, resumeOnCancel: running });
  };
  const cancelWrap = () => {
    if (wrap?.resumeOnCancel) resumeTimer(nowMs);
    setWrap(null);
  };
  const minutes = wrap ? Number(wrap.minutes) : 0;
  const minutesOk =
    wrap !== null &&
    wrap.minutes.trim() !== "" &&
    Number.isFinite(minutes) &&
    minutes >= 0 &&
    minutes <= 24 * 60;
  const save = (taskDone: boolean) => {
    if (!minutesOk) return;
    finishFocus({ nowMs, minutes: Math.round(minutes), taskDone, then: "stop" });
  };
  const takeBreak = () => finishFocus(breakFrom(timer, nowMs));

  return (
    <section
      aria-label="Timer"
      className={`${CARD} motion-rise transition-colors duration-300 ${running ? "border-signal/60" : ""}`}
    >
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Focus{timer.segments > 0 && ` · session ${timer.segments + 1}`}
      </div>
      <TaskLine task={task} />
      <TaskProgress task={task} />
      <Clock timer={timer} nowMs={nowMs} />

      {wrap ? (
        <div role="group" aria-label="Wrap up" className="mt-5 rounded-lg border bg-muted/40 p-4">
          {stale && (
            <p className="mb-3 text-sm text-warning">
              This timer has been running for {fmtLong(p.elapsedMs)}. Set how long you actually
              studied.
            </p>
          )}
          <label htmlFor="focus-minutes" className="text-sm font-medium">
            Minutes studied
          </label>
          <Input
            id="focus-minutes"
            type="number"
            inputMode="numeric"
            min={0}
            max={24 * 60}
            value={wrap.minutes}
            onChange={(e) => setWrap({ ...wrap, minutes: e.target.value })}
            className="mt-1.5 w-32"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Pauses are already left out. Under 1 minute isn't logged.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={!minutesOk} onClick={() => save(false)}>
              <Square className="h-4 w-4" /> Save and stop
            </Button>
            <Button disabled={!minutesOk} variant="secondary" onClick={() => save(true)}>
              <Check className="h-4 w-4" /> Save and mark task done
            </Button>
            <Button variant="ghost" onClick={cancelWrap}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          {p.over && !stale && keptGoing !== timer.phaseStartedAt && (
            <div
              role="status"
              className="motion-rise mt-5 rounded-lg border border-signal/60 bg-signal/15 p-4 text-sm"
            >
              <p className="font-medium">Focus block complete.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={takeBreak}>
                  <Coffee className="h-4 w-4" /> Take a {fmtMin(timer.breakMin)} break
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setKeptGoing(timer.phaseStartedAt)}
                >
                  Keep going
                </Button>
              </div>
            </div>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            {running ? (
              <Button variant="secondary" onClick={() => pauseTimer(nowMs)}>
                <Pause className="h-4 w-4" /> Pause
              </Button>
            ) : (
              <Button
                onClick={() => {
                  playSound("start");
                  resumeTimer(nowMs);
                }}
              >
                <Play className="h-4 w-4" /> Resume
              </Button>
            )}
            <Button variant="secondary" onClick={openWrap}>
              <Square className="h-4 w-4" /> Stop
            </Button>
            <PopoutButton />
          </div>
        </>
      )}
    </section>
  );
}

function Break({ timer, task, nowMs }: { timer: TimerState; task: Task; nowMs: number }) {
  const pauseTimer = useTimer((s) => s.pause);
  const resumeTimer = useTimer((s) => s.resume);
  const nextFocus = useTimer((s) => s.nextFocus);
  const clear = useTimer((s) => s.clear);
  const p = progress(timer, nowMs);
  const running = isRunning(timer);
  return (
    <section aria-label="Timer" className={`${CARD} motion-rise`}>
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Coffee className="h-3.5 w-3.5" aria-hidden="true" /> Break
      </div>
      <p className="text-sm text-muted-foreground">
        {p.over ? "Break's over." : "Step away from the screen."} Next up: {task.title}
      </p>
      <Clock timer={timer} nowMs={nowMs} />
      <div className="mt-5 flex flex-wrap gap-2">
        <Button
          onClick={() => {
            playSound("start");
            nextFocus(nowMs);
          }}
        >
          <Play className="h-4 w-4" /> {p.over ? "Start next focus" : "Skip break"}
        </Button>
        {!p.over &&
          (running ? (
            <Button variant="secondary" onClick={() => pauseTimer(nowMs)}>
              <Pause className="h-4 w-4" /> Pause
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => resumeTimer(nowMs)}>
              <Play className="h-4 w-4" /> Resume
            </Button>
          ))}
        <Button variant="ghost" onClick={clear}>
          Done for now
        </Button>
        <PopoutButton />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Today's sessions
// ---------------------------------------------------------------------------------------------

function SessionsToday({ now }: { now: Date }) {
  const sessions = useStore((s) => s.sessions);
  const blocks = useStore((s) => s.blocks);
  const tasks = useStore((s) => s.tasks);
  const deleteSession = useStore((s) => s.deleteSession);
  const today = ymd(now);
  const todays = sessions
    .filter((s) => sessionDate(s) === today)
    .sort((a, z) => z.start.localeCompare(a.start));
  const total = studiedMinOn(today, blocks, sessions);
  const titleOf = (id: string) => tasks.find((t) => t.id === id)?.title ?? "Deleted task";

  return (
    <section aria-label="Today's sessions" className="motion-rise" style={stagger(1)}>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Today's sessions</h2>
        <span className="text-xs text-muted-foreground">Studied today: {fmtMin(total)}</span>
      </div>
      {todays.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          No focus sessions logged yet today.
        </div>
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-xs">
          {todays.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">
                {new Date(s.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="min-w-0 flex-1 truncate">{titleOf(s.taskId)}</span>
              <span className="shrink-0 text-muted-foreground">{fmtMin(s.actualMin)}</span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete session: ${titleOf(s.taskId)}, ${fmtMin(s.actualMin)}`}
                onClick={() => {
                  if (
                    window.confirm(
                      "Delete this session? Its minutes will be removed from your totals.",
                    )
                  )
                    deleteSession(s.id);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
