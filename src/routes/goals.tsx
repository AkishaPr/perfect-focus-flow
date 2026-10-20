import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { uid, useStore } from "@/lib/store";
import { addDays, weekStart, ymd } from "@/lib/calendar";
import { goalProgress } from "@/lib/goals";
import { TASK_TYPES, type Goal, type TaskType } from "@/lib/types";

export const Route = createFileRoute("/goals")({
  head: () => ({
    meta: [
      { title: "Weekly goals — Mission UCSC" },
      { name: "description", content: "Targets for papers, revision, homework and recordings." },
      { property: "og:title", content: "Weekly goals — Mission UCSC" },
      {
        property: "og:description",
        content: "Targets for papers, revision, homework and recordings.",
      },
    ],
  }),
  component: GoalsPage,
});

function GoalsPage() {
  const goals = useStore((s) => s.goals);
  const tasks = useStore((s) => s.tasks);
  const upsert = useStore((s) => s.upsertGoal);
  const del = useStore((s) => s.deleteGoal);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [anchor, setAnchor] = useState(() => weekStart(new Date()));
  const [form, setForm] = useState<{ title: string; type: TaskType; target: number }>({
    title: "",
    type: "paper",
    target: 3,
  });
  const wk = ymd(anchor);
  const mine = goals.filter((g) => g.weekStart === wk);

  return (
    <>
      <PageHeader
        title="Weekly goals"
        subtitle={`Week of ${anchor.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`}
        action={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="icon"
              aria-label="Previous week"
              onClick={() => setAnchor(addDays(anchor, -7))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="secondary" onClick={() => setAnchor(weekStart(new Date()))}>
              This week
            </Button>
            <Button
              variant="secondary"
              size="icon"
              aria-label="Next week"
              onClick={() => setAnchor(addDays(anchor, 7))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      <form
        className="mb-6 flex flex-wrap gap-2 rounded-lg border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!form.title.trim() || form.target < 1) return;
          upsert({
            id: uid(),
            weekStart: wk,
            title: form.title.trim(),
            type: form.type,
            target: form.target,
          });
          setForm({ ...form, title: "" });
        }}
      >
        <Input
          className="min-w-48 flex-1"
          placeholder="e.g. 3 Physics past papers"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
        <select
          className="h-9 rounded-md border bg-input/30 px-2 text-sm capitalize"
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value as TaskType })}
        >
          {TASK_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <Input
          type="number"
          min={1}
          className="w-24"
          value={form.target}
          onChange={(e) => setForm({ ...form, target: Number(e.target.value) || 0 })}
          aria-label="Target"
        />
        <Button type="submit">Add goal</Button>
      </form>

      {mine.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No goals for this week yet.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {mine.map((g) => {
            const p = goalProgress(g, tasks);
            if (editing?.id === g.id) {
              const bad = !editing.title.trim() || editing.target < 1;
              return (
                <form
                  key={g.id}
                  className="space-y-3 rounded-lg border border-primary/50 bg-card p-5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (bad) return;
                    upsert({ ...editing, title: editing.title.trim() });
                    setEditing(null);
                  }}
                >
                  <Input
                    autoFocus
                    aria-label="Goal title"
                    value={editing.title}
                    onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <select
                      aria-label="Goal type"
                      className="h-9 flex-1 rounded-md border bg-input/30 px-2 text-sm capitalize"
                      value={editing.type}
                      onChange={(e) => setEditing({ ...editing, type: e.target.value as TaskType })}
                    >
                      {TASK_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <Input
                      type="number"
                      min={1}
                      className="w-24"
                      aria-label="Goal target"
                      value={editing.target}
                      onChange={(e) => setEditing({ ...editing, target: Number(e.target.value) || 0 })}
                    />
                  </div>
                  {bad && <p className="text-xs text-destructive">Add a title and a target of at least 1.</p>}
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" disabled={bad}>
                      Save
                    </Button>
                  </div>
                </form>
              );
            }
            return (
              <div key={g.id} className="rounded-lg border bg-card p-5">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{g.title}</div>
                    <div className="text-xs capitalize text-muted-foreground">
                      {g.type} · {p.linked} linked task{p.linked === 1 ? "" : "s"}
                    </div>
                  </div>
                  <div className="flex">
                    <Button variant="ghost" size="icon" aria-label="Edit goal" onClick={() => setEditing(g)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete goal"
                      onClick={() => {
                        if (window.confirm(`Delete goal "${g.title}"? Linked tasks are kept, just unlinked.`)) del(g.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <Progress value={p.percent} className="flex-1" />
                  <span className="font-mono text-sm">
                    {p.done}/{p.target}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Link tasks to a goal from the task editor. Progress counts linked tasks marked done.
      </p>
    </>
  );
}
