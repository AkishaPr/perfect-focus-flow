import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Check, Plus } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { STATUS_LABEL, TaskDialog, blankTask } from "@/components/TaskDialog";
import { useStore } from "@/lib/store";
import { ymd } from "@/lib/calendar";
import { SUBJECTS, SUBJECT_LABEL, TASK_TYPES, type Subject, type Task, type TaskStatus } from "@/lib/types";

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks — A/L Command Center" },
      { name: "description", content: "Homework, papers, revision, chapters and recordings." },
      { property: "og:title", content: "Tasks — A/L Command Center" },
      { property: "og:description", content: "Homework, papers, revision, chapters and recordings." },
    ],
  }),
  component: TasksPage,
});

const DOT: Record<Subject, string> = { maths: "bg-maths", physics: "bg-physics", ict: "bg-ict" };
const sel = "h-9 rounded-md border bg-input/30 px-2 text-sm capitalize";

function TasksPage() {
  const tasks = useStore((s) => s.tasks);
  const upsert = useStore((s) => s.upsertTask);
  const [editing, setEditing] = useState<Task | null>(null);
  const [subject, setSubject] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("open");
  const today = ymd(new Date());

  const list = useMemo(
    () =>
      tasks
        .filter((t) => !subject || t.subject === subject)
        .filter((t) => !type || t.type === type)
        .filter((t) => (status === "open" ? t.status !== "done" : !status || t.status === status))
        .sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") || b.importance - a.importance),
    [tasks, subject, type, status],
  );

  return (
    <>
      <PageHeader
        title="Tasks"
        subtitle={`${tasks.filter((t) => t.status !== "done").length} open · ${tasks.filter((t) => t.status === "done").length} done`}
        action={<Button onClick={() => setEditing(blankTask())}><Plus className="h-4 w-4" /> Task</Button>}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <select className={sel} value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject">
          <option value="">All subjects</option>
          {SUBJECTS.map((s) => <option key={s} value={s}>{SUBJECT_LABEL[s]}</option>)}
        </select>
        <select className={sel} value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
          <option value="">All types</option>
          {TASK_TYPES.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select className={sel} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="open">Open</option>
          <option value="">All</option>
          {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((x) => <option key={x} value={x}>{STATUS_LABEL[x]}</option>)}
        </select>
      </div>

      {list.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No tasks here. Add homework, a past paper or a missed recording.
        </div>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {list.map((t) => {
            const overdue = t.deadline && t.deadline < today && t.status !== "done";
            return (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <button
                  aria-label={t.status === "done" ? "Mark not done" : "Mark done"}
                  onClick={() => upsert({ ...t, status: t.status === "done" ? "todo" : "done" })}
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${t.status === "done" ? "border-success bg-success text-background" : "hover:border-primary"}`}
                >
                  {t.status === "done" && <Check className="h-3.5 w-3.5" />}
                </button>
                <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(t)}>
                  <div className={`truncate text-sm font-medium ${t.status === "done" ? "text-muted-foreground line-through" : ""}`}>{t.title}</div>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span className={`h-2 w-2 rounded-full ${DOT[t.subject]}`} />
                    <span>{SUBJECT_LABEL[t.subject]}{t.topic && ` · ${t.topic}`}</span>
                    <span className="capitalize">· {t.type}</span>
                    <span>· {t.estimateMin} min</span>
                    {t.carryOverCount > 0 && <span className="text-warning">· carried ×{t.carryOverCount}</span>}
                  </div>
                </button>
                <div className="hidden text-right text-xs sm:block">
                  <div className={overdue ? "text-destructive" : "text-muted-foreground"}>
                    {t.deadline ? (overdue ? `Overdue · ${t.deadline}` : t.deadline) : "No deadline"}
                  </div>
                  <div className="text-muted-foreground">{"●".repeat(t.importance)}<span className="opacity-30">{"●".repeat(5 - t.importance)}</span></div>
                </div>
                <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">{STATUS_LABEL[t.status]}</span>
              </li>
            );
          })}
        </ul>
      )}
      <TaskDialog initial={editing} onClose={() => setEditing(null)} />
    </>
  );
}
