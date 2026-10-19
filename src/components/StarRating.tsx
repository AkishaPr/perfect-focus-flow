import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_STARS = 5;

/**
 * A 1–5 rating as outlined stars: gold for the value, grey for the rest.
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
      className={cn("inline-flex items-center gap-1.5", className)}
    >
      {Array.from({ length: MAX_STARS }, (_, i) => (
        <Star
          key={i}
          aria-hidden="true"
          data-filled={i < filled}
          className={cn("h-4 w-4", i < filled ? "text-yellow-500" : "text-muted-foreground")}
        />
      ))}
    </span>
  );
}
