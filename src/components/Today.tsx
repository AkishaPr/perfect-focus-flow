import { Link } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Play, Plus, Timer, Undo2 } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { ProgressRing } from "@/components/ProgressRing";
import { StarRating } from "@/components/StarRating";
import { Recovery } from "@/components/Recovery";
import { blankTask, TaskDialog } from "@/components/TaskDialog";
import { SUBJECT_BG, SUBJECT_BLOCK, SUBJECT_EVENT } from "@/components/subject-colors";
import { Button } from "@/components/ui/button";
import { useNow } from "@/hooks/use-now";
import { buildReview, snapshotDay } from "@/lib/planner/recovery";
import { importanceReason } from "@/lib/planner/explain";
import { buildToday, overdueTasks, type ActiveWork, type TimelineEntry } from "@/lib/planner/today";
import { studyForWeek, type DayStudy, type WeekStudy } from "@/lib/progress";
import { resolveReview, usePlanLog } from "@/lib/recovery/log";
import type { PlannerWarning } from "@/lib/planner";
import { dayMin, studyDayStart, studyMinute } from "@/lib/calendar";
import { useStore } from "@/lib/store";
import { stagger } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { SUBJECTS, SUBJECT_LABEL, type Subject, type Task } from "@/lib/types";

const PLAN_STEP_MS = 5 * 60_000;
const CARD = "rounded-xl border bg-card p-5 shadow-xs";
const EYEBROW = "text-xs font-medium uppercase tracking-wide text-muted-foreground";
// The accent means "now". In the light theme the bright accent is too pale for text and thin
// shapes on white, so those use the darker `warning` amber; the dark theme uses the accent itself.
const SIGNAL_TEXT = "text-warning dark:text-signal";
const SIGNAL_FILL = "bg-warning dark:bg-signal";

const minutes = (n: number) =>
  n >= 60 ? `${Math.floor(n / 60)}h ${n % 60 ? `${n % 60}m` : ""}`.trim() : `${n} min`;
/** Fixed-width style for legends and charts: "1h 05m", "45m". */
const hm = (n: number) =>
  n >= 60 ? `${Math.floor(n / 60)}h ${String(n % 60).padStart(2, "0")}m` : `${n}m`;
const clock = (d: Date) =>
  d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
const dayName = (date: string, weekday: "narrow" | "long") =>
  new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday });

function SubjectChip({ subject }: { subject: Subject }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-xs text-foreground/80">
      <span className={`h-2 w-2 rounded-full ${SUBJECT_BG[subject]}`} aria-hidden="true" />
      {SUBJECT_LABEL[subject]}
    </span>
  );
}

function TaskMeta({ task }: { task: Task }) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <SubjectChip subject={task.subject} />
      {task.topic && <span>· {task.topic}</span>}
      <span className="capitalize">· {task.type}</span>
    </div>
  );
}

function Warnings({ items }: { items: PlannerWarning[] }) {
  if (items.length === 0) return null;
  const shown = items.slice(0, 4);
  return (
    <section
      aria-label="Planner warnings"
      className="mb-6 rounded-xl border border-warning/50 bg-warning/10 p-4 text-sm"
    >
      <ul className="space-y-1.5">
        {shown.map((w, i) => (
          <li key={`${w.code}:${w.taskId ?? i}`} className="flex gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <span className="font-medium">
                {w.severity === "high"
                  ? "Needs attention: "
                  : w.severity === "medium"
                    ? "Heads up: "
                    : "Note: "}
              </span>
              {w.message}
            </span>
          </li>
        ))}
      </ul>
      {items.length > shown.length && (
        <p className="mt-2 text-xs text-muted-foreground">
          and {items.length - shown.length} more.
        </p>
      )}
    </section>
  );
}

const ROW = "grid grid-cols-[3.5rem_1rem_minmax(0,1fr)] gap-x-3";

