import { FACTORS, FACTOR_LABEL, fmtDur, type RankedTask } from "@/lib/planner";
import { FACTOR_COLOR, SUBJECT_DOT } from "./theme";

interface Props {
  ranked: RankedTask[];
  plannedByTask: Map<string, number>;
  remainingByTask: Map<string, number>;
  focusId: string | null;
  onFocus: (id: string | null) => void;
}

export function PriorityQueue({ ranked, plannedByTask, remainingByTask, focusId, onFocus }: Props) {
  const max = Math.max(1, ...ranked.map((r) => r.score.total));
  return (
    <section aria-labelledby="queue-title" className="rounded-xl border bg-card">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <h2 id="queue-title" className="text-sm font-semibold">Priority queue</h2>
        <span className="text-xs text-muted-foreground">{ranked.length} open</span>
      </header>
      {ranked.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">No open tasks to rank.</p>
      ) : (
        <ol className="max-h-[520px] divide-y overflow-y-auto">
          {ranked.map(({ task, score, rank }) => {
            const planned = plannedByTask.get(task.id) ?? 0;
            const need = remainingByTask.get(task.id) ?? task.estimateMin;
            const covered = need > 0 ? Math.min(1, planned / need) : 1;
            const active = focusId === task.id;
            return (
              <li key={task.id}>
                <button
                  type="button"
                  onClick={() => onFocus(active ? null : task.id)}
                  aria-pressed={active}
                  className={`group w-full px-4 py-3 text-left transition-colors ${active ? "bg-primary/10" : "hover:bg-accent/50"}`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-xs font-semibold ${
                        rank <= 3 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {rank}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${SUBJECT_DOT[task.subject]}`} />
                        <span className="truncate text-sm font-medium">{task.title}</span>
                      </div>
                      <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-muted" style={{ width: `${(score.total / max) * 100}%` }}>
                        {FACTORS.map((f) =>
                          score.factors[f].points > 0 ? (
                            <div
                              key={f}
                              className={`${FACTOR_COLOR[f]} transition-[flex-grow] duration-500`}
                              style={{ flexGrow: score.factors[f].points }}
                              title={`${FACTOR_LABEL[f]}: ${score.factors[f].points.toFixed(1)}`}
                            />
                          ) : null,
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                        <span className="font-mono text-foreground">{Math.round(score.normalized)}</span>
                        {score.daysOverdue > 0 ? (
                          <span className="text-destructive">{score.daysOverdue}d overdue</span>
                        ) : score.daysLeft !== null ? (
                          <span>due in {score.daysLeft}d</span>
                        ) : null}
                        {score.weakMatch && <span className="text-ict">weak topic</span>}
                        {score.goal && <span className="text-physics">goal</span>}
                        <span className={`ml-auto font-mono ${covered >= 1 ? "text-success" : planned > 0 ? "text-warning" : ""}`}>
                          {fmtDur(planned)}/{fmtDur(need)}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      <footer className="flex flex-wrap gap-x-3 gap-y-1 border-t px-4 py-3">
        {FACTORS.map((f) => (
          <span key={f} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className={`h-2 w-2 rounded-sm ${FACTOR_COLOR[f]}`} />
            {FACTOR_LABEL[f]}
          </span>
        ))}
      </footer>
    </section>
  );
}
