import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { EventDialog, blankEvent } from "@/components/EventDialog";
import { SUBJECT_BG, SUBJECT_EVENT } from "@/components/subject-colors";
import { useNow } from "@/hooks/use-now";
import { useStore } from "@/lib/store";
import {
  addDays,
  blocksOn,
  eventsOn,
  fromMin,
  layoutOverlaps,
  overlappingIds,
  toMin,
  weekStart,
  windowsOn,
  ymd,
} from "@/lib/calendar";
import type { CalEvent } from "@/lib/types";

export const Route = createFileRoute("/week")({
  head: () => ({
    meta: [
      { title: "Week — Mission UCSC" },
      { name: "description", content: "Recurring classes, events and planned study blocks." },
      { property: "og:title", content: "Week — Mission UCSC" },
      {
        property: "og:description",
        content: "Recurring classes, events and planned study blocks.",
      },
    ],
  }),
  component: WeekPage,
});

const START = 5 * 60;
const END = 23 * 60;
const PX = 1; // px per minute
const GUTTER = 48; // px, the time labels
/** Below this height (px) an event only has room for its title. */
const COMPACT_PX = 36;

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function WeekPage() {
  const events = useStore((s) => s.events);
  const blocks = useStore((s) => s.blocks);
  const tasks = useStore((s) => s.tasks);
  const windows = useStore((s) => s.settings.studyWindows);
  const now = useNow();
  const [anchor, setAnchor] = useState(() => weekStart(new Date()));
  const [editing, setEditing] = useState<CalEvent | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(anchor, i)), [anchor]);
  const today = ymd(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const clamp = (m: number) => Math.min(END, Math.max(START, m));
  const top = (t: string) => (clamp(toMin(t)) - START) * PX;
  const height = (s: string, e: string) => Math.max(14, (clamp(toMin(e)) - clamp(toMin(s))) * PX);
  const dayHeight = (END - START) * PX;

  // Open the grid near what matters: an hour or so before now, or a normal morning for other weeks.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const focus = days.some((d) => ymd(d) === today) ? nowMin - 90 : 7 * 60;
    el.scrollTop = Math.max(0, (clamp(focus) - START) * PX);
    // Once, when the page opens: later week changes keep the reader's position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <PageHeader
        title="Week"
        subtitle={`${days[0]!.toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${days[6]!.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`}
        action={
          <div className="flex items-center gap-2">
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
            <Button onClick={() => setEditing(blankEvent(new Date(), "16:00"))}>
              <Plus className="h-4 w-4" /> Event
            </Button>
          </div>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${SUBJECT_BG.maths}`} /> Maths
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${SUBJECT_BG.physics}`} /> Physics
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${SUBJECT_BG.ict}`} /> ICT
        </span>
        <span aria-hidden="true" className="h-3 w-px bg-border" />
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm bg-foreground/80" /> Planned study
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm border-l-2 border-l-foreground/60 bg-foreground/10" />{" "}
          Class or event
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm border border-dashed border-foreground/30 bg-hatch" />{" "}
          Study window
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-5 rounded-full bg-signal" /> Now
        </span>
        <span className="sm:ml-auto">Click an empty slot to add an event.</span>
      </div>

      <div
        ref={scroller}
        className="max-h-[calc(100dvh-15rem)] min-h-[26rem] overflow-auto rounded-xl border bg-card"
      >
        <div
          className="grid min-w-[760px]"
          style={{ gridTemplateColumns: `${GUTTER}px repeat(7, 1fr)` }}
        >
          <div className="sticky left-0 top-0 z-30 border-b bg-card" />
          {days.map((d) => {
            const isToday = ymd(d) === today;
            return (
              <div
                key={ymd(d)}
                aria-current={isToday ? "date" : undefined}
                className="sticky top-0 z-20 border-b border-l bg-card px-2 py-1.5 text-center"
              >
                <div
                  className={`text-xs font-medium ${isToday ? "text-foreground" : "text-muted-foreground"}`}
                >
                  {d.toLocaleDateString(undefined, { weekday: "short" })}
                </div>
                <div
                  className={
                    isToday
                      ? "mx-auto mt-0.5 grid h-8 w-8 place-items-center rounded-full bg-signal font-display text-lg font-medium text-signal-foreground"
                      : "mt-0.5 grid h-8 place-items-center font-display text-lg text-foreground"
                  }
                >
                  {d.getDate()}
                </div>
              </div>
            );
          })}

          <div className="sticky left-0 z-10 bg-card" style={{ height: dayHeight }}>
            {Array.from({ length: (END - START) / 60 }, (_, i) =>
              i === 0 ? null : (
                <div
                  key={i}
                  className="absolute right-1.5 -translate-y-1/2 font-mono text-[10px] text-muted-foreground"
                  style={{ top: i * 60 * PX }}
                >
                  {fromMin(START + i * 60)}
                </div>
              ),
            )}
          </div>

          {days.map((d) => {
            const evs = eventsOn(events, d);
            const clash = overlappingIds(evs);
            const slots = layoutOverlaps(evs);
            const isToday = ymd(d) === today;
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            return (
              <div
                key={ymd(d)}
                role="group"
                aria-label={`${WEEKDAY_NAMES[d.getDay()]} ${d.getDate()}`}
                className={`relative cursor-pointer border-l ${isToday ? "bg-signal/[0.07]" : isWeekend ? "bg-muted/40" : ""}`}
                style={{ height: dayHeight }}
                onClick={(ev) => {
                  const y = ev.clientY - ev.currentTarget.getBoundingClientRect().top;
                  const m = START + Math.floor(y / PX / 30) * 30;
                  setEditing(blankEvent(d, fromMin(Math.min(m, END - 60))));
                }}
              >
                {Array.from({ length: (END - START) / 60 }, (_, i) => (
                  <div key={i}>
                    <div
                      className="absolute inset-x-0 border-t border-border"
                      style={{ top: i * 60 * PX }}
                    />
                    <div
                      className="absolute inset-x-0 border-t border-dashed border-border/40"
                      style={{ top: (i * 60 + 30) * PX }}
                    />
                  </div>
                ))}

                {windowsOn(windows, d).map((w, i) => (
                  <div
                    key={i}
                    className="absolute inset-x-0.5 rounded-md border border-dashed border-foreground/25 bg-hatch"
                    style={{ top: top(w.start), height: height(w.start, w.end) }}
                  />
                ))}

                {blocksOn(blocks, d).map((b) => {
                  const task = tasks.find((t) => t.id === b.taskId);
                  const missed = b.status === "missed";
                  const tone = missed
                    ? "border border-dashed border-destructive/70 bg-destructive/10 text-destructive"
                    : `${task ? SUBJECT_BG[task.subject] : "bg-primary"} text-primary-foreground ${b.status === "done" ? "opacity-60" : ""}`;
                  return (
                    <div
                      key={b.id}
                      title={`${task?.title ?? "Study"}, ${b.start}–${b.end}${b.status === "planned" ? "" : ` (${b.status})`}`}
                      className={`absolute inset-x-1 flex items-start gap-1 overflow-hidden rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-tight ${tone}`}
                      style={{ top: top(b.start), height: height(b.start, b.end) }}
                    >
                      {b.status === "done" && (
                        <Check className="mt-px h-3 w-3 shrink-0" aria-label="Done" />
                      )}
                      <span className="min-w-0 truncate">{task?.title ?? "Study"}</span>
                    </div>
                  );
                })}

                {evs.map((e) => {
                  const slot = slots.get(e.id) ?? { col: 0, cols: 1 };
                  const h = height(e.start, e.end);
                  const compact = h < COMPACT_PX;
                  const clashes = clash.has(e.id);
                  return (
                    <button
                      key={e.id}
                      onClick={(x) => {
                        x.stopPropagation();
                        setEditing(e);
                      }}
                      title={`${e.title}, ${e.start}–${e.end}${clashes ? " · overlaps another event" : ""}`}
                      className={`absolute overflow-hidden rounded-md border-l-4 px-1.5 text-left text-[11px] leading-tight outline-offset-1 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-ring ${compact ? "flex items-center py-0" : "py-1"} ${e.subject ? SUBJECT_EVENT[e.subject] : "border-l-muted-foreground bg-muted"} ${clashes ? "ring-1 ring-destructive" : ""}`}
                      style={{
                        top: top(e.start),
                        height: h,
                        left: `calc(${(slot.col / slot.cols) * 100}% + 2px)`,
                        width: `calc(${100 / slot.cols}% - 4px)`,
                      }}
                    >
                      <div className="min-w-0 truncate font-medium text-foreground">
                        {e.kind === "exam" && (
                          <span className="mr-1 rounded-sm bg-foreground px-1 text-[10px] font-semibold text-background">
                            Exam
                          </span>
                        )}
                        {e.title}
                      </div>
                      {!compact && (
                        <div className="truncate font-mono text-muted-foreground">
                          {e.start}–{e.end} · {e.mode === "online" ? "Online" : "Physical"}
                        </div>
                      )}
                    </button>
                  );
                })}

                {isToday && nowMin >= START && nowMin <= END && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 z-20"
                    style={{ top: (nowMin - START) * PX }}
                  >
                    <div className="h-0.5 -translate-y-1/2 bg-signal shadow-[0_0_6px_var(--signal)]" />
                    <span className="absolute -left-1 top-0 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-signal" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <EventDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        initial={editing}
      />
    </>
  );
}
