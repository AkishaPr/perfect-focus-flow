import type {
  CalEvent,
  Goal,
  PaperMark,
  PlanBlock,
  Session,
  Settings,
  StoreData,
  Subject,
  Weights,
} from "../types";

/** Tunables with safe defaults. Everything here is a planner knob, not user data. */
export interface PlannerOptions {
  /** How many days to plan, starting today. Default 7. */
  horizonDays?: number;
  /**
   * Fraction of `maxDailyStudyMin` deliberately left unscheduled so one bad day doesn't
   * break the whole plan. Default 0.15. Set 0 to plan right up to the cap.
   */
  slackFraction?: number;
  /** Free gaps shorter than this are ignored. Default 20. */
  minSlotMin?: number;
  /** Keep-clear time either side of an online class (log-on / wind-down). Default 5. */
  onlineBufferMin?: number;
  /** Keep-clear time either side of a physical class (travel). Default 30. */
  physicalBufferMin?: number;
  /** Block times snap to this grid. Default 5. */
  snapMin?: number;
  /** Score points deducted per consecutive same-subject block (max 3 counted). Default 6. */
  varietyPenalty?: number;
  /** "planned" blocks with these ids are frozen: the planner schedules around them and keeps them. */
  lockedBlockIds?: string[];
}

export interface ResolvedOptions {
  horizonDays: number;
  slackFraction: number;
  minSlotMin: number;
  onlineBufferMin: number;
  physicalBufferMin: number;
  snapMin: number;
  varietyPenalty: number;
  lockedBlockIds: Set<string>;
}

export const DEFAULT_OPTIONS: Omit<ResolvedOptions, "lockedBlockIds"> = {
  horizonDays: 7,
  slackFraction: 0.15,
  minSlotMin: 20,
  onlineBufferMin: 5,
  physicalBufferMin: 30,
  snapMin: 5,
  varietyPenalty: 6,
};

export function resolveOptions(o: PlannerOptions = {}): ResolvedOptions {
  return {
    horizonDays: Math.max(1, Math.floor(o.horizonDays ?? DEFAULT_OPTIONS.horizonDays)),
    slackFraction: Math.min(0.9, Math.max(0, o.slackFraction ?? DEFAULT_OPTIONS.slackFraction)),
    minSlotMin: Math.max(5, o.minSlotMin ?? DEFAULT_OPTIONS.minSlotMin),
    onlineBufferMin: Math.max(0, o.onlineBufferMin ?? DEFAULT_OPTIONS.onlineBufferMin),
    physicalBufferMin: Math.max(0, o.physicalBufferMin ?? DEFAULT_OPTIONS.physicalBufferMin),
    snapMin: Math.max(1, Math.floor(o.snapMin ?? DEFAULT_OPTIONS.snapMin)),
    varietyPenalty: Math.max(0, o.varietyPenalty ?? DEFAULT_OPTIONS.varietyPenalty),
    lockedBlockIds: new Set(o.lockedBlockIds ?? []),
  };
}

/** Everything the planner reads. `Pick<StoreData, …>` so `useStore.getState()` can be passed straight in. */
export interface PlannerInput
  extends
    Pick<StoreData, "settings" | "events" | "tasks" | "goals" | "blocks" | "sessions" | "marks">,
    Partial<Pick<StoreData, "mistakes">> {
  now: Date;
  options?: PlannerOptions;
}

export type FactorKey = keyof Weights;
export type Factors = Record<FactorKey, number>;

export interface ScoreBreakdown {
  /** 0–100, the weighted mean of the factors using `settings.weights`. */
  score: number;
  /** Each factor normalised to 0–1. */
  factors: Factors;
}

/** A block the planner produced (or kept). Superset of `PlanBlock`, so it can be persisted as-is. */
export interface ScheduledBlock extends PlanBlock {
  subject: Subject;
  score: number;
  /** Short human reasons, e.g. "2 days overdue". Never empty. */
  reasons: string[];
  /** True for blocks the caller froze via `lockedBlockIds`. */
  locked: boolean;
}

export type UnscheduledReason =
  | "deferred"
  | "no-estimate"
  | "estimate-used-up"
  | "too-long-for-any-slot"
  | "deadline-at-risk"
  | "not-enough-time";

export interface UnscheduledTask {
  taskId: string;
  remainingMin: number;
  reason: UnscheduledReason;
  message: string;
}

export type WarningCode =
  | "no-study-windows"
  | "overdue"
  | "deadline-at-risk"
  | "stuck"
  | "too-long-for-any-slot"
  | "estimate-used-up"
  | "no-estimate";

export interface PlannerWarning {
  code: WarningCode;
  severity: "high" | "medium" | "low";
  message: string;
  taskId?: string;
}

export interface DayCapacity {
  date: string;
  /** Total study-window minutes that day (before classes are removed). */
  windowMin: number;
  /** Minutes actually free after classes, buffers, the clock and locked blocks. */
  freeMin: number;
  /** Minutes planned (new + locked blocks). */
  plannedMin: number;
  /** The daily ceiling after slack: floor(maxDailyStudyMin × (1 − slackFraction)). */
  capMin: number;
}

export interface RankedTask {
  taskId: string;
  remainingMin: number;
  score: number;
  factors: Factors;
}

export interface PlanResult {
  generatedAt: string;
  blocks: ScheduledBlock[];
  unscheduled: UnscheduledTask[];
  warnings: PlannerWarning[];
  capacity: DayCapacity[];
  /** Priority ranking at the moment of planning, best first — feeds a "why" panel. */
  ranking: RankedTask[];
}
