import { fmtDur } from "@/lib/planner";

interface Props {
  plannedMin: number;
  freeMin: number;
  capacityMin: number;
  openTasks: number;
  unscheduled: number;
  late: number;
}

function Ring({ value }: { value: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, Math.max(0, value));
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90" aria-hidden="true">
      <circle cx="32" cy="32" r={r} className="fill-none stroke-muted" strokeWidth="6" />
      <circle
        cx="32"
        cy="32"
        r={r}
        className="fill-none stroke-primary transition-[stroke-dashoffset] duration-700 ease-out"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
      />
    </svg>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="flex flex-col justify-center gap-1 px-5 py-4">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`font-mono text-2xl font-semibold tabular-nums ${tone ?? ""}`}>{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function PlanStats({ plannedMin, freeMin, capacityMin, openTasks, unscheduled, late }: Props) {
  const usable = Math.min(freeMin, capacityMin) || freeMin;
  const util = usable > 0 ? plannedMin / usable : 0;
  return (
    <section
      aria-label="Plan summary"
      className="mb-6 grid grid-cols-2 divide-x divide-y overflow-hidden rounded-xl border bg-card sm:grid-cols-3 sm:divide-y-0 lg:grid-cols-5"
    >
      <div className="col-span-2 flex items-center gap-4 px-5 py-4 sm:col-span-1">
        <div className="relative">
          <Ring value={util} />
          <span className="absolute inset-0 flex items-center justify-center font-mono text-xs font-semibold">
            {Math.round(util * 100)}%
          </span>
        </div>
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Utilisation</div>
          <div className="text-sm">of usable study time</div>
        </div>
      </div>
      <Stat label="Planned" value={fmtDur(plannedMin)} hint={`across ${openTasks} open tasks`} tone="text-primary" />
      <Stat label="Free time" value={fmtDur(freeMin)} hint={`cap ${fmtDur(capacityMin)}`} />
      <Stat
        label="Unscheduled"
        value={String(unscheduled)}
        hint={unscheduled ? "need more time" : "everything fits"}
        tone={unscheduled ? "text-warning" : "text-success"}
      />
      <Stat
        label="Past deadline"
        value={String(late)}
        hint={late ? "blocks after due date" : "all on time"}
        tone={late ? "text-destructive" : "text-success"}
      />
    </section>
  );
}
