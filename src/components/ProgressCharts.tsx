import { Check } from "lucide-react";
import { SUBJECT_BG } from "@/components/subject-colors";
import { formatMinutes, formatPercent } from "@/lib/format";
import { chartGeometry, smoothPath, spreadLabels } from "@/lib/marks";
import { ymd } from "@/lib/calendar";
import type { WeekStudy, WeekTotal } from "@/lib/progress";
import { stagger } from "@/lib/motion";
import { SUBJECTS, SUBJECT_LABEL, type PaperMark, type Subject } from "@/lib/types";

/**
 * Small hand-built charts (CSS bars and one SVG). Each has a text equivalent: bars carry their
 * value in an accessible label and as visible text, and the marks chart is described in words
 * with every mark also listed below it on the page. Colour is never the only signal.
 *
 * Colour rules (see subject-colors.ts): subject colours mean a subject; the accent (`signal`)
 * marks the one thing you are looking at (today, the selected week, your latest mark); the goal
 * is a neutral dashed line, and a check mark shows where it was reached.
 */

const SUBJECT_STROKE: Record<Subject, string> = {
  maths: "stroke-maths",
  physics: "stroke-physics",
  ict: "stroke-ict",
};
const SUBJECT_FILL: Record<Subject, string> = {
  maths: "fill-maths",
  physics: "fill-physics",
  ict: "fill-ict",
};
const SUBJECT_HALO: Record<Subject, string> = {
  maths: "fill-maths/20",
  physics: "fill-physics/20",
  ict: "fill-ict/20",
};

const BAR_HEIGHT_REM = 8;
/** Room above the tallest bar for the goal label. */
const PLOT_TOP_REM = 1.25;
const local = (date: string) => new Date(`${date}T00:00:00`);

