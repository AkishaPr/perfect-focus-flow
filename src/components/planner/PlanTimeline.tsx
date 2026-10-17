import { awakeSpan, fmtDur, type DayPlan } from "@/lib/planner";
import { eventsOn, toMin, ymd } from "@/lib/calendar";
import type { CalEvent, PlanBlock, Settings, Task } from "@/lib/types";
import { SUBJECT_BLOCK, hhmm, parseYmd } from "./theme";

const PX = 0.9;
const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const DAYNUM = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

interface Props {
  days: DayPlan[];
  settings: Settings;
  events: CalEvent[];
  locked: PlanBlock[];
  tasks: Map<string, Task>;
  focusId: string | null;
  onFocus: (id: string | null) => void;
  now: Date;
}

export function PlanTimeline({ days, settings, events, locked, tasks, focusId, onFocus, now }: Props) {
  const span = awakeSpan(settings);
  const s0 = Math.floor(span.start / 60) * 60;
  const s1 = Math.ceil(span.end / 60) * 60;
  const height = (s1 - s0) * PX;
  const hours = Array.from({ length: (s1 - s0) / 60 + 1 }, (_, i) => s0 + i * 60);
  const y = (m: number) => (m - s0) * PX;
  const todayKey = ymd(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <div className="flex min-w-fit">
        <div className="sticky left-0 z-20 w-12 shrink-0 border-r bg-card">
          <div className="h-14 border-b" />
          <div className="relative" style={{ height }}>
            {hours.map((h) => (
              <span key={h} className="absolute right-2 -translate-y-1/2 font-mono text-[10px] text-muted-foreground" style={{ top: y(h) }}>
                {hhmm(h)}
              </span>
            ))}
          </div>
        </div>

        {days.map((day) => {
          const date = parseYmd(day.date);
          const isToday = day.date === todayKey;
          const load = day.capacityMin ? Math.min(1, day.plannedMin / day.capacityMin) : 0;
          return (
            <div key={day.date} className="min-w-[132px] flex-1 border-r last:border-r-0">
              <div className={`flex h-14 flex-col justify-center gap-1 border-b px-3 ${isToday ? "bg-primary/5" : ""}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`text-sm font-semibold ${isToday ? "text-primary" : ""}`}>
                    {isToday ? "Today" : WEEKDAY.format(date)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{DAYNUM.format(date)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted" title={`${fmtDur(day.plannedMin)} of ${fmtDur(day.capacityMin)} cap`}>
                    <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${load * 100}%` }} />
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground">{fmtDur(day.plannedMin)}</span>
                </div>
              </div>

              <div className="relative" style={{ height }}>
                {hours.map((h) => (
                  <div key={h} className="absolute inset-x-0 border-t border-border/40" style={{ top: y(h) }} />
                ))}

                {day.free.map((f) => (
                  <div
                    key={`f${f.start}`}
                    className="absolute inset-x-1 rounded-md border border-dashed border-primary/25 bg-primary/[0.03]"
                    style={{ top: y(f.start), height: (f.end - f.start) * PX }}
                    aria-hidden="true"
                  />
                ))}

                {eventsOn(events, date).map((e) => {
                  const a = toMin(e.start);
                  const b = toMin(e.end);
                  return (
                    <div
                      key={e.id}
                      className="absolute inset-x-1 overflow-hidden rounded-md border bg-[repeating-linear-gradient(135deg,var(--muted)_0_6px,transparent_6px_12px)] px-2 py-1 text-[11px] text-muted-foreground"
                      style={{ top: y(a), height: Math.max(14, (b - a) * PX) }}
                      title={`${e.title} · ${e.start}–${e.end}`}
                    >
                      <span className="font-medium text-foreground/80">{e.title}</span>
                    </div>
                  );
                })}

                {day.breaks.map((br) => (
                  <div
                    key={`b${br.start}`}
                    className="absolute inset-x-3 flex items-center justify-center"
                    style={{ top: y(br.start), height: (br.end - br.start) * PX }}
                    aria-hidden="true"
                  >
                    <div className="h-px w-full bg-border" />
                  </div>
                ))}

                {[...locked.filter((b) => b.date === day.date), ...day.blocks].map((b) => {
                  const task = tasks.get(b.taskId);
                  if (!task) return null;
                  const a = toMin(b.start);
                  const h = (toMin(b.end) - a) * PX;
                  const isLocked = b.status !== "planned" || locked.includes(b);
                  const dim = focusId !== null && focusId !== task.id;
                  const hot = focusId === task.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => onFocus(hot ? null : task.id)}
                      title={`${task.title} · ${b.start}–${b.end}`}
                      className={`absolute inset-x-1 overflow-hidden rounded-md border-l-[3px] px-2 py-1 text-left transition-all duration-300 animate-in fade-in zoom-in-95 ${SUBJECT_BLOCK[task.subject]} ${
                        dim ? "opacity-25" : ""
                      } ${hot ? "z-10 ring-2 ring-primary shadow-glow" : "hover:brightness-125"} ${isLocked ? "opacity-60 saturate-50" : ""}`}
                      style={{ top: y(a), height: Math.max(16, h) }}
                    >
                      <div className="truncate text-[11px] font-semibold text-foreground">{task.title}</div>
                      {h > 32 && (
                        <div className="truncate font-mono text-[10px] opacity-80">
                          {b.start}–{b.end}
                          {isLocked && ` · ${b.status}`}
                        </div>
                      )}
                    </button>
                  );
                })}

                {isToday && nowMin >= s0 && nowMin <= s1 && (
                  <div className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top: y(nowMin) }}>
                    <span className="-ml-1 h-2 w-2 rounded-full bg-destructive" />
                    <span className="h-px flex-1 bg-destructive" />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