function describe(entry: TimelineEntry) {
  let title = "";
  let tag = "";
  let subject: Subject | undefined;
  let tone = "border-l-border bg-card";
  let done = false;
  let active = false;
  if (entry.kind === "event") {
    title = entry.event.title;
    tag = entry.event.kind === "class" ? "Class" : entry.event.kind === "exam" ? "Exam" : "Event";
    subject = entry.event.subject;
    tone = subject ? SUBJECT_EVENT[subject] : "border-l-muted-foreground bg-muted/60";
  } else if (entry.kind === "done") {
    title = entry.task?.title ?? "Study block";
    tag = "Done";
    subject = entry.task?.subject;
    done = true;
    tone = subject
      ? `${SUBJECT_BLOCK[subject]} text-muted-foreground`
      : "border-l-border bg-card text-muted-foreground";
  } else {
    title = entry.task?.title ?? "Study block";
    tag =
      entry.state === "active" ? "In progress" : entry.state === "pinned" ? "Pinned" : "Planned";
    subject = entry.task?.subject;
    active = entry.state === "active";
    tone = subject ? SUBJECT_BLOCK[subject] : "border-l-border bg-card";
  }
  return { title, tag, subject, tone, done, active };
}

function TimelineRow({ entry }: { entry: TimelineEntry }) {
  const { title, tag, subject, tone, done, active } = describe(entry);
  const dot = active ? SIGNAL_FILL : subject ? SUBJECT_BG[subject] : "bg-muted-foreground";
  return (
    <li className={ROW}>
      <div className="pt-3.5 text-right font-mono text-xs leading-tight text-muted-foreground">
        <span className="sr-only">
          {entry.start}–{entry.end}
        </span>
        <span aria-hidden="true">
          {entry.start}
          <br />
          <span className="opacity-70">{entry.end}</span>
        </span>
      </div>
      <div className="relative" aria-hidden="true">
        <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
        <span
          className={cn(
            "absolute left-1/2 top-4 -translate-x-1/2 rounded-full ring-4 ring-background",
            active ? "h-3 w-3" : "h-2.5 w-2.5",
            dot,
          )}
        />
      </div>
      <div
        className={cn(
          "mb-2.5 flex items-center gap-3 rounded-lg border border-l-4 px-4 py-3 text-sm",
          tone,
          active && "border-signal/60",
        )}
      >
        {done && <Check className="motion-pop h-4 w-4 shrink-0" aria-hidden="true" />}
        <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2.5 py-0.5 text-[11px]",
            active ? `border-signal ${SIGNAL_TEXT}` : "text-muted-foreground",
          )}
        >
          {tag}
        </span>
      </div>
    </li>
  );
}

function NowMarker({ time }: { time: string }) {
  return (
    <li className={`${ROW} items-center py-0.5`}>
      <span className={`text-right font-mono text-xs font-medium ${SIGNAL_TEXT}`}>
        <span className="sr-only">Current time </span>
        {time}
      </span>
      <span
        className={`h-2.5 w-2.5 justify-self-center rounded-full ${SIGNAL_FILL}`}
        aria-hidden="true"
      />
      <span className="mb-0 h-px bg-warning/50 dark:bg-signal/50" aria-hidden="true" />
    </li>
  );
}

/** Why-this-task chips. The importance chip is shown as stars, never as a bare number. */
function Reasons({ reasons, importance }: { reasons: string[]; importance: number }) {
  if (reasons.length === 0) return null;
  return (
    <ul aria-label="Why this task" className="flex flex-wrap gap-1.5">
      {reasons.map((r) => (
        <li key={r} className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground">
          {r === importanceReason(importance) ? <StarRating value={importance} /> : r}
        </li>
      ))}
    </ul>
  );
}

