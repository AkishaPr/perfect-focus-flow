import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * A small burst of sparks that plays once and leaves nothing behind. Place it inside a `relative`
 * element: the sparks start at its centre. Sparks fly in fixed directions (no randomness), so it
 * looks the same on the server and in the browser, and in tests.
 *
 * Kept small and quiet on purpose: a handful of sparks in the app's own accent colours, under a
 * second, for moments worth marking. People who ask for reduced motion see none of it.
 */

const COLORS = ["bg-signal", "bg-success", "bg-warning"] as const;
const REACH = [1, 0.7, 0.88] as const;
const SIZE = [4, 3, 5] as const;

export function SparkleBurst({
  count = 8,
  radius = 24,
  durationMs = 700,
  className,
}: {
  count?: number;
  /** How far the farthest spark travels, in px. */
  radius?: number;
  durationMs?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-sparkle=""
      className={cn("pointer-events-none absolute inset-0", className)}
    >
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
        const dist = radius * REACH[i % REACH.length]!;
        const size = SIZE[i % SIZE.length]!;
        const style = {
          width: size,
          height: size,
          marginLeft: -size / 2,
          marginTop: -size / 2,
          "--dx": `${(Math.cos(angle) * dist).toFixed(1)}px`,
          "--dy": `${(Math.sin(angle) * dist).toFixed(1)}px`,
          "--spark-ms": `${durationMs}ms`,
        } as CSSProperties;
        return (
          <span
            key={i}
            className={cn(
              "motion-spark absolute left-1/2 top-1/2 rounded-full",
              COLORS[i % COLORS.length],
            )}
            style={style}
          />
        );
      })}
    </span>
  );
}
