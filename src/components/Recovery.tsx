import { AlertTriangle, Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Decision, MissedItem, RecoveryAction } from "@/lib/planner/recovery";
import { SUBJECT_LABEL, type Subject } from "@/lib/types";

const DOT: Record<Subject, string> = { maths: "bg-maths", physics: "bg-physics", ict: "bg-ict" };

const dayLabel = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

const ACTIONS: { action: RecoveryAction; label: string; hint: string }[] = [
  { action: "carry", label: "Carry over", hint: "plan it again, with higher priority" },
  { action: "skip", label: "Keep as is", hint: "plan it again, no penalty" },
  { action: "defer", label: "Defer", hint: "take it out of planning for now" },
  { action: "done", label: "Mark done", hint: "I did this off the app" },
];

function Row({
  item,
  onResolve,
  onEdit,
}: {
  item: MissedItem;
  onResolve: (d: Decision[]) => void;
  onEdit: (taskId: string) => void;
}) {
  const { task } = item;
  return (
    <li className="px-4 py-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">{task.title}</span>
        <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-xs text-foreground/80">
          <span className={`h-2 w-2 rounded-full ${DOT[task.subject]}`} aria-hidden="true" />
          {SUBJECT_LABEL[task.subject]}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {item.days.length === 1
          ? `Planned ${item.plannedMin} min on ${dayLabel(item.days[0]!)} · studied ${item.studiedMin} min`
          : `Missed on ${item.days.length} days · studied ${item.studiedMin} of ${item.plannedMin} planned min`}
      </p>
      {item.stuck && (
        <p className="mt-1 flex items-start gap-1.5 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Carried over {task.carryOverCount}× already. Split it or shrink the estimate before
            carrying it over again.
          </span>
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {ACTIONS.map(({ action, label, hint }) => (
          <Button
            key={action}
            size="sm"
            variant={action === "carry" ? "default" : "secondary"}
            title={hint}
            aria-label={`${label}: ${task.title}`}
            onClick={() => onResolve([{ taskId: task.id, action }])}
          >
            {action === "done" && <Check className="h-3.5 w-3.5" />}
            {label}
          </Button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Edit: ${task.title}`}
          onClick={() => onEdit(task.id)}
        >
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Button>
      </div>
    </li>
  );
}

/** Tasks that were planned on an earlier day and didn't get done, with a choice for each. */
export function Recovery({
  items,
  onResolve,
  onEdit,
}: {
  items: MissedItem[];
  onResolve: (d: Decision[]) => void;
  onEdit: (taskId: string) => void;
}) {
  if (items.length === 0) return null;
  const easy = items.filter((i) => !i.stuck);
  const stuckCount = items.length - easy.length;
  return (
    <section aria-label="Missed work" className="relative mb-6 rounded-xl border bg-card shadow-xs">
      {/* A soft ring swells and fades around the card, twice, when it appears: a nudge, not an alarm. */}
      <span
        aria-hidden="true"
        data-pulse=""
        className="motion-pulse pointer-events-none absolute -inset-px rounded-xl border-2 border-warning"
      />
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-4">
        <div>
          <h2 className="font-medium">
            {items.length} {items.length === 1 ? "task" : "tasks"} from earlier didn't get done
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Choose what happens to each. Carrying a task over raises its priority.
          </p>
        </div>
        {easy.length > 0 && (
          <div className="text-right">
            <Button
              size="sm"
              onClick={() => onResolve(easy.map((i) => ({ taskId: i.task.id, action: "carry" })))}
            >
              Carry {stuckCount > 0 ? `${easy.length} of them` : "everything"} over
            </Button>
            {stuckCount > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {stuckCount} {stuckCount === 1 ? "needs" : "need"} a decision first.
              </p>
            )}
          </div>
        )}
      </div>
      <ul className="divide-y">
        {items.map((i) => (
          <Row key={i.task.id} item={i} onResolve={onResolve} onEdit={onEdit} />
        ))}
      </ul>
    </section>
  );
}
