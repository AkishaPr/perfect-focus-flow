/** "45 min", "2h", "1h 20m". Whole minutes. */
export function formatMinutes(min: number): string {
  const n = Math.max(0, Math.round(min));
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** A percentage to at most one decimal, with no trailing ".0": 62, 62.5. */
export function formatPercent(pct: number): string {
  const r = Math.round(pct * 10) / 10;
  return `${Number.isInteger(r) ? r : r.toFixed(1)}%`;
}

/** Percentage points (a difference between two percentages), to at most one decimal: 4, 4.5. */
export function formatPoints(points: number): string {
  const r = Math.round(Math.abs(points) * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}
