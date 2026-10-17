import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check, Eraser, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { PlanStats } from "@/components/planner/PlanStats";
import { PlanTimeline } from "@/components/planner/PlanTimeline";
import { PriorityQueue } from "@/components/planner/PriorityQueue";
import { UnscheduledPanel } from "@/components/planner/UnscheduledPanel";
import { WeightTuner } from "@/components/planner/WeightTuner";
import { useStore } from "@/lib/store";
import { addDays, toMin, ymd } from "@/lib/calendar";
import { diffPlan, isOpen, isReplaceable, planRange, rankTasks, remainingMinutes } from "@/lib/planner";
import type { Weights } from "@/lib/types";

export const Route = createFileRoute("/planner")({
  head: () => ({
    meta: [
      { title: "Planner — A/L Command Center" },
      { name: "description", content: "Auto-plan study blocks around classes, deadlines and weak topics." },
      { property: "og:title", content: "Planner — A/L Command Center" },
      { property: "og:description", content: "Auto-plan study blocks around classes, deadlines and weak topics." },
    ],
  }),
  component: PlannerPage,
});

const HORIZONS = [
  { days: 1, label: "Today" },
  { days: 3, label: "3 days" },
  { days: 7, label: "Week" },
] as const;

function PlannerPage() {
  const settings = useStore((s) => s.settings);
  const events = useStore((s) => s.events);
  const tasks = useStore((s) => s.tasks);
  const goals = useStore((s) => s.goals);
  const blocks = useStore((s) => s.blocks);
  const applyPlan = useStore((s) => s.applyPlan);
  const clearPlanned = useStore((s) => s.clearPlanned);
  const updateSettings = useStore((s) => s.updateSettings);

  const [horizon, setHorizon] = useState<number>(3);
  const [weights, setWeights] = useState<Weights>(settings.weights);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!applied) return;
    const id = setTimeout(() => setApplied(false), 2200);
    return () => clearTimeout(id);
  }, [applied]);

  const tuned = useMemo(() => ({ ...settings, weights }), [settings, weights]);
  const start = useMemo(() => new Date(now.getFullYear(), now.getMonth(), now.getDate()), [now]);
  const dates = useMemo(() => Array.from({ length: horizon }, (_, i) => ymd(addDays(start, i))), [start, horizon]);

  const plan = useMemo(
    () => planRange({ start, days: horizon, now, settings: tuned, events, tasks, goals, blocks }),
    [start, horizon, now, tuned, events, tasks, goals, blocks],
  );

  const proposed = useMemo(() => plan.days.flatMap((d) => d.blocks), [plan]);
  const diff = useMemo(() => diffPlan(blocks, proposed, dates, now), [blocks, proposed, dates, now]);
  const scope = useMemo(() => new Set(dates), [dates]);
  const locked = useMemo(
    () => blocks.filter((b) => scope.has(b.date) && !isReplaceable(b, scope, now)),
    [blocks, scope, now],
  );

  const ranked = useMemo(() => rankTasks(tasks, { date: start, settings: tuned, goals, tasks }), [tasks, start, tuned, goals]);
  const taskMap = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const remaining = useMemo(() => remainingMinutes(tasks, blocks), [tasks, blocks]);
  const plannedByTask = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of proposed) m.set(b.taskId, (m.get(b.taskId) ?? 0) + toMin(b.end) - toMin(b.start));
    return m;
  }, [proposed]);

  const capacity = settings.maxDailyStudyMin * horizon;
  const inSync = diff.added === 0 && diff.removed === 0;
  const openCount = tasks.filter(isOpen).length;

  const apply = () => {
    applyPlan(proposed, dates, now);
    setApplied(true);
  };

  return (
    <>
      <PageHeader
        title="Planner"
        subtitle="Ranks open work, then packs it into free study windows around your classes."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div role="radiogroup" aria-label="Planning horizon" className="flex rounded-lg border bg-card p-1">
              {HORIZONS.map((h) => (
                <button
                  key={h.days}
                  type="button"
                  role="radio"
                  aria-checked={horizon === h.days}
                  onClick={() => setHorizon(h.days)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    horizon === h.days ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {h.label}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={() => clearPlanned(dates, now)} aria-label="Clear saved planned blocks in this horizon">
              <Eraser className="h-4 w-4" /> Clear
            </Button>
            <Button onClick={apply} disabled={inSync || proposed.length === 0} className={inSync ? "" : "shadow-glow"}>
              {applied ? <Check className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              {applied ? "Applied" : inSync ? "Plan saved" : "Apply plan"}
              {!inSync && !applied && (
                <span className="ml-1 rounded bg-primary-foreground/15 px-1.5 font-mono text-[11px]">
                  +{diff.added} −{diff.removed}
                </span>
              )}
            </Button>
          </div>
        }
      />

      {openCount === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <Sparkles className="mx-auto mb-3 h-6 w-6 text-primary" />
          <p className="font-medium">Nothing to plan yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add homework, papers or revision in{" "}
            <Link to="/tasks" className="text-primary underline-offset-4 hover:underline">Tasks</Link>{" "}
            and the planner will schedule them automatically.
          </p>
        </div>
      ) : (
        <>
          <PlanStats
            plannedMin={plan.plannedMin}
            freeMin={plan.freeMin}
            capacityMin={capacity}
            openTasks={openCount}
            unscheduled={plan.unscheduled.length}
            late={new Set(plan.late.map((l) => l.task.id)).size}
          />

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="flex min-w-0 flex-col gap-6">
              <div>
                <div className="mb-3 flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-dashed border-primary/40" /> Free window</span>
                  <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border bg-[repeating-linear-gradient(135deg,var(--muted)_0_3px,transparent_3px_6px)]" /> Class / event</span>
                  <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-primary/40" /> Proposed block</span>
                  <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-muted-foreground/40" /> Locked (past / done)</span>
                  {focusId && (
                    <button type="button" onClick={() => setFocusId(null)} className="ml-auto text-primary hover:underline">
                      Clear highlight
                    </button>
                  )}
                </div>
                <PlanTimeline
                  days={plan.days}
                  settings={tuned}
                  events={events}
                  locked={locked}
                  tasks={taskMap}
                  focusId={focusId}
                  onFocus={setFocusId}
                  now={now}
                />
              </div>
              <UnscheduledPanel unscheduled={plan.unscheduled} late={plan.late} onFocus={setFocusId} />
            </div>

            <aside className="flex flex-col gap-6">
              <PriorityQueue
                ranked={ranked}
                plannedByTask={plannedByTask}
                remainingByTask={remaining}
                focusId={focusId}
                onFocus={setFocusId}
              />
              <WeightTuner
                weights={weights}
                saved={settings.weights}
                onChange={setWeights}
                onSave={() => updateSettings({ weights })}
              />
            </aside>
          </div>
        </>
      )}
    </>
  );
}
