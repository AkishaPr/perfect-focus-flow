import { Link } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Pencil, Plus, TrendingDown, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { MarkDialog } from "@/components/MarkDialog";
import { DailyBars, MarksChart, WeeklyTrend } from "@/components/ProgressCharts";
import { SUBJECT_BG } from "@/components/subject-colors";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useNow } from "@/hooks/use-now";
import { addDays, studyDayKey, studyDayStart, weekStart } from "@/lib/calendar";
import { formatMinutes, formatPercent, formatPoints } from "@/lib/format";
import { markPercent, marksBySubject, newestFirst, type SubjectMarks } from "@/lib/marks";
import { RECENT_PAPERS } from "@/lib/planner";
import {
  attentionNow,
  studyForWeek,
  weeklyTotals,
  workForWeek,
  type WeekStudy,
  type WorkWeek,
} from "@/lib/progress";
import { uid, useStore } from "@/lib/store";
import { SUBJECTS, SUBJECT_LABEL, type PaperMark } from "@/lib/types";
import { stagger } from "@/lib/motion";

const CARD = "rounded-xl border bg-card p-5 shadow-xs";
const SECTION_TITLE = "mb-3 text-sm font-medium text-muted-foreground";
const SHOWN_MARKS = 8;

/** A blank mark to start the "Add mark" form from: today, out of 100. */
const newMark = (today: Date): PaperMark => ({
  id: uid(),
  subject: "maths",
  paperName: "",
  date: studyDayKey(today),
  score: 0,
  max: 100,
});

