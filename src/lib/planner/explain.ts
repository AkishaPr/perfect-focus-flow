import type { Task } from "../types";
import { daysBetween, parseYmd } from "./dates";
import { FACTOR_KEYS, isWeakTopic, type ScoringContext } from "./scoring";
import type { FactorKey, ScoreBreakdown } from "./types";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The importance reason's text. Exported so the UI can recognise it and draw stars instead. */
export const importanceReason = (importance: number) => `Importance ${importance}/5`;

function reasonFor(key: FactorKey, task: Task, b: ScoreBreakdown, ctx: ScoringContext): string {
  switch (key) {
    case "overdue":
      return `${plural(Math.max(1, daysBetween(parseYmd(task.deadline ?? ""), ctx.today)), "day")} overdue`;
    case "deadline":
      return b.factors.deadline >= 0.6
        ? `Due ${task.deadline}, tight on time`
        : `Due ${task.deadline}`;
    case "importance":
      return importanceReason(task.importance);
    case "weakTopic":
      return isWeakTopic(task, ctx)
        ? `Weak topic: ${task.topic}`
        : "Subject needs attention (lower recent marks)";
    case "goal":
      return "Counts toward this week's goal";
    case "carryOver":
      return `Carried over ${task.carryOverCount}×`;
  }
}

/** Up to three plain-English reasons, biggest contribution first. Never empty. */
export function explain(task: Task, b: ScoreBreakdown, ctx: ScoringContext): string[] {
  // An overdue task's deadline factor is pinned at 1, which "Due …" would only repeat as "tight".
  const ranked = FACTOR_KEYS.filter((k) => !(k === "deadline" && b.factors.overdue > 0))
    .map((k) => ({ k, c: ctx.weights[k] * b.factors[k] }))
    .filter((x) => x.c > 0)
    .sort((a, z) => z.c - a.c || FACTOR_KEYS.indexOf(a.k) - FACTOR_KEYS.indexOf(z.k))
    .slice(0, 3);
  const reasons = ranked.map((x) => reasonFor(x.k, task, b, ctx));
  return reasons.length > 0 ? reasons : ["Next best use of this time"];
}
