import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { EventDialog, blankEvent } from "@/components/EventDialog";
import { useStore } from "@/lib/store";
import { addDays, blocksOn, eventsOn, fromMin, overlappingIds, toMin, weekStart, windowsOn, ymd } from "@/lib/calendar";
import type { CalEvent, Subject } from "@/lib/types";

export const Route = createFileRoute("/week")({
  head: () => ({
    meta: [
      { title: "Week — A/L Command Center" },
      { name: "description", content: "Recurring classes, events and planned study blocks." },
      { property: "og:title", content: "Week — A/L Command Center" },
      { property: "og:description", content: "Recurring classes, events and planned study blocks." },
    ],
  }),
  component: WeekPage,
});

const START = 5 * 60;
const END = 23 * 60;
const PX = 0.9; // px per minute
const SUBJECT_CLS: Record<Subject, string> = {
  maths: "border-l-maths bg-maths/15",
  physics: "border-l-physics bg-physics/15",
  ict: "border-l-ict bg-ict/15",
};

function WeekPage() {
  const events = useStore((s) => s.events);
  const blocks = useStore((s) => s.blocks);
  const tasks = useStore((s) => s.tasks);
  const windows = useStore((s) => s.settings.studyWindows);
  const [anchor, setAnchor] = useState(() => weekStart(new Date()));
  const [editing, setEditing] = useState<CalEvent | null>(null);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(anchor, i)), [anchor]);
  const today = ymd(new Date());
  const clamp = (m: number) => Math.min(END, Math.max(START, m));
  const top = (t: string) => (clamp(toMin(t)) - START) * PX;
  const height = (s: string, e: string) => Math.max(14, (clamp(toMin(e)) - clamp(toMin(s))) * PX);

  return (
    <>
      <PageHeader
        title="Week"
        subtitle={`${days[0].toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${days[6].toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`}
        action={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="icon" aria-label="Previous week" onClick={() => setAnchor(addDays(anchor, -7))}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="secondary" onClick={() => setAnchor(weekStart(new Date()))}>This week</Button>
            <Button variant="secondary" size="icon" aria-label="Next week" onClick={() => setAnchor(addDays(anchor, 7))}><ChevronRight className="h-4 w-4" /></Button>
            <Button onClick={() => setEditing(blankEvent(new Date(), "16:00"))}><Plus className="h-4 w-4" /> Event</Button>
          </div>
        }
      />

      <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-dashed border-primary/50 bg-primary/5" /> Study window</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-maths/40" /> Maths</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-physics/40" /> Physics</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-ict/40" /> ICT</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-primary" /> Planned study</span>
        <span>Click an empty slot to add an event.</span>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <div className="grid min-w-[760px]" style={{ gridTemplateColumns: "48px repeat(7, 1fr)" }}>
          <div className="border-b" />
          {days.map((d) => (
            <div key={ymd(d)} className={`border-b border-l px-2 py-2 text-center text-xs ${ymd(d) === today ? "text-primary" : "text-muted-foreground"}`}>
              <div className="font-medium uppercase tracking-wide">{d.toLocaleDateString(undefined, { weekday: "short" })}</div>
              <div className="font-display text-lg text-foreground">{d.getDate()}</div>
            </div>
          ))}

          <div className="relative" style={{ height: (END - START) * PX }}>
            {Array.from({ length: (END - START) / 60 }, (_, i) => (
              <div key={i} className="absolute right-1 -translate-y-1/2 font-mono text-[10px] text-muted-foreground" style={{ top: i * 60 * PX }}>
                {i === 0 ? "" : fromMin(START + i * 60)}
              </div>
            ))}
          </div>

          {days.map((d) => {
            const evs = eventsOn(events, d);
            const clash = overlappingIds(evs);
            return (
              <div
                key={ymd(d)}
                className="relative cursor-pointer border-l"
                style={{ height: (END - START) * PX }}
                onClick={(ev) => {
                  const y = ev.clientY - ev.currentTarget.getBoundingClientRect().top;
                  const m = START + Math.floor(y / PX / 30) * 30;
                  setEditing(blankEvent(d, fromMin(Math.min(m, END - 60))));
                }}
              >
                {Array.from({ length: (END - START) / 60 }, (_, i) => (
                  <div key={i} className="absolute inset-x-0 border-t border-border/50" style={{ top: i * 60 * PX }} />
                ))}
                {windowsOn(windows, d).map((w, i) => (
                  <div key={i} className="absolute inset-x-1 rounded border border-dashed border-primary/30 bg-primary/5" style={{ top: top(w.start), height: height(w.start, w.end) }} />
                ))}
                {blocksOn(blocks, d).map((b) => (
                  <div key={b.id} className="absolute inset-x-2 overflow-hidden rounded bg-primary px-1.5 py-0.5 text-[11px] text-primary-foreground" style={{ top: top(b.start), height: height(b.start, b.end) }}>
                    {tasks.find((t) => t.id === b.taskId)?.title ?? "Study"}
                  </div>
                ))}
                {evs.map((e) => (
                  <button
                    key={e.id}
                    onClick={(x) => { x.stopPropagation(); setEditing(e); }}
                    className={`absolute inset-x-1 overflow-hidden rounded border-l-4 px-1.5 py-1 text-left text-[11px] leading-tight hover:brightness-125 ${e.subject ? SUBJECT_CLS[e.subject] : "border-l-muted-foreground bg-muted"} ${clash.has(e.id) ? "ring-1 ring-destructive" : ""}`}
                    style={{ top: top(e.start), height: height(e.start, e.end) }}
                    title={clash.has(e.id) ? "Overlaps another event" : undefined}
                  >
                    <div className="font-medium text-foreground">{e.title}</div>
                    <div className="font-mono text-muted-foreground">{e.start}–{e.end} · {e.mode === "online" ? "Online" : "Physical"}</div>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <EventDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} initial={editing} />
    </>
  );
}
