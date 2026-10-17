import { ymd } from "../calendar";

/** Local midnight of the given moment. */
export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Parse a "yyyy-MM-dd" string as local midnight (same convention as goals.ts). */
export const parseYmd = (s: string) => new Date(`${s}T00:00:00`);

/** Whole calendar days from `a` to `b` (negative when `b` is earlier). Rounds so DST shifts don't leak in. */
export const daysBetween = (a: Date, b: Date) =>
  Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000);

export const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

export { ymd };
