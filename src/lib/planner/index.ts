/**
 * Smart planner engine (Stage 4). Pure: no React, no store, no clock. Pass `now` in.
 *
 *   generatePlan(input) -> { blocks, unscheduled, warnings, capacity, ranking }
 *
 * The plan is *derived*: run it again whenever tasks, events or the clock change. Only user
 * decisions (locked blocks, sessions, statuses) are persisted. How it works:
 *
 *  1. Free time = study windows − classes/exams/events (+ travel buffers) − locked blocks − the past.
 *  2. Walk the free slots in time order. At each point pick the best task that fits, by priority
 *     score (settings.weights) minus a small penalty for repeating the same subject.
 *  3. Splittable tasks are cut into focus-sized blocks with breaks; others need one contiguous gap.
 *  4. Whatever doesn't fit is reported, with a reason, never silently dropped or overbooked.
 */
import {
  addDays,
  dayMin,
  fromMin,
  studyDayKey,
  studyDayStart,
  studyMinute,
  toMin,
} from "../calendar";
import type { PlanBlock, Subject, Task } from "../types";
import { buildDaySlots, windowMinutes, type Slot } from "./availability";
import { daysBetween, parseYmd, startOfDay, ymd } from "./dates";
import { explain } from "./explain";
import { studiedMinOn } from "./studied";
import { buildScoringContext, remainingMin, scoreTask, STUCK_CARRY_OVER } from "./scoring";
import {
  resolveOptions,
  type DayCapacity,
  type PlanResult,
  type PlannerInput,
  type PlannerWarning,
  type RankedTask,
  type ScheduledBlock,
  type ScoreBreakdown,
  type UnscheduledTask,
} from "./types";

export * from "./types";
export { buildDaySlots, mergeIntervals, subtractIntervals, windowMinutes } from "./availability";
export {
  RECENT_PAPERS,
  buildScoringContext,
  recentAverage,
  remainingMin,
  scoreTask,
  spentMin,
  subjectWeakness,
} from "./scoring";
export { sessionDate, studiedMinOn } from "./studied";
export {
  autoWeakTopics,
  MIN_MARKS_LOST,
  MISTAKE_WINDOW_DAYS,
  mergeWeakTopics,
  mistakeError,
  normTopic,
  recentMistakes,
  TOPICS_PER_SUBJECT,
  topicLosses,
  type TopicLoss,
  windowStart,
} from "./mistakes";

interface Candidate {
  task: Task;
  remaining: number;
}

interface Choice {
  c: Candidate;
  len: number;
  b: ScoreBreakdown;
  adj: number;
}

const FALLBACK_FOCUS_MIN = 50;
const MIN_CHUNK_FLOOR = 5;
const SEVERITY = { high: 0, medium: 1, low: 2 } as const;

/** Planned blocks whose end has already passed: input for the (Stage 7) missed-task flow. */
export function findMissedBlocks(blocks: PlanBlock[], now: Date): PlanBlock[] {
  const today = studyDayKey(now);
  const nowMin = studyMinute(now);
  return blocks.filter(
    (b) =>
      b.status === "planned" && (b.date < today || (b.date === today && dayMin(b.end) <= nowMin)),
  );
}

/** How long a block to cut for `c` given `maxLen` free minutes, or null if it can't be placed here. */
function chooseLength(c: Candidate, maxLen: number, focusMin: number): number | null {
  const { task, remaining } = c;
  if (!task.splittable) return remaining <= maxLen ? remaining : null;
  const minChunk = Math.min(Math.max(task.minChunkMin, MIN_CHUNK_FLOOR), remaining);
  const focus = focusMin > 0 ? focusMin : FALLBACK_FOCUS_MIN;
  let len = Math.min(remaining, focus, maxLen);
  const leftover = remaining - len;
  if (leftover > 0 && leftover < minChunk) {
    // Don't strand a sliver: stretch this block to finish the task, or leave a full chunk.
    len = remaining <= maxLen ? remaining : remaining - minChunk;
  }
  return len >= minChunk || len === remaining ? (len > 0 ? len : null) : null;
}

