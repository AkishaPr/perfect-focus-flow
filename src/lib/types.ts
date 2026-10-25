export const SUBJECTS = ["maths", "physics", "ict"] as const;
export type Subject = (typeof SUBJECTS)[number];
export const SUBJECT_LABEL: Record<Subject, string> = {
  maths: "Combined Maths",
  physics: "Physics",
  ict: "ICT",
};

export const TASK_TYPES = [
  "homework",
  "paper",
  "revision",
  "chapter",
  "recording",
  "other",
] as const;
export type TaskType = (typeof TASK_TYPES)[number];
export type TaskStatus = "todo" | "in_progress" | "done" | "missed" | "deferred";

/** Why marks were lost. Concept gaps and time pressure point at a topic; carelessness is a habit. */
export const MISTAKE_CAUSES = ["concept", "careless", "time"] as const;
export type MistakeCause = (typeof MISTAKE_CAUSES)[number];
export const MISTAKE_CAUSE_LABEL: Record<MistakeCause, string> = {
  concept: "Didn't know / understand it",
  careless: "Careless slip",
  time: "Ran out of time",
};

export interface StudyWindow {
  day: number; // 0=Sun..6=Sat
  start: string; // "HH:mm"
  end: string;
}

export interface Weights {
  deadline: number;
  overdue: number;
  importance: number;
  weakTopic: number;
  goal: number;
  carryOver: number;
}

export interface Settings {
  timezone: string;
  wake: string;
  sleep: string;
  studyWindows: StudyWindow[];
  focusMin: number;
  breakMin: number;
  maxDailyStudyMin: number;
  dailyGoalMin: number;
  weeklyGoalMin: number;
  weights: Weights;
  weakTopics: { subject: Subject; topic: string }[];
  /** First day of the A/L exam, "yyyy-MM-dd". Drives the countdown on Today. */
  examDate: string;
  /** Mark the user is aiming for in each subject, as a percentage (0–100). */
  targets: Record<Subject, number>;
}

export interface CalEvent {
  id: string;
  title: string;
  kind: "class" | "exam" | "other";
  mode: "online" | "physical";
  subject?: Subject | undefined;
  recurrence: "none" | "weekly";
  date?: string; // yyyy-MM-dd, calendar start date
  weekday?: number; // calendar start weekday
  start: string;
  end: string; // Earlier than start means the following calendar day; equal times are invalid.
}

export interface Task {
  id: string;
  title: string;
  subject: Subject;
  topic: string;
  type: TaskType;
  estimateMin: number;
  deadline?: string | undefined;
  importance: number;
  splittable: boolean;
  minChunkMin: number;
  status: TaskStatus;
  goalId?: string | undefined;
  carryOverCount: number;
  createdAt: string;
  /** ISO timestamp set when the task is marked done. */
  completedAt?: string | undefined;
}

export interface Goal {
  id: string;
  weekStart: string;
  type: TaskType;
  target: number;
  title: string;
}

export interface PlanBlock {
  id: string;
  taskId: string;
  date: string;
  start: string;
  end: string;
  status: "planned" | "done" | "missed" | "partial";
}

export interface Session {
  id: string;
  taskId: string;
  /** ISO timestamp the focus segment began. */
  start: string;
  /** ISO timestamp it was logged. */
  end: string;
  /** Minutes actually studied: excludes pauses and breaks. */
  actualMin: number;
  /** The done/partial block this session produced. Lets study time be counted once, not twice. */
  blockId?: string | undefined;
}

export interface PaperMark {
  id: string;
  subject: Subject;
  paperName: string;
  date: string;
  score: number;
  max: number;
}

/** One question (or part) where marks were lost, logged after a paper. */
export interface Mistake {
  id: string;
  subject: Subject;
  topic: string;
  /** The day the paper was sat, "yyyy-MM-dd". */
  date: string;
  /** Marks lost on this question. Always above zero. */
  marksLost: number;
  cause: MistakeCause;
  /** Which paper it came from. Free text, like `PaperMark.paperName`. */
  paperName?: string | undefined;
  note?: string | undefined;
}

export interface StoreData {
  version: number;
  settings: Settings;
  events: CalEvent[];
  tasks: Task[];
  goals: Goal[];
  blocks: PlanBlock[];
  sessions: Session[];
  marks: PaperMark[];
  mistakes: Mistake[];
}
