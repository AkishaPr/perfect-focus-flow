import { SUBJECT_BG } from "@/components/subject-colors";
import { formatMinutes, formatPercent } from "@/lib/format";
import { chartGeometry } from "@/lib/marks";
import type { WeekStudy, WeekTotal } from "@/lib/progress";
import { SUBJECTS, SUBJECT_LABEL, type PaperMark, type Subject } from "@/lib/types";

/**
 * Small hand-built charts (CSS bars and one SVG). Each has a text equivalent: bars carry their
 * value in an accessible label and as visible text, and the marks chart is described in words
 * with every mark also listed below it on the page. Colour is never the only signal.
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

const BAR_HEIGHT_REM = 8;
const local = (date: string) => new Date(`${date}T00:00:00`);

/** "2h" / "45m" / "1h 20m" kept short enough to sit under a narrow bar. */
const compactMinutes = (min: number) => {
  if (min <= 0) return "–";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h${m}`;
};

// ---------------------------------------------------------------------------------------------
// Study time per day, split by subject, with the daily goal as a dashed line
// ---------------------------------------------------------------------------------------------

export function DailyBars({ week }: { week: WeekStudy }) {
  const scale = Math.max(week.dailyGoalMin, ...week.days.map((d) => d.totalMin), 1);
  return (
    <ol aria-label="Study time per day" className="relative grid grid-cols-7 gap-2">
      {week.dailyGoalMin > 0 && (
        <li
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 z-10 list-none border-t border-dashed border-muted-foreground/60"
          style={{ top: `${(1 - week.dailyGoalMin / scale) * BAR_HEIGHT_REM}rem` }}
        >
          <span className="absolute right-0 -top-4 rounded bg-card px-1 text-[10px] text-muted-foreground">
            goal {formatMinutes(week.dailyGoalMin)}
          </span>
        </li>
      )}
      {week.days.map((d) => {
        const long = local(d.date).toLocaleDateString(undefined, {
          weekday: "long",
          day: "numeric",
          month: "long",
        });
        const parts = [
          ...SUBJECTS.map((s) => ({ key: s, min: d.bySubject[s], cls: SUBJECT_BG[s] })),
          { key: "other", min: d.otherMin, cls: "bg-muted-foreground/40" },
        ].filter((p) => p.min > 0);
        return (
          <li
            key={d.date}
            aria-label={`${long}: ${d.isFuture ? "not yet" : formatMinutes(d.totalMin)}`}
            className="flex min-w-0 flex-col items-center gap-1.5"
          >
            <div
              aria-hidden="true"
              className="flex w-full items-end justify-center"
              style={{ height: `${BAR_HEIGHT_REM}rem` }}
            >
              {d.totalMin > 0 ? (
                <div
                  className="flex w-full max-w-10 flex-col-reverse overflow-hidden rounded-t-md"
                  style={{
                    height: `${(d.totalMin / scale) * 100}%`,
                    minHeight: 3,
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
              ) : (
                <div className="h-px w-full max-w-10 bg-border" />
              )}
            </div>
            <span aria-hidden="true" className="text-[11px] font-medium text-muted-foreground">
              {local(d.date).toLocaleDateString(undefined, { weekday: "short" })}
            </span>
            <span aria-hidden="true" className="font-mono text-[11px] text-muted-foreground">
              {d.isFuture ? "" : compactMinutes(d.totalMin)}
            </span>
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
    <ol aria-label="Study time per week" className="relative grid grid-cols-6 gap-2">
      {goalMin > 0 && (
        <li
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 z-10 list-none border-t border-dashed border-muted-foreground/60"
          style={{ top: `${(1 - goalMin / scale) * BAR_HEIGHT_REM}rem` }}
        >
          <span className="absolute right-0 -top-4 rounded bg-card px-1 text-[10px] text-muted-foreground">
            goal {formatMinutes(goalMin)}
          </span>
        </li>
      )}
      {totals.map((t) => {
        const label = local(t.weekStart).toLocaleDateString(undefined, {
          day: "numeric",
          month: "long",
        });
        const isSelected = t.weekStart === selected;
        return (
          <li
            key={t.weekStart}
            aria-label={`Week of ${label}: ${formatMinutes(t.totalMin)}${isSelected ? " (selected)" : ""}`}
            className="flex min-w-0 flex-col items-center gap-1.5"
          >
            <div
              aria-hidden="true"
              className="flex w-full items-end justify-center"
              style={{ height: `${BAR_HEIGHT_REM}rem` }}
            >
              {t.totalMin > 0 ? (
                <div
                  className={`w-full max-w-10 rounded-t-md ${isSelected ? "bg-primary" : "bg-primary/35"}`}
                  style={{ height: `${(t.totalMin / scale) * 100}%`, minHeight: 3 }}
                />
              ) : (
                <div className="h-px w-full max-w-10 bg-border" />
              )}
            </div>
            <span
              aria-hidden="true"
              className={`text-[11px] ${isSelected ? "font-semibold text-foreground" : "text-muted-foreground"}`}
            >
              {local(t.weekStart).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
            </span>
            <span aria-hidden="true" className="font-mono text-[11px] text-muted-foreground">
              {compactMinutes(t.totalMin)}
            </span>
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
const PAD = { left: 40, right: 16, top: 12, bottom: 28 };

export function MarksChart({ marks }: { marks: PaperMark[] }) {
  const { domain, ticks, points } = chartGeometry(marks);
  const x = (v: number) => PAD.left + v * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - v) * (H - PAD.top - PAD.bottom);
  const day = (date: string) =>
    local(date).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const first = points[0]?.mark.date;
  const last = points[points.length - 1]?.mark.date;

  const summary = SUBJECTS.flatMap((s) => {
    const mine = points.filter((p) => p.subject === s);
    const latest = mine[mine.length - 1];
    return latest
      ? [
          `${SUBJECT_LABEL[s]}: ${mine.length} paper${mine.length === 1 ? "" : "s"}, latest ${formatPercent(latest.pct)}`,
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
      {ticks.map((t) => {
        const v = (t - domain.min) / (domain.max - domain.min);
        return (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(v)}
              y2={y(v)}
              className="stroke-border"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 8}
              y={y(v) + 4}
              textAnchor="end"
              className="fill-muted-foreground text-[11px]"
            >
              {t}%
            </text>
          </g>
        );
      })}
      {SUBJECTS.map((s) => {
        const mine = points.filter((p) => p.subject === s);
        return mine.length >= 2 ? (
          <polyline
            key={s}
            fill="none"
            strokeWidth={2}
            strokeLinejoin="round"
            className={SUBJECT_STROKE[s]}
            points={mine.map((p) => `${x(p.x)},${y(p.y)}`).join(" ")}
          />
        ) : null;
      })}
      {points.map((p) => (
        <circle
          key={p.id}
          cx={x(p.x)}
          cy={y(p.y)}
          r={4.5}
          strokeWidth={2}
          className={`${SUBJECT_FILL[p.subject]} stroke-card`}
        >
          <title>
            {`${SUBJECT_LABEL[p.subject]} · ${p.mark.paperName || "Untitled paper"} · ${formatPercent(p.pct)} · ${day(p.mark.date)}`}
          </title>
        </circle>
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
