import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The ring's circumference in its 120-unit box; `motion-ring` (styles.css) draws from 0 to this. */
const R = 54;
const C = 2 * Math.PI * R;

/**
 * A progress ring. It draws itself in on arrival and glides when the value changes (the
 * `motion-ring` utility), so a ring that fills as work gets done never jumps. Decorative by
 * default: put the same figure in text next to it.
 */
export function ProgressRing({
  pct,
  className,
  barClassName = "stroke-signal",
  children,
}: {
  /** 0 to 1. */
  pct: number;
  className?: string;
  barClassName?: string;
  /** Shown in the middle. */
  children?: ReactNode;
}) {
  const filled = Math.min(1, Math.max(0, pct));
  return (
    <div aria-hidden="true" className={cn("relative shrink-0", className)}>
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={R} fill="none" strokeWidth="10" className="stroke-muted" />
        <circle
          data-ring=""
          cx="60"
          cy="60"
          r={R}
          fill="none"
          strokeWidth="10"
          strokeLinecap={filled > 0 ? "round" : "butt"}
          strokeDasharray={`${C * filled} ${C}`}
          className={cn("motion-ring", barClassName)}
        />
      </svg>
      {children && <div className="absolute inset-0 grid place-items-center">{children}</div>}
    </div>
  );
}
