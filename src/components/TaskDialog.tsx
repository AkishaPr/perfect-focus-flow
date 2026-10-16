import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { uid, useStore } from "@/lib/store";
import { SUBJECTS, SUBJECT_LABEL, TASK_TYPES, type Task, type TaskStatus } from "@/lib/types";

const sel = "h-9 w-full rounded-md border bg-input/30 px-2 text-sm capitalize";
export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
  missed: "Missed",
  deferred: "Deferred",
};

export const blankTask = (): Task => ({
  id: uid(),
  title: "",
  subject: "maths",
  topic: "",
  type: "homework",
  estimateMin: 60,
  importance: 3,
  splittable: true,
  minChunkMin: 25,
  status: "todo",
  carryOverCount: 0,
  createdAt: new Date().toISOString(),
});

export function TaskDialog({ initial, onClose }: { initial: Task | null; onClose: () => void }) {
  const upsert = useStore((s) => s.upsertTask);
  const del = useStore((s) => s.deleteTask);
  const goals = useStore((s) => s.goals);
  const [t, setT] = useState<Task | null>(initial);
  useEffect(() => setT(initial), [initial]);
  if (!t) return null;
  const isNew = !useStore.getState().tasks.some((x) => x.id === t.id);
  const set = (p: Partial<Task>) => setT({ ...t, ...p });
  const err = !t.title.trim()
    ? "Add a title."
    : t.estimateMin < 5
      ? "Estimate must be at least 5 minutes."
      : t.splittable && t.minChunkMin > t.estimateMin
        ? "Minimum chunk can't exceed the estimate."
        : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? "New task" : "Edit task"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label>Title</Label>
            <Input autoFocus value={t.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. 2019 Physics Paper II" />
          </div>
          <div className="space-y-1.5">
            <Label>Subject</Label>
            <select className={sel} value={t.subject} onChange={(e) => set({ subject: e.target.value as Task["subject"] })}>
              {SUBJECTS.map((s) => <option key={s} value={s}>{SUBJECT_LABEL[s]}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Topic</Label>
            <Input value={t.topic} onChange={(e) => set({ topic: e.target.value })} placeholder="e.g. Vectors" />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <select className={sel} value={t.type} onChange={(e) => set({ type: e.target.value as Task["type"] })}>
              {TASK_TYPES.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <select className={sel} value={t.status} onChange={(e) => set({ status: e.target.value as TaskStatus })}>
              {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((x) => <option key={x} value={x}>{STATUS_LABEL[x]}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Estimated minutes</Label>
            <Input type="number" min={5} value={t.estimateMin} onChange={(e) => set({ estimateMin: Number(e.target.value) || 0 })} />
          </div>
          <div className="space-y-1.5">
            <Label>Deadline</Label>
            <Input type="date" value={t.deadline ?? ""} onChange={(e) => set({ deadline: e.target.value || undefined })} />
          </div>
          <div className="space-y-1.5">
            <Label>Importance (1–5)</Label>
            <select className={sel} value={t.importance} onChange={(e) => set({ importance: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Weekly goal</Label>
            <select className={sel} value={t.goalId ?? ""} onChange={(e) => set({ goalId: e.target.value || undefined })}>
              <option value="">None</option>
              {goals.map((g) => <option key={g.id} value={g.id}>{g.title} ({g.weekStart})</option>)}
            </select>
          </div>
          <div className="col-span-2 flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Can be split</div>
              <div className="text-xs text-muted-foreground">Planner may divide it across several blocks.</div>
            </div>
            <Switch checked={t.splittable} onCheckedChange={(v) => set({ splittable: v })} />
          </div>
          {t.splittable && (
            <div className="col-span-2 space-y-1.5">
              <Label>Minimum chunk (min)</Label>
              <Input type="number" min={10} value={t.minChunkMin} onChange={(e) => set({ minChunkMin: Number(e.target.value) || 0 })} />
            </div>
          )}
        </div>
        {err && <p className="text-xs text-destructive">{err}</p>}
        <DialogFooter className="gap-2">
          {!isNew && (
            <Button variant="ghost" className="mr-auto text-destructive" onClick={() => { del(t.id); onClose(); }}>Delete</Button>
          )}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!!err} onClick={() => { upsert({ ...t, title: t.title.trim(), topic: t.topic.trim() }); onClose(); }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
