import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Clock, Play, Timer, Undo2 } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { StarRating } from "@/components/StarRating";
import { Recovery } from "@/components/Recovery";
import { TaskDialog } from "@/components/TaskDialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useNow } from "@/hooks/use-now";
import { buildReview, snapshotDay } from "@/lib/planner/recovery";
import { importanceReason } from "@/lib/planner/explain";
import { buildToday, type TimelineEntry } from "@/lib/planner/today";
import { resolveReview, usePlanLog } from "@/lib/recovery/log";
import type { PlannerWarning } from "@/lib/planner";
import { toMin } from "@/lib/calendar";
import { useStore } from "@/lib/store";
import { SUBJECT_LABEL, type Subject, type Task } from "@/lib/types";

const DOT: Record<Subject, string> = { maths: "bg-maths", physics: "bg-physics", ict: "bg-ict" };
const PLAN_STEP_MS = 5 * 60_000;
const CARD = "rounded-xl border bg-card p-5 shadow-xs";

const minutes = (n: number) =>
  n >= 60 ? `${Math.floor(n / 60)}h ${n % 60 ? `${n % 60}m` : ""}`.trim() : `${n} min`;

function SubjectChip({ subject }: { subject: Subject }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-xs text-foreground/80">
      <span className={`h-2 w-2 rounded-full ${DOT[subject]}`} aria-hidden="true" />
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

function TimelineRow({ entry }: { entry: TimelineEntry }) {
  let title = "";
  let tag = "";
  let subject: Subject | undefined;
  let tone = "";
  if (entry.kind === "event") {
    title = entry.event.title;
    tag = entry.event.kind === "class" ? "Class" : entry.event.kind === "exam" ? "Exam" : "Event";
    subject = entry.event.subject;
    tone = "bg-muted/60";
  } else if (entry.kind === "done") {
    title = entry.task?.title ?? "Study block";
    tag = "Done";
    subject = entry.task?.subject;
    tone = "text-muted-foreground";
  } else {
    title = entry.task?.title ?? "Study block";
    tag =
      entry.state === "active" ? "In progress" : entry.state === "pinned" ? "Pinned" : "Planned";
    subject = entry.task?.subject;
    tone = entry.state === "active" ? "bg-signal/15" : "";
  }
  return (
    <li className={`flex items-center gap-3 px-4 py-3 text-sm ${tone}`}>
      <span className="w-28 shrink-0 font-mono text-xs text-muted-foreground">
        {entry.start}–{entry.end}
      </span>
      {subject && (
        <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[subject]}`} aria-hidden="true" />
      )}
      <span className={`min-w-0 flex-1 truncate ${entry.kind === "done" ? "line-through" : ""}`}>
        {title}
      </span>
      <span className="shrink-0 rounded-md border px-2 py-0.5 text-[11px] text-muted-foreground">
        {tag}
      </span>
    </li>
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

  // Remember what today's plan promised, so tomorrow can ask about what didn't happen.
  const logs = usePlanLog((s) => s.logs);
  const recordPlan = usePlanLog((s) => s.record);
  const clearBefore = usePlanLog((s) => s.clearBefore);
  const [editingId, setEditingId] = useState<string | null>(null);
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

  return (
    <>
      <PageHeader
        title="Today"
        subtitle={now.toLocaleDateString(undefined, {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
      />
      <Recovery
        items={review.items}
        onResolve={(d) => resolveReview(d, view.date, now)}
        onEdit={setEditingId}
      />
      <Warnings items={view.warnings} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {active ? (
            <section aria-label="In progress" className={`${CARD} border-signal/60`}>
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" /> In progress
              </div>
              <h2 className="text-xl font-medium">{active.task.title}</h2>
              <TaskMeta task={active.task} />
              <p className="mt-3 text-sm text-muted-foreground">
                Planned {active.block.start}–{active.block.end}
                {active.overrun &&
                  " · past its planned time. Mark it done, or put it back if you stopped."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
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
            </section>
          ) : next ? (
            <section aria-label="Next task" className={CARD}>
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Next up
              </div>
              <h2 className="text-xl font-medium">{next.task.title}</h2>
              <TaskMeta task={next.task} />
              <p className="mt-3 text-sm">
                {next.isToday
                  ? `${next.startsInMin ? `Starts ${next.block.start}` : "Now"} · ${next.block.start}–${next.block.end} · ${minutes(toMin(next.block.end) - toMin(next.block.start))}`
                  : `Nothing more today. Next study block: ${next.block.date} at ${next.block.start}.`}
              </p>
              {next.block.reasons.length > 0 && (
                <ul aria-label="Why this task" className="mt-3 flex flex-wrap gap-1.5">
                  {next.block.reasons.map((r) => (
                    <li
                      key={r}
                      className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground"
                    >
                      {r === importanceReason(next.task.importance) ? (
                        <StarRating value={next.task.importance} />
                      ) : (
                        r
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {next.isToday && (
                <div className="mt-4">
                  <Button onClick={() => startBlock(next.block)}>
                    <Play className="h-4 w-4" /> Start next task
                  </Button>
                </div>
              )}
            </section>
          ) : (
            <section aria-label="Next task" className={`${CARD} text-sm text-muted-foreground`}>
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

          <section aria-label="Today's timeline">
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">Today's timeline</h2>
            {timeline.length === 0 ? (
              <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
                Nothing scheduled for the rest of today.
              </div>
            ) : (
              <ol className="divide-y rounded-xl border bg-card shadow-xs">
                {timeline.map((e) => (
                  <TimelineRow key={e.key} entry={e} />
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside aria-label="Today at a glance" className="space-y-4">
          <div className={CARD}>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Studied today
            </div>
            <div className="mt-1 text-2xl font-medium">{minutes(stats.doneMin)}</div>
            <Progress
              value={goalPct}
              aria-label="Progress toward today's study goal"
              className="mt-3"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {goalPct}% of your {minutes(stats.dailyGoalMin)} goal · {minutes(stats.plannedMin)}{" "}
              still planned
            </p>
          </div>
          <div className={`${CARD} grid grid-cols-2 gap-4`}>
            <div>
              <div className="text-2xl font-medium">{stats.dueToday}</div>
              <div className="text-xs text-muted-foreground">due today</div>
            </div>
            <div>
              <div
                className={`text-2xl font-medium ${stats.overdue > 0 ? "text-destructive" : ""}`}
              >
                {stats.overdue}
              </div>
              <div className="text-xs text-muted-foreground">overdue</div>
            </div>
          </div>
          {view.didNotFit.length > 0 && (
            <div className={`${CARD} text-sm`}>
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
        initial={tasks.find((t) => t.id === editingId) ?? null}
        onClose={() => setEditingId(null)}
      />
    </>
  );
}
