import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { REASON_LABEL, fmtDur, type LateBlock, type Unscheduled } from "@/lib/planner";
import { SUBJECT_DOT } from "./theme";

interface Props {
  unscheduled: Unscheduled[];
  late: LateBlock[];
  onFocus: (id: string) => void;
}

export function UnscheduledPanel({ unscheduled, late, onFocus }: Props) {
  if (unscheduled.length === 0 && late.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/5 px-4 py-3 text-sm">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
        <span>Every open task fits in this horizon, before its deadline.</span>
      </div>
    );
  }

  const lateTasks = [...new Map(late.map((l) => [l.task.id, l])).values()];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {unscheduled.length > 0 && (
        <section aria-labelledby="unsched-title" className="rounded-xl border border-warning/30 bg-card">
          <header className="flex items-center gap-2 border-b px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <h2 id="unsched-title" className="text-sm font-semibold">Didn&apos;t fit</h2>
            <span className="ml-auto text-xs text-muted-foreground">{fmtDur(unscheduled.reduce((s, u) => s + u.remainingMin, 0))} short</span>
          </header>
          <ul className="divide-y">
            {unscheduled.map((u) => (
              <li key={u.task.id}>
                <button type="button" onClick={() => onFocus(u.task.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-accent/50">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${SUBJECT_DOT[u.task.subject]}`} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{u.task.title}</div>
                    <div className="text-[11px] text-muted-foreground">{REASON_LABEL[u.reason]}</div>
                  </div>
                  <span className="font-mono text-xs text-warning">{fmtDur(u.remainingMin)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {lateTasks.length > 0 && (
        <section aria-labelledby="late-title" className="rounded-xl border border-destructive/30 bg-card">
          <header className="flex items-center gap-2 border-b px-4 py-3">
            <Clock className="h-4 w-4 text-destructive" />
            <h2 id="late-title" className="text-sm font-semibold">Scheduled after deadline</h2>
          </header>
          <ul className="divide-y">
            {lateTasks.map(({ task, block }) => (
              <li key={task.id}>
                <button type="button" onClick={() => onFocus(task.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-accent/50">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${SUBJECT_DOT[task.subject]}`} />
                  <span className="min-w-0 flex-1 truncate text-sm">{task.title}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    due {task.deadline} · placed {block.date}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
