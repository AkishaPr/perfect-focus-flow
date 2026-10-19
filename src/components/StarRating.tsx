import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_STARS = 5;

/**
 * A 1–5 rating as gold stars: filled for the value, outlined for the rest.
 * The accessible name carries the number, so the stars are never the only signal.
 */
export function StarRating({
  value,
  label = "Importance",
  className,
}: {
  value: number;
  label?: string;
  className?: string;
}) {
  const filled = Math.min(MAX_STARS, Math.max(0, Math.round(value)));
  return (
    <span
      role="img"
      aria-label={`${label} ${filled} of ${MAX_STARS}`}
      title={`${label} ${filled} of ${MAX_STARS}`}
      className={cn("inline-flex items-center gap-0.5", className)}
    >
      {Array.from({ length: MAX_STARS }, (_, i) => (
        <Star
          key={i}
          aria-hidden="true"
          className={cn(
            "h-3.5 w-3.5",
            i < filled
              ? "fill-amber-400 text-amber-400"
              : "fill-transparent text-muted-foreground/40",
          )}
        />
      ))}
    </span>
  );
}