/** Where we are inside the planned block. Read from the clock and the plan, not the focus timer. */
function BlockRing({ active, now, today }: { active: ActiveWork; now: Date; today: string }) {
  const R = 54;
  const C = 2 * Math.PI * R;
  const start = dayMin(active.block.start);
  const end = dayMin(active.block.end);
  const nowMin = studyMinute(now);
  const span = Math.max(1, end - start);
  const earlierDay = active.block.date < today;
  const pct = earlierDay ? 1 : Math.min(1, Math.max(0, (nowMin - start) / span));
  const left = Math.min(span, end - nowMin);
  const over = !earlierDay && left <= 0;
  const label = earlierDay ? "Over" : over ? `+${hm(-left)}` : hm(left);
  const caption = earlierDay ? "from an earlier day" : over ? "past planned end" : "left in block";
  return (
    <div
      role="img"
      aria-label={`${label} ${caption}`}
      className="relative h-36 w-36 shrink-0 self-center"
    >
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r={R} fill="none" strokeWidth="8" className="stroke-muted" />
        <circle
          cx="60"
          cy="60"
          r={R}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${C * pct} ${C}`}
          className="motion-ring stroke-warning dark:stroke-signal"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-mono text-2xl font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">{caption}</span>
      </div>
    </div>
  );
}

function StudyBar({
  pct,
  parts,
}: {
  pct: number;
  parts: { key: string; min: number; className: string }[];
}) {
  return (
    <div
      role="progressbar"
      aria-label="Progress toward today's study goal"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className="mt-4 h-2.5 overflow-hidden rounded-full bg-muted"
    >
      <div
        className="motion-grow-x flex h-full gap-0.5 transition-transform duration-500 ease-out"
        style={{ transform: `scaleX(${pct / 100})` }}
      >
        {parts
          .filter((p) => p.min > 0)
          .map((p) => (
            <span key={p.key} className={p.className} style={{ flexGrow: p.min, flexBasis: 0 }} />
          ))}
      </div>
    </div>
  );
}

function WeekRhythm({ week, today }: { week: WeekStudy; today: string }) {
  const scale = Math.max(week.dailyGoalMin, ...week.days.map((d) => d.totalMin), 1);
  const summary = week.days
    .map((d) => `${dayName(d.date, "long")} ${d.isFuture ? "not yet" : minutes(d.totalMin)}`)
    .join(", ");
  const bar = (d: DayStudy) =>
    d.isFuture
      ? "h-1 border border-dashed border-muted-foreground/60"
      : d.totalMin === 0
        ? "bg-muted"
        : d.date === today
          ? SIGNAL_FILL
          : "bg-foreground/80";
  return (
    <div className={`${CARD} motion-rise`} style={stagger(3)}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className={EYEBROW}>This week</h2>
        <span className="font-mono text-xs text-muted-foreground">
          {minutes(week.totalMin)}
          {week.weeklyGoalMin > 0 && ` / ${minutes(week.weeklyGoalMin)}`}
        </span>
      </div>
      <div
        role="img"
        aria-label={`Study time per day. ${summary}`}
        className="mt-4 grid h-20 grid-cols-7 items-end gap-2"
      >
        {week.days.map((d, i) => (
          <div key={d.date} className="flex h-full items-end">
            <span
              className={cn("motion-grow-y block w-full rounded-t-md", bar(d))}
              style={{
                ...(d.isFuture
                  ? {}
                  : { height: `${Math.max(5, Math.round((d.totalMin / scale) * 100))}%` }),
                ...stagger(i),
              }}
            />
          </div>
        ))}
      </div>
      <div
        className="mt-1.5 grid grid-cols-7 gap-2 text-center text-[11px] text-muted-foreground"
        aria-hidden="true"
      >
        {week.days.map((d) => (
          <span key={d.date} className={d.date === today ? `font-semibold ${SIGNAL_TEXT}` : ""}>
            {dayName(d.date, "narrow")}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The Today page body. `now` is injectable so tests don't depend on the clock. */
export function Today({ now: nowOverride }: { now?: Date }) {
  const liveNow = useNow();
  const now = nowOverride ?? liveNow;
  const settings = useStore((s) => s.settings);
  const events = useStore((s) => s.events);
  const tasks = useStore((s) => s.tasks);
  const goals = useStore((s) => s.goals);
  const blocks = useStore((s) => s.blocks);
  const sessions = useStore((s) => s.sessions);
  const marks = useStore((s) => s.marks);
  const startBlock = useStore((s) => s.startBlock);
  const releaseBlock = useStore((s) => s.releaseBlock);
  const completeBlock = useStore((s) => s.completeBlock);

  // Plan from the last 5-minute mark so the plan holds still between ticks instead of shifting every minute.
  const step = Math.floor(now.getTime() / PLAN_STEP_MS);
  const planNow = useMemo(() => new Date(step * PLAN_STEP_MS), [step]);
  const view = useMemo(
    () => buildToday({ settings, events, tasks, goals, blocks, sessions, marks }, planNow),
    [settings, events, tasks, goals, blocks, sessions, marks, planNow],
  );
  const { active, next, stats, timeline } = view;

  // Study per day and per subject comes from the same module as the Progress page, so the two
  // can never disagree about how long you studied.
  const week = useMemo(
    () => studyForWeek({ tasks, blocks, sessions, settings }, planNow, planNow),
    [tasks, blocks, sessions, settings, planNow],
  );
  const todayStudy = week.days.find((d) => d.date === view.date);
  const overdue = useMemo(() => overdueTasks(tasks, view.date), [tasks, view.date]);

  // Remember what today's plan promised, so tomorrow can ask about what didn't happen.
  const logs = usePlanLog((s) => s.logs);
  const recordPlan = usePlanLog((s) => s.record);
  const clearBefore = usePlanLog((s) => s.clearBefore);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Task | null>(null);
  const snapshot = useMemo(() => snapshotDay(view.plan, view.date), [view.plan, view.date]);
  useEffect(() => {
    if (snapshot) recordPlan(snapshot);
  }, [snapshot, recordPlan]);
  const review = useMemo(
    () => buildReview(logs, { tasks, blocks, sessions }, view.date),
    [logs, tasks, blocks, sessions, view.date],
  );
  // Earlier days with nothing left to ask about are finished: forget them.
  useEffect(() => {
    if (review.pastDates.length > 0 && review.items.length === 0) clearBefore(view.date);
  }, [review, clearBefore, view.date]);
  const goalPct =
    stats.dailyGoalMin > 0
      ? Math.min(100, Math.round((stats.doneMin / stats.dailyGoalMin) * 100))
      : 0;
  const openTasks = tasks.filter((t) => t.status !== "done").length;

  // A "now" line goes where the clock is, unless a block is in progress (it carries the marker).
  const nowMin = studyMinute(now);
  const activeEntry = timeline.find(
    (e): e is Extract<TimelineEntry, { kind: "block" }> =>
      e.kind === "block" && e.state === "active",
  );
  const markerAt = activeEntry
    ? -1
    : (() => {
        const i = timeline.findIndex((e) => dayMin(e.start) >= nowMin);
        return i === -1 ? timeline.length : i;
      })();
  const activeReasons = activeEntry?.reasons ?? [];
  const activeMin = active ? dayMin(active.block.end) - dayMin(active.block.start) : 0;

  return (
    <>
      <PageHeader
        title="Today"
        subtitle={`${studyDayStart(now).toLocaleDateString(undefined, {
          weekday: "long",
          day: "numeric",
          month: "long",
        })} · ${clock(now)}`}
        action={
          <Button onClick={() => setDraft(blankTask())}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add task
          </Button>
        }
      />
      <Recovery
        items={review.items}
        onResolve={(d) => resolveReview(d, view.date, now)}
        onEdit={setEditingId}
      />
      <Warnings items={view.warnings} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 space-y-7">
          {active ? (
            <section
              key="active"
              aria-label="In progress"
              className={`motion-rise ${CARD} flex flex-col-reverse gap-6 border-signal/60 p-6 shadow-glow sm:flex-row sm:items-center sm:justify-between`}
            >
              <div className="min-w-0">
                <div className={`flex items-center gap-2 ${EYEBROW} ${SIGNAL_TEXT}`}>
                  <span
                    className={`h-2 w-2 rounded-full motion-safe:animate-pulse ${SIGNAL_FILL}`}
                    aria-hidden="true"
                  />
                  In progress
                </div>
                <h2 className="mt-2.5 text-2xl font-semibold leading-tight">{active.task.title}</h2>
                <TaskMeta task={active.task} />
                <p className="mt-3 text-sm text-muted-foreground">
                  Planned {active.block.start}–{active.block.end}
                  {active.overrun &&
                    " · past its planned time. Mark it done, or put it back if you stopped."}
                </p>
                <div className="mt-3">
                  <Reasons reasons={activeReasons} importance={active.task.importance} />
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button onClick={() => completeBlock(active.block.id, now)}>
                    <Check className="h-4 w-4" /> Mark done
                  </Button>
                  <Button variant="secondary" onClick={() => releaseBlock(active.block.id)}>
                    <Undo2 className="h-4 w-4" /> Put back
                  </Button>
                  <Button asChild variant="ghost">
                    <Link to="/focus">
                      <Timer className="h-4 w-4" /> Open timer
                    </Link>
                  </Button>
                </div>
              </div>
              <BlockRing active={active} now={now} today={view.date} />
            </section>
          ) : next ? (
            <section key="next" aria-label="Next task" className={`motion-rise ${CARD} p-6`}>
              <div className={EYEBROW}>Next up</div>
              <h2 className="mt-2.5 text-2xl font-semibold leading-tight">{next.task.title}</h2>
              <TaskMeta task={next.task} />
              <p className="mt-3 text-sm">
                {next.isToday
                  ? `${next.startsInMin ? `Starts ${next.block.start}` : "Now"} · ${next.block.start}–${next.block.end} · ${minutes(dayMin(next.block.end) - dayMin(next.block.start))}`
                  : `Nothing more today. Next study block: ${next.block.date} at ${next.block.start}.`}
              </p>
              <div className="mt-3">
                <Reasons reasons={next.block.reasons} importance={next.task.importance} />
              </div>
              {next.isToday && (
                <div className="mt-5">
                  <Button onClick={() => startBlock(next.block)}>
                    <Play className="h-4 w-4" /> Start next task
                  </Button>
                </div>
              )}
            </section>
          ) : (
            <section
              key="empty"
              aria-label="Next task"
              className={`motion-rise ${CARD} text-sm text-muted-foreground`}
            >
              {openTasks === 0 ? (
                <>
                  Nothing to plan yet.{" "}
                  <Link to="/tasks" className="underline">
                    Add a task
                  </Link>{" "}
                  and it will be scheduled around your classes.
                </>
              ) : (
                <>
                  Nothing is scheduled. Check your study windows in{" "}
                  <Link to="/settings" className="underline">
                    Settings
                  </Link>
                  , or see what's blocking in{" "}
                  <Link to="/tasks" className="underline">
                    Tasks
                  </Link>
                  .
                </>
              )}
            </section>
          )}

          <section aria-label="Today's timeline" className="motion-rise" style={stagger(1)}>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-semibold">Today's timeline</h2>
              {activeMin > 0 && (
                <span className="text-xs text-muted-foreground">
                  {minutes(stats.plannedMin)} still planned
                </span>
              )}
            </div>
            {timeline.length === 0 ? (
              <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
                Nothing scheduled for the rest of today.
              </div>
            ) : (
              <ol>
                {timeline.map((e, i) => (
                  <Fragment key={e.key}>
                    {i === markerAt && <NowMarker time={clock(now)} />}
                    <TimelineRow entry={e} />
                  </Fragment>
                ))}
                {markerAt === timeline.length && <NowMarker time={clock(now)} />}
              </ol>
            )}
          </section>
        </div>

        <aside aria-label="Today at a glance" className="space-y-4">
          <div className={`${CARD} motion-rise`} style={stagger(1)}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className={EYEBROW}>Studied today</div>
                <div className="mt-1.5 text-4xl font-semibold leading-none">
                  {minutes(stats.doneMin)}
                </div>
              </div>
              {/* Fills as the day's work gets done and turns green when the goal is met. The
                  percentage is written out below, so the ring itself stays out of the way. */}
              <ProgressRing
                pct={goalPct / 100}
                className="h-14 w-14"
                barClassName={
                  goalPct >= 100 ? "stroke-success" : "stroke-warning dark:stroke-signal"
                }
              >
                {goalPct >= 100 && <Check className="motion-pop h-5 w-5 text-success" />}
              </ProgressRing>
            </div>
            <StudyBar
              pct={goalPct}
              parts={[
                ...SUBJECTS.map((s) => ({
                  key: s,
                  min: todayStudy?.bySubject[s] ?? 0,
                  className: SUBJECT_BG[s],
                })),
                { key: "other", min: todayStudy?.otherMin ?? 0, className: "bg-muted-foreground" },
              ]}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {goalPct}% of your {minutes(stats.dailyGoalMin)} goal · {minutes(stats.plannedMin)}{" "}
              still planned
            </p>
            <ul className="mt-3 space-y-1 text-sm">
              {SUBJECTS.map((s) => (
                <li key={s} className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${SUBJECT_BG[s]}`} aria-hidden="true" />
                    {SUBJECT_LABEL[s]}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {hm(todayStudy?.bySubject[s] ?? 0)}
                  </span>
                </li>
              ))}
              {(todayStudy?.otherMin ?? 0) > 0 && (
                <li className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-muted-foreground" aria-hidden="true" />
                    Other
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {hm(todayStudy?.otherMin ?? 0)}
                  </span>
                </li>
              )}
            </ul>
          </div>

          <div className={`${CARD} motion-rise`} style={stagger(2)}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-3xl font-semibold leading-none">{stats.dueToday}</div>
                <div className="mt-1 text-xs text-muted-foreground">due today</div>
              </div>
              <div>
                <div
                  className={`text-3xl font-semibold leading-none ${stats.overdue > 0 ? "text-destructive" : ""}`}
                >
                  {stats.overdue}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">overdue</div>
              </div>
            </div>
            {overdue[0] && (
              <div className="mt-4 border-t pt-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${SUBJECT_BG[overdue[0].task.subject]}`}
                        aria-hidden="true"
                      />
                      <span className="truncate">{overdue[0].task.title}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-destructive">
                      {overdue[0].daysOverdue} {overdue[0].daysOverdue === 1 ? "day" : "days"}{" "}
                      overdue
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setEditingId(overdue[0]!.task.id)}
                  >
                    Reschedule
                  </Button>
                </div>
                {overdue.length > 1 && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    and {overdue.length - 1} more in{" "}
                    <Link to="/tasks" className="underline">
                      Tasks
                    </Link>
                    .
                  </p>
                )}
              </div>
            )}
          </div>

          <WeekRhythm week={week} today={view.date} />

          {view.didNotFit.length > 0 && (
            <div className={`${CARD} motion-rise text-sm`} style={stagger(4)}>
              <div className="font-medium">
                {view.didNotFit.length}{" "}
                {view.didNotFit.length === 1 ? "task doesn't" : "tasks don't"} fit this week
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Free some time, shrink an estimate, or move a deadline in{" "}
                <Link to="/tasks" className="underline">
                  Tasks
                </Link>
                .
              </p>
            </div>
          )}
        </aside>
      </div>
      <TaskDialog
        initial={draft ?? tasks.find((t) => t.id === editingId) ?? null}
        onClose={() => {
          setEditingId(null);
          setDraft(null);
        }}
      />
    </>
  );
}