const day = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString(undefined, o);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Progress page body. `now` is injectable so tests don't depend on the clock. */
export function ProgressDashboard({ now: nowOverride }: { now?: Date }) {
  const liveNow = useNow();
  const now = nowOverride ?? liveNow;
  const settings = useStore((s) => s.settings);
  const tasks = useStore((s) => s.tasks);
  const blocks = useStore((s) => s.blocks);
  const sessions = useStore((s) => s.sessions);
  const goals = useStore((s) => s.goals);
  const marks = useStore((s) => s.marks);

  const [weeksBack, setWeeksBack] = useState(0);
  const thisMonday = weekStart(studyDayStart(now));
  const anchor = addDays(thisMonday, -7 * weeksBack);

  const week = useMemo(
    () => studyForWeek({ settings, tasks, blocks, sessions }, anchor, now),
    [settings, tasks, blocks, sessions, anchor, now],
  );
  const lastWeekMin = useMemo(
    () => studyForWeek({ settings, tasks, blocks, sessions }, addDays(anchor, -7), now).totalMin,
    [settings, tasks, blocks, sessions, anchor, now],
  );
  const trend = useMemo(() => weeklyTotals({ blocks, sessions }, now, 6), [blocks, sessions, now]);
  const work = useMemo(
    () => workForWeek({ tasks, goals, blocks }, anchor),
    [tasks, goals, blocks, anchor],
  );
  const attention = useMemo(() => attentionNow(tasks, now), [tasks, now]);

  const sunday = addDays(anchor, 6);
  const range = `${day(anchor, { day: "numeric", month: "short" })} – ${day(sunday, { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <>
      <PageHeader
        title="Progress"
        subtitle={weeksBack === 0 ? `This week · ${range}` : range}
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="icon"
              aria-label="Previous week"
              onClick={() => setWeeksBack(weeksBack + 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {weeksBack > 0 && (
              <Button variant="secondary" onClick={() => setWeeksBack(0)}>
                This week
              </Button>
            )}
            <Button
              variant="secondary"
              size="icon"
              aria-label="Next week"
              disabled={weeksBack === 0}
              onClick={() => setWeeksBack(Math.max(0, weeksBack - 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        }
      />
      <div className="space-y-10">
        <StudyTime
          week={week}
          lastWeekMin={lastWeekMin}
          trend={trend}
          isCurrent={weeksBack === 0}
          nothingLogged={sessions.length === 0 && blocks.every((b) => b.status === "planned")}
        />
        <Work work={work} attention={attention} isCurrent={weeksBack === 0} />
        <PaperMarks marks={marks} now={now} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Study time
// ---------------------------------------------------------------------------------------------

function StudyTime({
  week,
  lastWeekMin,
  trend,
  isCurrent,
  nothingLogged,
}: {
  week: WeekStudy;
  lastWeekMin: number;
  trend: { weekStart: string; totalMin: number }[];
  isCurrent: boolean;
  nothingLogged: boolean;
}) {
  const delta = week.totalMin - lastWeekMin;
  const subjectRows = [
    ...SUBJECTS.map((s) => ({
      key: s,
      label: SUBJECT_LABEL[s],
      min: week.bySubject[s],
      cls: SUBJECT_BG[s],
    })),
    ...(week.otherMin > 0
      ? [
          {
            key: "other",
            label: "Deleted tasks",
            min: week.otherMin,
            cls: "bg-muted-foreground/40",
          },
        ]
      : []),
  ];
  return (
    <section aria-label="Study time" className="motion-rise">
      <h2 className={SECTION_TITLE}>Study time</h2>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className={CARD}>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {isCurrent ? "Studied this week" : "Studied that week"}
          </p>
          <p className="mt-1 text-3xl font-medium" data-testid="week-total">
            {formatMinutes(week.totalMin)}
          </p>
          {week.weeklyGoalMin > 0 && (
            <>
              <Progress
                value={Math.min(100, week.goalPct)}
                aria-label="Progress toward the weekly study goal"
                className="mt-3"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                {week.goalPct}% of your {formatMinutes(week.weeklyGoalMin)} weekly goal
              </p>
            </>
          )}
          <dl className="mt-4 space-y-1.5 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Days studied</dt>
              <dd>
                {week.daysStudied} of {week.daysElapsed}
                {isCurrent && week.daysElapsed < 7 ? " so far" : ""}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Previous week</dt>
              <dd>
                {delta === 0
                  ? lastWeekMin === 0
                    ? "nothing logged"
                    : "the same"
                  : `${delta > 0 ? "+" : "−"}${formatMinutes(Math.abs(delta))}`}
              </dd>
            </div>
          </dl>
          {nothingLogged && (
            <p className="mt-4 text-xs text-muted-foreground">
              Study time appears here as you log it.{" "}
              <Link to="/focus" className="underline">
                Start a focus session
              </Link>
            </p>
          )}
        </div>

        <div className={`${CARD} lg:col-span-2`}>
          <h3 className="mb-6 text-sm font-medium">Each day</h3>
          <DailyBars week={week} />
        </div>

        <div className={CARD}>
          <h3 className="mb-3 text-sm font-medium">By subject</h3>
          {week.totalMin === 0 ? (
            <p className="text-sm text-muted-foreground">No study logged this week.</p>
          ) : (
            <ul className="space-y-3">
              {subjectRows.map((r) => (
                <li key={r.key}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${r.cls}`} />
                      {r.label}
                    </span>
                    <span className="text-muted-foreground">
                      {formatMinutes(r.min)} · {Math.round((r.min / week.totalMin) * 100)}%
                    </span>
                  </div>
                  <div
                    aria-hidden="true"
                    className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
                  >
                    <div
                      className={`h-full ${r.cls}`}
                      style={{ width: `${(r.min / week.totalMin) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={`${CARD} lg:col-span-2`}>
          <h3 className="mb-6 text-sm font-medium">Last 6 weeks</h3>
          <WeeklyTrend totals={trend} goalMin={week.weeklyGoalMin} selected={week.weekStart} />
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Completed and missed work
// ---------------------------------------------------------------------------------------------

function Work({
  work,
  attention,
  isCurrent,
}: {
  work: WorkWeek;
  attention: ReturnType<typeof attentionNow>;
  isCurrent: boolean;
}) {
  const tiles: { label: string; value: number; warn: boolean }[] = [
    { label: "Open", value: attention.open, warn: false },
    { label: "Overdue", value: attention.overdue, warn: attention.overdue > 0 },
    { label: "Missed", value: attention.missed, warn: attention.missed > 0 },
    { label: "Stuck", value: attention.stuck, warn: attention.stuck > 0 },
  ];
  return (
    <section aria-label="Completed and missed work" className="motion-rise" style={stagger(1)}>
      <h2 className={SECTION_TITLE}>Completed and missed work</h2>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className={CARD}>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {isCurrent ? "Finished this week" : "Finished that week"}
          </p>
          <p className="mt-1 text-3xl font-medium" data-testid="week-done">
            {plural(work.done, "task")}
          </p>
          {work.doneByType.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {work.doneByType.map((t) => (
                <li key={t.type} className="rounded-full border px-2.5 py-0.5 text-xs capitalize">
                  {t.type} · {t.count}
                </li>
              ))}
            </ul>
          )}
          {work.withDeadline > 0 && (
            <p className="mt-4 text-sm">
              <span className="text-muted-foreground">On time: </span>
              {work.onTime} of {work.withDeadline} with a deadline
            </p>
          )}
          {work.missedBlocks > 0 && (
            <p className="mt-2 text-sm text-warning">
              {plural(work.missedBlocks, "pinned block")} missed (
              {formatMinutes(work.missedBlockMin)})
            </p>
          )}
          {work.done === 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Tasks show here once marked done. Tasks finished before completion times were recorded
              can't be placed in a week.
            </p>
          )}
        </div>

        <div className={CARD}>
          <h3 className="mb-3 text-sm font-medium">Weekly goals</h3>
          {work.goals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No goals set for this week.{" "}
              <Link to="/goals" className="underline">
                Set one
              </Link>
            </p>
          ) : (
            <ul className="space-y-4">
              {work.goals.map(({ goal, progress }) => (
                <li key={goal.id}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">{goal.title}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {progress.done} of {progress.target}
                    </span>
                  </div>
                  <Progress
                    value={progress.percent}
                    aria-label={`Progress on ${goal.title}`}
                    className="mt-1.5"
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={CARD}>
          <h3 className="mb-3 text-sm font-medium">Right now</h3>
          <dl className="grid grid-cols-2 gap-2">
            {tiles.map((t) => (
              <div key={t.label} className="rounded-lg border px-3 py-2">
                <dt className="text-xs text-muted-foreground">{t.label}</dt>
                <dd className={`text-xl font-medium ${t.warn ? "text-warning" : ""}`}>{t.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            Missed tasks were carried over from a day they were planned but not done. Stuck ones
            have been carried over 3 or more times.{" "}
            <Link to="/tasks" className="underline">
              Open Tasks
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Paper marks
// ---------------------------------------------------------------------------------------------

function PaperMarks({ marks, now }: { marks: PaperMark[]; now: Date }) {
  const [editing, setEditing] = useState<{ mark: PaperMark; isNew: boolean } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const bySubject = useMemo(() => marksBySubject(marks), [marks]);
  const sorted = useMemo(() => [...marks].sort(newestFirst), [marks]);
  const shown = showAll ? sorted : sorted.slice(0, SHOWN_MARKS);
  const subjectsWithMarks = bySubject.filter((s) => s.count > 0).length;

  return (
    <section aria-label="Paper marks" className="motion-rise" style={stagger(2)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Paper marks</h2>
        <Button size="sm" onClick={() => setEditing({ mark: newMark(now), isNew: true })}>
          <Plus className="h-4 w-4" /> Add mark
        </Button>
      </div>

      {marks.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          <p>No paper marks yet.</p>
          <p className="mt-1">
            Record your past-paper scores here. The planner uses them to give your weaker subjects
            extra priority.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {bySubject.map((s) => (
              <SubjectCard key={s.subject} s={s} />
            ))}
          </div>
          {subjectsWithMarks === 1 && (
            <p className="text-xs text-muted-foreground">
              Add marks in at least two subjects and the planner can compare them and boost the
              weaker one.
            </p>
          )}

          <div className={CARD}>
            <h3 className="mb-3 text-sm font-medium">Marks over time</h3>
            <MarksChart marks={marks} />
          </div>

          <div>
            <ul
              aria-label="All paper marks"
              className="divide-y rounded-xl border bg-card shadow-xs"
            >
              {shown.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span
                    aria-hidden="true"
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${SUBJECT_BG[m.subject]}`}
                  />
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">
                    {day(new Date(`${m.date}T00:00:00`), {
                      day: "numeric",
                      month: "short",
                      year: "2-digit",
                    })}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{m.paperName || "Untitled paper"}</span>
                    <span className="text-xs text-muted-foreground">
                      {SUBJECT_LABEL[m.subject]}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-medium">{formatPercent(markPercent(m))}</span>
                    <span className="text-xs text-muted-foreground">
                      {m.score} / {m.max}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit mark: ${m.paperName || "Untitled paper"}`}
                    onClick={() => setEditing({ mark: m, isNew: false })}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
            {sorted.length > SHOWN_MARKS && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => setShowAll(!showAll)}
              >
                {showAll ? "Show fewer" : `Show all ${sorted.length}`}
              </Button>
            )}
          </div>
        </div>
      )}

      <MarkDialog
        initial={editing?.mark ?? null}
        isNew={editing?.isNew ?? false}
        onClose={() => setEditing(null)}
      />
    </section>
  );
}

function SubjectCard({ s }: { s: SubjectMarks }) {
  const label = SUBJECT_LABEL[s.subject];
  let change: ReactNode = null;
  if (s.change !== null) {
    const up = s.change >= 0;
    const Icon = up ? TrendingUp : TrendingDown;
    change = (
      <span className="inline-flex items-center gap-1">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {up ? "up" : "down"} {formatPoints(s.change)} points since the previous paper
      </span>
    );
  }
  return (
    <article aria-label={`${label} marks`} className={CARD}>
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${SUBJECT_BG[s.subject]}`} />
        {label}
      </h3>
      {s.count === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No papers recorded yet.</p>
      ) : (
        <>
          <p className="mt-2 text-3xl font-medium">{formatPercent(s.latestPct!)}</p>
          <p className="text-xs text-muted-foreground">
            latest · {plural(s.count, "paper")}
            {s.bestPct !== null && s.count > 1 ? ` · best ${formatPercent(s.bestPct)}` : ""}
          </p>
          {s.count > 1 && (
            <p className="mt-3 text-sm">
              <span className="text-muted-foreground">
                Average of last {Math.min(s.count, RECENT_PAPERS)}:{" "}
              </span>
              {formatPercent(s.recentAvg!)}
            </p>
          )}
          {change && <p className="mt-1 text-xs text-muted-foreground">{change}</p>}
          {s.plannerBoost && s.gapToBest !== null && (
            <p className="mt-3 rounded-md border border-warning/50 bg-warning/10 px-2.5 py-1.5 text-xs">
              About {formatPoints(s.gapToBest)} points behind your strongest subject, so the planner
              gives {label} tasks extra priority.
            </p>
          )}
        </>
      )}
    </article>
  );
}
