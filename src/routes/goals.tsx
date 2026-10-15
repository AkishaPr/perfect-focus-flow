import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { uid, useStore } from "@/lib/store";
import { addDays, weekStart, ymd } from "@/lib/calendar";
import { TASK_TYPES, type TaskType } from "@/lib/types";

export const Route = createFileRoute("/goals")({
  head: () => ({
    meta: [
      { title: "Weekly goals — A/L Command Center" },
      { name: "description", content: "Targets for papers, revision, homework and recordings." },
      { property: "og:title", content: "Weekly goals — A/L Command Center" },
      { property: "og:description", content: "Targets for papers, revision, homework and recordings." },
    ],
  }),
  component: GoalsPage,
});

function GoalsPage() {
  const goals = useStore((s) => s.goals);
  const tasks = useStore((s) => s.tasks);
  const upsert = useStore((s) => s.upsertGoal);
  const del = useStore((s) => s.deleteGoal);
  const [anchor, setAnchor] = useState(() => weekStart(new Date()));
  const [form, setForm] = useState<{ title: string; type: TaskType; target: number }>({ title: "", type: "paper", target: 3 });
  const wk = ymd(anchor);
  const mine = goals.filter((g) => g.weekStart === wk);

  return (
    <>
      <PageHeader
        title="Weekly goals"
        subtitle={`Week of ${anchor.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" size="icon" aria-label="Previous week" onClick={() => setAnchor(addDays(anchor, -7))}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="secondary" onClick={() => setAnchor(weekStart(new Date()))}>This week</Button>
            <Button variant="secondary" size="icon" aria-label="Next week" onClick={() => setAnchor(addDays(anchor, 7))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        }
      />

      <form
        className="mb-6 flex flex-wrap gap-2 rounded-lg border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!form.title.trim() || form.target < 1) return;
          upsert({ id: uid(), weekStart: wk, title: form.title.trim(), type: form.type, target: form.target });
          setForm({ ...form, title: "" });
        }}
      >
        <Input className="min-w-48 flex-1" placeholder="e.g. 3 Physics past papers" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <select className="h-9 rounded-md border bg-input/30 px-2 text-sm capitalize" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as TaskType })}>
          {TASK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <Input type="number" min={1} className="w-24" value={form.target} onChange={(e) => setForm({ ...form, target: Number(e.target.value) || 0 })} aria-label="Target" />
        <Button type="submit">Add goal</Button>
      </form>

      {mine.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">No goals for this week yet.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {mine.map((g) => {
            const linked = tasks.filter((t) => t.goalId === g.id);
            const done = linked.filter((t) => t.status === "done").length;
            return (
              <div key={g.id} className="rounded-lg border bg-card p-5">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{g.title}</div>
                    <div className="text-xs capitalize text-muted-foreground">{g.type} · {linked.length} linked task{linked.length === 1 ? "" : "s"}</div>
                  </div>
                  <Button variant="ghost" size="icon" aria-label="Delete goal" onClick={() => del(g.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <Progress value={Math.min(100, (done / g.target) * 100)} className="flex-1" />
                  <span className="font-mono text-sm">{done}/{g.target}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-4 text-xs text-muted-foreground">Link tasks to a goal from the task editor. Progress counts linked tasks marked done.</p>
    </>
  );
}