const byTieBreak = (a: Task, b: Task) =>
  (a.deadline ?? "9999-99-99").localeCompare(b.deadline ?? "9999-99-99") ||
  a.createdAt.localeCompare(b.createdAt) ||
  a.id.localeCompare(b.id);

export function generatePlan(input: PlannerInput): PlanResult {
  const opts = resolveOptions(input.options);
  const { now, settings } = input;
  const today = studyDayStart(now);
  const todayStr = ymd(today);
  const nowMin = studyMinute(now);
  const dates = Array.from({ length: opts.horizonDays }, (_, i) => addDays(today, i));
  const dateStrs = dates.map(ymd);
  const lastDate = dates[dates.length - 1]!;
  const lastDateStr = ymd(lastDate);
  const tasksById = new Map(input.tasks.map((t) => [t.id, t]));

  // ---- 1. Frozen blocks: kept as-is, scheduled around, counted against the day's cap ----
  const lockedBlocks = input.blocks.filter((b) => {
    const t = tasksById.get(b.taskId);
    return (
      opts.lockedBlockIds.has(b.id) &&
      b.status === "planned" &&
      t !== undefined &&
      t.status !== "done" &&
      dateStrs.includes(b.date) &&
      (b.date !== todayStr || dayMin(b.end) > nowMin)
    );
  });
  const lockedMinFor = new Map<string, number>();
  const lockedMinOn = new Map<string, number>();
  for (const b of lockedBlocks) {
    const len = toMin(b.end) - toMin(b.start);
    lockedMinFor.set(b.taskId, (lockedMinFor.get(b.taskId) ?? 0) + len);
    lockedMinOn.set(b.date, (lockedMinOn.get(b.date) ?? 0) + len);
  }
  const doneTodayMin = studiedMinOn(todayStr, input.blocks, input.sessions);

  // ---- 2. Free slots and per-day caps ----
  const slots: Slot[] = [];
  const capacity: DayCapacity[] = [];
  const capLeft = new Map<string, number>();
  const dayCap = Math.max(0, Math.floor(settings.maxDailyStudyMin * (1 - opts.slackFraction)));
  for (const date of dates) {
    const day = ymd(date);
    const occupied = lockedBlocks
      .filter((b) => b.date === day)
      .map((b) => ({ start: toMin(b.start), end: toMin(b.end) }));
    const daySlots = buildDaySlots({
      date,
      windows: settings.studyWindows,
      events: input.events,
      occupied,
      now,
      opts,
    });
    slots.push(...daySlots);
    const used = (lockedMinOn.get(day) ?? 0) + (day === todayStr ? doneTodayMin : 0);
    capLeft.set(day, Math.max(0, dayCap - used));
    capacity.push({
      date: day,
      windowMin: windowMinutes(date, settings.studyWindows),
      freeMin: daySlots.reduce((s, x) => s + (x.end - x.start), 0),
      plannedMin: 0,
      capMin: dayCap,
    });
  }
  const longestSlot = slots.reduce((m, s) => Math.max(m, s.end - s.start), 0);

  // ---- 3. Candidates ----
  const ctx = buildScoringContext({
    now,
    settings,
    tasks: input.tasks,
    goals: input.goals,
    marks: input.marks,
    mistakes: input.mistakes ?? [],
  });
  const unscheduled: UnscheduledTask[] = [];
  const warnings: PlannerWarning[] = [];
  const candidates: Candidate[] = [];
  const maxContiguous = Math.min(longestSlot, dayCap);

  for (const task of input.tasks) {
    if (task.status === "done") continue;
    if (task.status === "deferred") {
      unscheduled.push({
        taskId: task.id,
        remainingMin: remainingMin(task, input.sessions),
        reason: "deferred",
        message: `"${task.title}" is deferred, so it isn't planned.`,
      });
      continue;
    }
    if (task.estimateMin <= 0) {
      unscheduled.push({
        taskId: task.id,
        remainingMin: 0,
        reason: "no-estimate",
        message: `"${task.title}" has no time estimate, so it can't be planned.`,
      });
      warnings.push({
        code: "no-estimate",
        severity: "low",
        taskId: task.id,
        message: `Add a time estimate to "${task.title}" so it can be planned.`,
      });
      continue;
    }
    const base = remainingMin(task, input.sessions);
    if (base <= 0) {
      unscheduled.push({
        taskId: task.id,
        remainingMin: 0,
        reason: "estimate-used-up",
        message: `You've logged all of the estimated time on "${task.title}".`,
      });
      warnings.push({
        code: "estimate-used-up",
        severity: "low",
        taskId: task.id,
        message: `"${task.title}" has used its whole estimate. Mark it done or raise the estimate.`,
      });
      continue;
    }
    const remaining = base - (lockedMinFor.get(task.id) ?? 0);
    if (remaining <= 0) continue; // fully covered by locked blocks

    if (!task.splittable && slots.length > 0 && remaining > maxContiguous) {
      unscheduled.push({
        taskId: task.id,
        remainingMin: remaining,
        reason: "too-long-for-any-slot",
        message: `"${task.title}" needs ${remaining} min in one go, but the longest free stretch is ${maxContiguous} min.`,
      });
      warnings.push({
        code: "too-long-for-any-slot",
        severity: "medium",
        taskId: task.id,
        message: `"${task.title}" needs ${remaining} min in one go. Free a longer window or let it be split.`,
      });
      continue;
    }
    candidates.push({ task, remaining });
  }

  // ---- 4. Priority at planning time (for the "why" panel) ----
  /** Free study minutes from slot `si` (starting at `cursor`) to the end of `deadline`'s day. */
  const capacityUntil = (si: number, cursor: number, deadline: string): number => {
    const free = new Map<string, number>();
    for (let j = si; j < slots.length; j++) {
      const s = slots[j]!;
      if (s.date > deadline) break;
      const from = j === si ? Math.max(cursor, s.start) : s.start;
      free.set(s.date, (free.get(s.date) ?? 0) + Math.max(0, s.end - from));
    }
    let total = 0;
    for (const [d, f] of free) total += Math.min(f, capLeft.get(d) ?? 0);
    if (deadline > lastDateStr) {
      total += daysBetween(lastDate, parseYmd(deadline)) * settings.dailyGoalMin;
    }
    return total;
  };
  const scoreAt = (c: Candidate, si: number, cursor: number): ScoreBreakdown =>
    scoreTask(
      c.task,
      c.remaining,
      c.task.deadline ? capacityUntil(si, cursor, c.task.deadline) : 0,
      ctx,
    );

  const ranking: RankedTask[] = candidates
    .map((c) => ({ c, b: scoreAt(c, 0, slots[0]?.start ?? 0) }))
    .sort((a, z) => z.b.score - a.b.score || byTieBreak(a.c.task, z.c.task))
    .map(({ c, b }) => ({
      taskId: c.task.id,
      remainingMin: c.remaining,
      score: b.score,
      factors: b.factors,
    }));

  // ---- 5. Walk the free time in order, always placing the best fit ----
  const placed: ScheduledBlock[] = [];
  const plannedOn = new Map<string, number>();
  let curDay = "";
  let lastSubject: Subject | null = null;
  let streak = 0;

  for (let si = 0; si < slots.length; si++) {
    const slot = slots[si]!;
    if (slot.date !== curDay) {
      curDay = slot.date;
      lastSubject = null;
      streak = 0;
    }
    let cursor = slot.start;
    while (cursor < slot.end) {
      const cap = capLeft.get(slot.date) ?? 0;
      const maxLen = Math.min(slot.end - cursor, cap);
      if (maxLen <= 0) break;

      let best = null as Choice | null;
      for (const c of candidates) {
        if (c.remaining <= 0) continue;
        const dl = c.task.deadline;
        if (dl !== undefined && dl >= todayStr && slot.date > dl) continue; // must land by its deadline
        const len = chooseLength(c, maxLen, settings.focusMin);
        if (len === null) continue;
        const b = scoreAt(c, si, cursor);
        const penalty: number =
          lastSubject === c.task.subject ? opts.varietyPenalty * Math.min(streak, 3) : 0;
        const adj: number = b.score - penalty;
        if (
          best === null ||
          adj > best.adj + 1e-9 ||
          (Math.abs(adj - best.adj) <= 1e-9 && byTieBreak(c.task, best.c.task) < 0)
        ) {
          best = { c, len, b, adj };
        }
      }
      if (best === null) break; // nothing fits what's left of this slot

      const { c, len, b } = best;
      const start = fromMin(cursor);
      placed.push({
        id: `plan:${c.task.id}:${slot.date}:${start}`,
        taskId: c.task.id,
        date: slot.date,
        start,
        end: fromMin(cursor + len),
        status: "planned",
        subject: c.task.subject,
        score: b.score,
        reasons: explain(c.task, b, ctx),
        locked: false,
      });
      c.remaining -= len;
      capLeft.set(slot.date, cap - len);
      plannedOn.set(slot.date, (plannedOn.get(slot.date) ?? 0) + len);
      streak = lastSubject === c.task.subject ? streak + 1 : 1;
      lastSubject = c.task.subject;
      cursor += len + Math.max(0, settings.breakMin);
    }
  }

  // ---- 6. Leftovers: report, don't hide ----
  for (const c of candidates) {
    if (c.remaining <= 0) continue;
    const { task } = c;
    const dl = task.deadline;
    const overdue = dl !== undefined && dl < todayStr;
    const dueInHorizon = dl !== undefined && dl >= todayStr && dl <= lastDateStr;
    if (dueInHorizon || overdue) {
      unscheduled.push({
        taskId: task.id,
        remainingMin: c.remaining,
        reason: "deadline-at-risk",
        message: `${c.remaining} min of "${task.title}" doesn't fit${overdue ? "" : ` before ${dl}`}.`,
      });
      if (dueInHorizon) {
        warnings.push({
          code: "deadline-at-risk",
          severity: "high",
          taskId: task.id,
          message: `"${task.title}" is due ${dl} but ${c.remaining} min won't fit. Free time, cut something, or move the deadline.`,
        });
      }
    } else {
      unscheduled.push({
        taskId: task.id,
        remainingMin: c.remaining,
        reason: "not-enough-time",
        message: `${c.remaining} min of "${task.title}" doesn't fit in the next ${opts.horizonDays} days.`,
      });
    }
  }
  for (const task of input.tasks) {
    if (task.status === "done") continue;
    if (task.deadline && task.deadline < todayStr) {
      const n = Math.max(1, daysBetween(parseYmd(task.deadline), today));
      warnings.push({
        code: "overdue",
        severity: n >= 3 ? "high" : "medium",
        taskId: task.id,
        message: `"${task.title}" is ${n} day${n === 1 ? "" : "s"} overdue.`,
      });
    }
    if (task.carryOverCount >= STUCK_CARRY_OVER) {
      warnings.push({
        code: "stuck",
        severity: "medium",
        taskId: task.id,
        message: `"${task.title}" has been carried over ${task.carryOverCount} times. Split it, shrink it or drop it.`,
      });
    }
  }
  if (slots.length === 0) {
    warnings.push({
      code: "no-study-windows",
      severity: "high",
      message: `No free study time in the next ${opts.horizonDays} days. Check your study windows in Settings.`,
    });
  }

  // ---- 7. Assemble ----
  const lockedScheduled: ScheduledBlock[] = lockedBlocks.map((b) => ({
    ...b,
    subject: tasksById.get(b.taskId)!.subject,
    score: 0,
    reasons: ["Pinned"],
    locked: true,
  }));
  const blocks = [...lockedScheduled, ...placed].sort(
    (a, z) =>
      a.date.localeCompare(z.date) || a.start.localeCompare(z.start) || a.id.localeCompare(z.id),
  );
  for (const d of capacity)
    d.plannedMin = (plannedOn.get(d.date) ?? 0) + (lockedMinOn.get(d.date) ?? 0);
  warnings.sort((a, z) => SEVERITY[a.severity] - SEVERITY[z.severity]);

  return {
    generatedAt: now.toISOString(),
    blocks,
    unscheduled,
    warnings,
    capacity,
    ranking,
  };
}
