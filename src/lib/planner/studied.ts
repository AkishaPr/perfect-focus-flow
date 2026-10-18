import { toMin } from "../calendar";
import type { PlanBlock, Session } from "../types";
import { ymd } from "./dates";

/** The local calendar day a session started on, or null if its timestamp can't be read. */
export function sessionDate(s: Pick<Session, "start">): string | null {
  const d = new Date(s.start);
  return Number.isNaN(d.getTime()) ? null : ymd(d);
}

/**
 * Minutes studied on a day: the one definition shared by the planner's daily cap, the Today
 * page and (later) Progress.
 *
 * - Every session counts by its `actualMin` (real time, pauses and breaks excluded).
 * - A done/partial block counts by its length only when no session points at it. That covers
 *   blocks finished with "Mark done" and no timer, and stops a timed block being counted twice.
 */
export function studiedMinOn(date: string, blocks: PlanBlock[], sessions: Session[]): number {
  const todays = sessions.filter((s) => sessionDate(s) === date);
  const linked = new Set(sessions.map((s) => s.blockId).filter((id) => id !== undefined));
  const fromSessions = todays.reduce((sum, s) => sum + s.actualMin, 0);
  const fromBlocks = blocks
    .filter(
      (b) =>
        b.date === date && (b.status === "done" || b.status === "partial") && !linked.has(b.id),
    )
    .reduce((sum, b) => sum + Math.max(0, toMin(b.end) - toMin(b.start)), 0);
  return fromSessions + fromBlocks;
}