/** "2h" / "45m" / "1h 20m" kept short enough to sit under a narrow bar. */
const compactMinutes = (min: number) => {
  if (min <= 0) return "–";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h${m}`;
};

/** The goal: a neutral dashed line across the bars, labelled at its right-hand end. */
function GoalLine({ min, scale }: { min: number; scale: number }) {
  return (
    <li
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 z-10 list-none"
      style={{ top: `${PLOT_TOP_REM + (1 - min / scale) * BAR_HEIGHT_REM}rem` }}
    >
      <div className="border-t border-dashed border-foreground/50" />
      <span className="absolute -top-[1.15rem] right-0 rounded-sm bg-foreground px-1.5 py-px text-[10px] font-medium text-background">
        Goal {formatMinutes(min)}
      </span>
    </li>
  );
}

/** The value under a bar; a check mark in front when the goal was reached. */
function BarValue({ min, met, hidden }: { min: number; met: boolean; hidden?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-4 items-center gap-0.5 font-mono text-[11px] text-muted-foreground"
    >
      {met && <Check className="h-3 w-3 text-foreground" strokeWidth={3} />}
      {hidden ? "" : compactMinutes(min)}
    </span>
  );
}

// ---------------------------------------------------------------------------------------------
// Study time per day, split by subject, with the daily goal as a dashed line
// ---------------------------------------------------------------------------------------------

export function DailyBars({ week }: { week: WeekStudy }) {
  const scale = Math.max(week.dailyGoalMin, ...week.days.map((d) => d.totalMin), 1);
  const today = ymd(new Date());
  return (
    <ol
      aria-label="Study time per day"
      className="relative grid grid-cols-7 gap-1.5 sm:gap-2"
      style={{ paddingTop: `${PLOT_TOP_REM}rem` }}
    >
      {week.dailyGoalMin > 0 && <GoalLine min={week.dailyGoalMin} scale={scale} />}
      {week.days.map((d, i) => {
        const long = local(d.date).toLocaleDateString(undefined, {
          weekday: "long",
          day: "numeric",
          month: "long",
        });
        const parts = [
          ...SUBJECTS.map((s) => ({
            key: s,
            label: SUBJECT_LABEL[s],
            min: d.bySubject[s],
            cls: SUBJECT_BG[s],
          })),
          { key: "other", label: "Other", min: d.otherMin, cls: "bg-muted-foreground/40" },
        ].filter((p) => p.min > 0);
        const isToday = d.date === today;
        const met = week.dailyGoalMin > 0 && !d.isFuture && d.totalMin >= week.dailyGoalMin;
        const breakdown = parts.length
          ? parts.map((p) => `${p.label} ${formatMinutes(p.min)}`).join(", ")
          : d.isFuture
            ? "not yet"
            : "nothing studied";
        return (
          <li
            key={d.date}
            aria-label={`${long}: ${d.isFuture ? "not yet" : formatMinutes(d.totalMin)}`}
            title={`${long}: ${breakdown}`}
            className={`flex min-w-0 flex-col items-center gap-1.5 rounded-lg pb-1.5 ${isToday ? "bg-signal/10" : ""}`}
          >
            <div
              aria-hidden="true"
              className={`flex w-full items-end justify-center border-b ${d.isFuture ? "border-dotted" : ""}`}
              style={{ height: `${BAR_HEIGHT_REM}rem` }}
            >
              {d.totalMin > 0 && (
                <div
                  className="motion-grow-y flex w-full max-w-10 flex-col-reverse gap-0.5 overflow-hidden rounded-t-md"
                  style={{
                    height: `${(d.totalMin / scale) * 100}%`,
                    minHeight: 3,
                    ...stagger(i),
                  }}
                >
                  {parts.map((p) => (
                    <div
                      key={p.key}
                      className={p.cls}
                      style={{ height: `${(p.min / d.totalMin) * 100}%` }}
                    />
                  ))}
                </div>
              )}
            </div>
            <span
              aria-hidden="true"
              className={
                isToday
                  ? "rounded-full bg-signal px-2 py-0.5 text-[11px] font-semibold text-signal-foreground"
                  : "px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
              }
            >
              {local(d.date).toLocaleDateString(undefined, { weekday: "short" })}
            </span>
            <BarValue min={d.totalMin} met={met} hidden={d.isFuture} />
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------------------------
// The last few weeks against the weekly goal
// ---------------------------------------------------------------------------------------------

export function WeeklyTrend({
  totals,
  goalMin,
  selected,
}: {
  totals: WeekTotal[];
  goalMin: number;
  /** The week being viewed (its Monday), highlighted when it is one of those shown. */
  selected: string;
}) {
  const scale = Math.max(goalMin, ...totals.map((t) => t.totalMin), 1);
  return (
    <ol
      aria-label="Study time per week"
      className="relative grid grid-cols-6 gap-1.5 sm:gap-2"
      style={{ paddingTop: `${PLOT_TOP_REM}rem` }}
    >
      {goalMin > 0 && <GoalLine min={goalMin} scale={scale} />}
      {totals.map((t, i) => {
        const label = local(t.weekStart).toLocaleDateString(undefined, {
          day: "numeric",
          month: "long",
        });
        const isSelected = t.weekStart === selected;
        const met = goalMin > 0 && t.totalMin >= goalMin;
        return (
          <li
            key={t.weekStart}
            aria-label={`Week of ${label}: ${formatMinutes(t.totalMin)}${isSelected ? " (selected)" : ""}`}
            title={`Week of ${label}: ${formatMinutes(t.totalMin)}`}
            className={`flex min-w-0 flex-col items-center gap-1.5 rounded-lg pb-1.5 ${isSelected ? "bg-signal/10" : ""}`}
          >
            <div
              aria-hidden="true"
              className="flex w-full items-end justify-center border-b"
              style={{ height: `${BAR_HEIGHT_REM}rem` }}
            >
              {t.totalMin > 0 && (
                <div
                  className={`motion-grow-y w-full max-w-12 rounded-t-md ${isSelected ? "bg-signal" : "bg-foreground/25"}`}
                  style={{ height: `${(t.totalMin / scale) * 100}%`, minHeight: 3, ...stagger(i) }}
                />
              )}
            </div>
            <span
              aria-hidden="true"
              className={
                isSelected
                  ? "rounded-full bg-signal px-2 py-0.5 text-[11px] font-semibold text-signal-foreground"
                  : "px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
              }
            >
              {local(t.weekStart).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
            </span>
            <BarValue min={t.totalMin} met={met} />
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------------------------
// Paper marks over time
// ---------------------------------------------------------------------------------------------

const W = 640;
const H = 240;
const PAD = { left: 40, right: 52, top: 14, bottom: 30 };
/** Labels closer than this (px, both ways) are nudged apart so they stay readable. */
const LABEL_GAP = 14;
const LABEL_REACH = 56;

export function MarksChart({ marks }: { marks: PaperMark[] }) {
  const { domain, ticks, points } = chartGeometry(marks);
  const x = (v: number) => PAD.left + v * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - v) * (H - PAD.top - PAD.bottom);
  const day = (date: string) =>
    local(date).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const first = points[0]?.mark.date;
  const last = points[points.length - 1]?.mark.date;

  // The latest mark of each subject gets a ring and a direct label, in the accent-free subject
  // colour, so the chart can be read without a legend.
  const latest = SUBJECTS.flatMap((s) => {
    const mine = points.filter((p) => p.subject === s);
    const p = mine[mine.length - 1];
    return p ? [p] : [];
  });
  const labelY = new Map<string, number>();
  {
    // Only labels that sit near each other (in x and y) need to be spread apart.
    const groups: (typeof latest)[] = [];
    for (const p of [...latest].sort((a, b) => x(a.x) - x(b.x))) {
      const g = groups.find((grp) => Math.abs(x(grp[0]!.x) - x(p.x)) < LABEL_REACH);
      if (g) g.push(p);
      else groups.push([p]);
    }
    for (const g of groups) {
      const ys = spreadLabels(
        g.map((p) => y(p.y) + 4),
        LABEL_GAP,
        PAD.top + 4,
        H - PAD.bottom,
      );
      g.forEach((p, i) => labelY.set(p.id, ys[i]!));
    }
  }
  const isLatest = new Set(latest.map((p) => p.id));

  const summary = SUBJECTS.flatMap((s) => {
    const mine = points.filter((p) => p.subject === s);
    const l = mine[mine.length - 1];
    return l
      ? [
          `${SUBJECT_LABEL[s]}: ${mine.length} paper${mine.length === 1 ? "" : "s"}, latest ${formatPercent(l.pct)}`,
        ]
      : [];
  }).join(". ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Paper marks over time. ${summary}.`}
      className="h-auto w-full"
    >
      {ticks.map((t, i) => {
        const v = (t - domain.min) / (domain.max - domain.min);
        const baseline = i === 0;
        return (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(v)}
              y2={y(v)}
              className={baseline ? "stroke-border" : "stroke-border/60"}
              strokeWidth={1}
              strokeDasharray={baseline ? undefined : "2 4"}
            />
            <text
              x={PAD.left - 8}
              y={y(v) + 4}
              textAnchor="end"
              className="fill-muted-foreground font-mono text-[10px]"
            >
              {t}%
            </text>
          </g>
        );
      })}
      {SUBJECTS.map((s) => {
        const mine = points.filter((p) => p.subject === s);
        return mine.length >= 2 ? (
          <path
            key={s}
            data-line={s}
            fill="none"
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            // The curve draws itself in once, left to right (pathLength 1 = the whole line).
            pathLength={1}
            strokeDasharray="1 1"
            className={`${SUBJECT_STROKE[s]} motion-draw`}
            d={smoothPath(mine.map((p) => ({ x: x(p.x), y: y(p.y) })))}
          />
        ) : null;
      })}
      {/* The halo is an ellipse, not a circle: the chart keeps exactly one <circle> per mark. */}
      {points.map((p) => (
        <g key={p.id}>
          {isLatest.has(p.id) && (
            <ellipse cx={x(p.x)} cy={y(p.y)} rx={10} ry={10} className={SUBJECT_HALO[p.subject]} />
          )}
          <circle
            cx={x(p.x)}
            cy={y(p.y)}
            r={isLatest.has(p.id) ? 5.5 : 4}
            strokeWidth={2}
            className={`${SUBJECT_FILL[p.subject]} stroke-card transition-[r] duration-150 hover:[r:7px]`}
          >
            <title>
              {`${SUBJECT_LABEL[p.subject]} · ${p.mark.paperName || "Untitled paper"} · ${formatPercent(p.pct)} · ${day(p.mark.date)}`}
            </title>
          </circle>
        </g>
      ))}
      {latest.map((p) => (
        <text
          key={p.id}
          x={x(p.x) + 14}
          y={labelY.get(p.id)}
          className={`${SUBJECT_FILL[p.subject]} text-[12px] font-semibold`}
        >
          {formatPercent(p.pct)}
        </text>
      ))}
      {first && (
        <text
          x={PAD.left}
          y={H - 8}
          textAnchor={first === last ? "middle" : "start"}
          className="fill-muted-foreground text-[11px]"
          transform={first === last ? `translate(${(W - PAD.left - PAD.right) / 2} 0)` : undefined}
        >
          {day(first)}
        </text>
      )}
      {last && first !== last && (
        <text
          x={W - PAD.right}
          y={H - 8}
          textAnchor="end"
          className="fill-muted-foreground text-[11px]"
        >
          {day(last)}
        </text>
      )}
    </svg>
  );
}
