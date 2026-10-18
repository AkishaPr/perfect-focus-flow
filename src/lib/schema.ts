import { z } from "zod";
import { toMin } from "./calendar";
import {
  SUBJECTS,
  TASK_TYPES,
  type CalEvent,
  type Goal,
  type PaperMark,
  type PlanBlock,
  type Session,
  type Settings,
  type StoreData,
  type Task,
} from "./types";

/**
 * Pure validation for persisted / imported data. No React, no store imports, so it is
 * unit-testable and reusable by the planner stages. `store.ts` owns persistence and calls
 * `sanitizeStoreData` from `migrate()`.
 *
 * Philosophy: never throw away a whole backup because one entry is bad. Reject only what is
 * clearly not a backup (wrong shape, newer version). Otherwise drop/repair the individual bad
 * pieces and *report* exactly what changed so the UI can tell the user.
 */

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function isRealDate(s: string): boolean {
  if (!YMD.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export const timeStr = z.string().regex(HHMM);
export const dateStr = z.string().refine(isRealDate, "Invalid date");
const id = z.string().min(1);
const nonNeg = z.number().finite().min(0);
const subject = z.enum(SUBJECTS);
const taskType = z.enum(TASK_TYPES);

export const eventSchema = z
  .object({
    id,
    title: z.string(),
    kind: z.enum(["class", "exam", "other"]),
    mode: z.enum(["online", "physical"]),
    subject: subject.optional(),
    recurrence: z.enum(["none", "weekly"]),
    date: z.string().optional(),
    weekday: z.number().int().min(0).max(6).optional(),
    start: timeStr,
    end: timeStr,
  })
  .superRefine((e, ctx) => {
    if (toMin(e.end) <= toMin(e.start)) ctx.addIssue({ code: "custom", message: "end <= start" });
    if (e.recurrence === "weekly" && e.weekday === undefined)
      ctx.addIssue({ code: "custom", message: "weekly event needs weekday" });
    if (e.recurrence === "none" && !(e.date && isRealDate(e.date)))
      ctx.addIssue({ code: "custom", message: "one-time event needs a valid date" });
  });

export const taskSchema = z.object({
  id,
  title: z.string().min(1),
  subject,
  topic: z.string(),
  type: taskType,
  estimateMin: nonNeg,
  deadline: dateStr.optional(),
  importance: z.number().int().min(1).max(5),
  splittable: z.boolean(),
  minChunkMin: nonNeg,
  status: z.enum(["todo", "in_progress", "done", "missed", "deferred"]),
  goalId: z.string().optional(),
  carryOverCount: z.number().int().min(0),
  createdAt: z.string().min(1),
  /** ISO timestamp set when the task is marked done (used from Stage 3b on). */
  completedAt: z.string().min(1).optional(),
});

export const goalSchema = z.object({
  id,
  weekStart: dateStr,
  type: taskType,
  target: z.number().finite().min(1),
  title: z.string().min(1),
});

export const blockSchema = z.object({
  id,
  taskId: id,
  date: dateStr,
  start: timeStr,
  end: timeStr,
  status: z.enum(["planned", "done", "missed", "partial"]),
});

export const sessionSchema = z.object({
  id,
  taskId: id,
  start: z.string().min(1),
  end: z.string().min(1),
  actualMin: nonNeg,
  blockId: id.optional(),
});

export const markSchema = z
  .object({
    id,
    subject,
    paperName: z.string(),
    date: dateStr,
    score: nonNeg,
    max: z.number().finite().positive(),
  })
  .refine((m) => m.score <= m.max, "score exceeds max");

const windowSchema = z
  .object({ day: z.number().int().min(0).max(6), start: timeStr, end: timeStr })
  .refine((w) => toMin(w.end) > toMin(w.start), "window must end after it starts");
const weakTopicSchema = z.object({ subject, topic: z.string() });

const SCALAR_SETTINGS = {
  timezone: z.string().min(1),
  wake: timeStr,
  sleep: timeStr,
  focusMin: nonNeg,
  breakMin: nonNeg,
  maxDailyStudyMin: nonNeg,
  dailyGoalMin: nonNeg,
  weeklyGoalMin: nonNeg,
} as const;
const WEIGHT_KEYS = [
  "deadline",
  "overdue",
  "importance",
  "weakTopic",
  "goal",
  "carryOver",
] as const;

export const DATA_KEYS = [
  "settings",
  "events",
  "tasks",
  "goals",
  "blocks",
  "sessions",
  "marks",
] as const;

export interface MigrationReport {
  /** Backup/stored version, or null if the data had none. */
  fromVersion: number | null;
  /** Entries thrown away, by collection (only non-zero counts are present). */
  dropped: Record<string, number>;
  /** Values reset to defaults or links cleared, in plain words. */
  repaired: string[];
}

export const isCleanReport = (r: MigrationReport) =>
  r.repaired.length === 0 && Object.values(r.dropped).every((n) => n === 0);

/** One line per change, for banners and import previews. */
export function describeReport(r: MigrationReport): string[] {
  const lines = Object.entries(r.dropped)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} invalid ${k} entr${n === 1 ? "y was" : "ies were"} skipped`);
  return [...lines, ...r.repaired];
}

/** Thrown when the input is clearly not an A/L Command Center backup. */
export class InvalidBackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidBackupError";
  }
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function parseList<S extends z.ZodTypeAny>(
  raw: unknown,
  schema: S,
  opts: { uniqueIds?: boolean } = {},
): { items: z.output<S>[]; dropped: number } {
  if (raw === undefined) return { items: [], dropped: 0 };
  if (!Array.isArray(raw)) return { items: [], dropped: 1 };
  const items: z.output<S>[] = [];
  const seen = new Set<string>();
  let dropped = 0;
  for (const entry of raw) {
    const r = schema.safeParse(entry);
    if (!r.success) {
      dropped++;
      continue;
    }
    if (opts.uniqueIds) {
      const key = (r.data as { id: string }).id;
      if (seen.has(key)) {
        dropped++;
        continue;
      }
      seen.add(key);
    }
    items.push(r.data);
  }
  return { items, dropped };
}

/**
 * Validate `raw` against the current data model. `base` supplies defaults for anything missing.
 * Throws `InvalidBackupError` only when `raw` is clearly not a usable backup.
 */
export function sanitizeStoreData(
  raw: unknown,
  base: StoreData,
  currentVersion: number,
): { data: StoreData; report: MigrationReport } {
  if (!isObj(raw)) {
    throw new InvalidBackupError("Not an A/L Command Center backup (expected a JSON object).");
  }
  const fromVersion = typeof raw["version"] === "number" ? raw["version"] : null;
  if (fromVersion !== null && fromVersion > currentVersion) {
    throw new InvalidBackupError(
      `This backup comes from a newer version of the app (v${fromVersion}); this app understands up to v${currentVersion}.`,
    );
  }
  if (!DATA_KEYS.some((k) => raw[k] !== undefined)) {
    throw new InvalidBackupError("No A/L Command Center data found in this file.");
  }

  const report: MigrationReport = { fromVersion, dropped: {}, repaired: [] };
  const drop = (key: string, n: number) => {
    if (n > 0) report.dropped[key] = (report.dropped[key] ?? 0) + n;
  };

  // ---- settings: repair field by field, never reject the whole object ----
  if (raw["settings"] !== undefined && !isObj(raw["settings"])) {
    report.repaired.push("settings were unreadable and were reset to defaults");
  }
  const rs = isObj(raw["settings"]) ? raw["settings"] : {};
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(SCALAR_SETTINGS) as (keyof typeof SCALAR_SETTINGS)[]) {
    const r = SCALAR_SETTINGS[key].safeParse(rs[key]);
    if (r.success) out[key] = r.data;
    else {
      out[key] = base.settings[key];
      if (rs[key] !== undefined) report.repaired.push(`setting "${key}" was invalid and was reset`);
    }
  }
  const rw = isObj(rs["weights"]) ? rs["weights"] : {};
  const weights: Record<string, number> = {};
  for (const k of WEIGHT_KEYS) {
    const r = nonNeg.safeParse(rw[k]);
    if (r.success) weights[k] = r.data;
    else {
      weights[k] = base.settings.weights[k];
      if (rw[k] !== undefined) report.repaired.push(`weight "${k}" was invalid and was reset`);
    }
  }
  out["weights"] = weights;
  if (rs["studyWindows"] === undefined) out["studyWindows"] = base.settings.studyWindows;
  else {
    const w = parseList(rs["studyWindows"], windowSchema);
    out["studyWindows"] = w.items;
    drop("studyWindows", w.dropped);
  }
  if (rs["weakTopics"] === undefined) out["weakTopics"] = base.settings.weakTopics;
  else {
    const w = parseList(rs["weakTopics"], weakTopicSchema);
    out["weakTopics"] = w.items;
    drop("weakTopics", w.dropped);
  }

  // ---- collections: keep the good entries, count the bad ----
  const events = parseList(raw["events"], eventSchema, { uniqueIds: true });
  const tasks = parseList(raw["tasks"], taskSchema, { uniqueIds: true });
  const goals = parseList(raw["goals"], goalSchema, { uniqueIds: true });
  const blocks = parseList(raw["blocks"], blockSchema, { uniqueIds: true });
  const sessions = parseList(raw["sessions"], sessionSchema, { uniqueIds: true });
  const marks = parseList(raw["marks"], markSchema, { uniqueIds: true });
  drop("events", events.dropped);
  drop("tasks", tasks.dropped);
  drop("goals", goals.dropped);
  drop("blocks", blocks.dropped);
  drop("sessions", sessions.dropped);
  drop("marks", marks.dropped);

  // A task pointing at a goal that no longer exists would show a blank goal picker: clear the link.
  // (Blocks/sessions for deleted tasks are deliberately kept: they are study history.)
  const goalIds = new Set(goals.items.map((g) => g.id));
  let unlinked = 0;
  const fixedTasks = tasks.items.map((t) => {
    if (t.goalId !== undefined && !goalIds.has(t.goalId)) {
      unlinked++;
      const { goalId: _gone, ...rest } = t;
      return rest;
    }
    return t;
  });
  if (unlinked > 0) {
    report.repaired.push(
      `${unlinked} task${unlinked === 1 ? "" : "s"} linked to a missing goal ${unlinked === 1 ? "was" : "were"} unlinked`,
    );
  }

  const data: StoreData = {
    version: currentVersion,
    settings: out as unknown as Settings,
    events: events.items as unknown as CalEvent[],
    tasks: fixedTasks as unknown as Task[],
    goals: goals.items as unknown as Goal[],
    blocks: blocks.items as unknown as PlanBlock[],
    sessions: sessions.items as unknown as Session[],
    marks: marks.items as unknown as PaperMark[],
  };
  return { data, report };
}

