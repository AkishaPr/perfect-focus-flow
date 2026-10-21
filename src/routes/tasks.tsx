import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { CheckTick } from "@/components/CheckTick";
import { SparkleBurst } from "@/components/SparkleBurst";
import { Button } from "@/components/ui/button";
import { STATUS_LABEL, TaskDialog, blankTask } from "@/components/TaskDialog";
import { useLinger } from "@/hooks/use-linger";
import { LINGER_MS, stagger } from "@/lib/motion";
import { useStore } from "@/lib/store";
import { ymd } from "@/lib/calendar";
import {
  SUBJECTS,
  SUBJECT_LABEL,
  TASK_TYPES,
  type Subject,
  type Task,
  type TaskStatus,
} from "@/lib/types";

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks — Mission UCSC" },
      { name: "description", content: "Homework, papers, revision, chapters and recordings." },
      { property: "og:title", content: "Tasks — Mission UCSC" },
      {
        property: "og:description",
        content: "Homework, papers, revision, chapters and recordings.",
      },
    ],
  }),
  component: TasksPage,
});

const DOT: Record<Subject, string> = { maths: "bg-maths", physics: "bg-physics", ict: "bg-ict" };
const sel =
  "h-9 cursor-pointer rounded-full border bg-card px-3 text-sm capitalize focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

// Every status has a text label as well as a style, so colour is never the only signal.
const STATUS_STYLE: Record<TaskStatus, string> = {
  todo: "bg-muted text-muted-foreground",
  in_progress: "bg-signal font-medium text-signal-foreground",
  done: "bg-primary text-primary-foreground",
  missed: "border border-destructive/50 text-destructive",
  deferred: "border text-muted-foreground",
};

function Importance({ value }: { value: number }) {
  const filled = Math.min(5, Math.max(0, value));
  return (
    <span role="img" aria-label={`Importance ${filled} of 5`}>
      {"●".repeat(filled)}
      <span className="opacity-30">{"●".repeat(5 - filled)}</span>
    </span>
  );
}

/**
 * One task. Ticking it off is a small reward: the tick draws itself, a few sparks leave the
 * circle and the row warms up for a moment. Un-ticking, or a task that arrives already done,
 * gets none of it (the reward belongs to the click, not to the status).
 */
function TaskRow({
  task: t,
  index,
  today,
  onToggle,
  onEdit,
}: {
  task: Task;
  index: number;
  today: string;
  onToggle: (t: Task) => void;
  onEdit: (t: Task) => void;
}) {
  const done = t.status === "done";
  const overdue = t.deadline && t.deadline < today && !done;
  // Counts the ticks we watched; a new count remounts the reward so it plays again.
  const [rewards, setRewards] = useState(0);
  const toggle = () => {
    setRewards(done ? 0 : (n) => n + 1);
    onToggle(t);
  };
  return (
    <li
      className="motion-rise relative flex items-center gap-3 px-4 py-3.5"
      // Only the first few rows are staggered, so a long list never makes anyone wait.
      style={stagger(Math.min(index, 8))}
    >
      {rewards > 0 && (
        <span
          key={`flash-${rewards}`}
          aria-hidden="true"
          data-task-flash=""
          className="motion-flash pointer-events-none absolute inset-0 bg-success/15"
        />
      )}
      <span className="relative flex h-5 w-5 shrink-0">
        <button
          aria-label={done ? "Mark not done" : "Mark done"}
          onClick={toggle}
          className={`flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border-[1.5px] transition-[background-color,border-color,scale] duration-200 active:scale-90 motion-reduce:active:scale-100 ${done ? "border-success bg-success text-background" : "border-foreground/60 hover:border-foreground"}`}
        >
          {done && <CheckTick className="h-3 w-3" />}
        </button>
        {rewards > 0 && <SparkleBurst key={`spark-${rewards}`} count={7} radius={22} />}
      </span>
      <button className="min-w-0 flex-1 cursor-pointer text-left" onClick={() => onEdit(t)}>
        <div
          className={`truncate text-sm font-medium transition-colors duration-300 ${done ? "text-muted-foreground line-through" : ""}`}
        >
          {t.title}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-foreground/80">
            <span className={`h-2 w-2 rounded-full ${DOT[t.subject]}`} aria-hidden="true" />
            {SUBJECT_LABEL[t.subject]}
          </span>
          {t.topic && <span>· {t.topic}</span>}
          <span className="capitalize">· {t.type}</span>
          <span>· {t.estimateMin} min</span>
          {t.carryOverCount > 0 && (
            <span className="text-warning">· carried ×{t.carryOverCount}</span>
          )}
        </div>
      </button>
      <div className="hidden text-right text-xs sm:block">
        <div className={overdue ? "font-medium text-destructive" : "text-muted-foreground"}>
          {t.deadline ? (overdue ? `Overdue · ${t.deadline}` : t.deadline) : "No deadline"}
        </div>
        <div className="mt-0.5 text-muted-foreground">
          <Importance value={t.importance} />
        </div>
      </div>
      <span
        className={`min-w-[5.5rem] rounded-md px-2 py-0.5 text-center text-[11px] ${STATUS_STYLE[t.status]}`}
      >
        {STATUS_LABEL[t.status]}
      </span>
    </li>
  );
}

function TasksPage() {
  const tasks = useStore((s) => s.tasks);
  const upsert = useStore((s) => s.upsertTask);
  const [editing, setEditing] = useState<Task | null>(null);
  const [subject, setSubject] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("open");
  const today = ymd(new Date());
  // A task ticked off in the Open view stays for a moment, so its reward is seen before it leaves.
  const { held, hold, release } = useLinger(LINGER_MS);
  const toggle = (t: Task) => {
    const next = t.status === "done" ? "todo" : "done";
    if (next === "done") hold(t.id);
    else release(t.id);
    upsert({ ...t, status: next });
  };

  const list = useMemo(
    () =>
      tasks
        .filter((t) => !subject || t.subject === subject)
        .filter((t) => !type || t.type === type)
        .filter((t) =>
          status === "open"
            ? t.status !== "done" || held.has(t.id)
            : !status || t.status === status,
        )
        .sort(
          (a, b) =>
            (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") ||
            b.importance - a.importance,
        ),
    [tasks, subject, type, status, held],
  );

  return (
    <>
      <PageHeader
        title="Tasks"
        subtitle={`${tasks.filter((t) => t.status !== "done").length} open · ${tasks.filter((t) => t.status === "done").length} done`}
        action={
          <Button onClick={() => setEditing(blankTask())}>
            <Plus className="h-4 w-4" /> Add task
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <select
          className={sel}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          aria-label="Subject"
        >
          <option value="">All subjects</option>
          {SUBJECTS.map((s) => (
            <option key={s} value={s}>
              {SUBJECT_LABEL[s]}
            </option>
          ))}
        </select>
        <select
          className={sel}
          value={type}
          onChange={(e) => setType(e.target.value)}
          aria-label="Type"
        >
          <option value="">All types</option>
          {TASK_TYPES.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        <select
          className={sel}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Status"
        >
          <option value="open">Open</option>
          <option value="">All</option>
          {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((x) => (
            <option key={x} value={x}>
              {STATUS_LABEL[x]}
            </option>
          ))}
        </select>
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
          No tasks here. Add homework, a past paper or a missed recording.
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
          {list.map((t, i) => (
            <TaskRow
              key={t.id}
              task={t}
              index={i}
              today={today}
              onToggle={toggle}
              onEdit={setEditing}
            />
          ))}
        </ul>
      )}
      <TaskDialog initial={editing} onClose={() => setEditing(null)} />
    </>
  );
}
