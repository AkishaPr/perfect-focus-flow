import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uid, useStore } from "@/lib/store";
import { toMin } from "@/lib/calendar";
import { SUBJECTS, SUBJECT_LABEL, type CalEvent } from "@/lib/types";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const sel = "h-9 w-full rounded-md border bg-input/30 px-2 text-sm";

export function EventDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: CalEvent | null;
}) {
  const upsert = useStore((s) => s.upsertEvent);
  const del = useStore((s) => s.deleteEvent);
  const [e, setE] = useState<CalEvent | null>(initial);
  useEffect(() => setE(initial), [initial]);
  if (!e) return null;

  const isNew = !useStore.getState().events.some((x) => x.id === e.id);
  const err = !e.title.trim()
    ? "Add a title."
    : toMin(e.end) <= toMin(e.start)
      ? "End must be after start (no crossing midnight)."
      : null;
  const set = (p: Partial<CalEvent>) => setE({ ...e, ...p });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? "New event" : "Edit event"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label>Title</Label>
            <Input autoFocus value={e.title} onChange={(x) => set({ title: x.target.value })} placeholder="e.g. Physics theory class" />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <select className={sel} value={e.kind} onChange={(x) => set({ kind: x.target.value as CalEvent["kind"] })}>
              <option value="class">Class</option>
              <option value="exam">Exam</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Mode</Label>
            <select className={sel} value={e.mode} onChange={(x) => set({ mode: x.target.value as CalEvent["mode"] })}>
              <option value="physical">Physical</option>
              <option value="online">Online</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Subject</Label>
            <select className={sel} value={e.subject ?? ""} onChange={(x) => set({ subject: (x.target.value || undefined) as CalEvent["subject"] })}>
              <option value="">None</option>
              {SUBJECTS.map((s) => <option key={s} value={s}>{SUBJECT_LABEL[s]}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Repeats</Label>
            <select
              className={sel}
              value={e.recurrence}
              onChange={(x) => {
                const r = x.target.value as CalEvent["recurrence"];
                set(r === "weekly" ? { recurrence: r, weekday: e.weekday ?? new Date(e.date ?? Date.now()).getDay() } : { recurrence: r, date: e.date ?? "" });
              }}
            >
              <option value="weekly">Every week</option>
              <option value="none">One time</option>
            </select>
          </div>
          <div className="col-span-2 space-y-1.5">
            {e.recurrence === "weekly" ? (
              <>
                <Label>Day</Label>
                <select className={sel} value={e.weekday ?? 1} onChange={(x) => set({ weekday: Number(x.target.value) })}>
                  {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </>
            ) : (
              <>
                <Label>Date</Label>
                <Input type="date" value={e.date ?? ""} onChange={(x) => set({ date: x.target.value })} />
              </>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Start</Label>
            <Input type="time" value={e.start} onChange={(x) => set({ start: x.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>End</Label>
            <Input type="time" value={e.end} onChange={(x) => set({ end: x.target.value })} />
          </div>
        </div>
        {err && <p className="text-xs text-destructive">{err}</p>}
        <DialogFooter className="gap-2">
          {!isNew && (
            <Button variant="ghost" className="mr-auto text-destructive" onClick={() => { del(e.id); onOpenChange(false); }}>
              Delete
            </Button>
          )}
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!!err} onClick={() => { upsert({ ...e, title: e.title.trim() }); onOpenChange(false); }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const blankEvent = (date: Date, start: string): CalEvent => ({
  id: uid(),
  title: "",
  kind: "class",
  mode: "physical",
  recurrence: "weekly",
  weekday: date.getDay(),
  date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
  start,
  end: `${String(Math.min(23, Number(start.slice(0, 2)) + 2)).padStart(2, "0")}:${start.slice(3)}`,
});
