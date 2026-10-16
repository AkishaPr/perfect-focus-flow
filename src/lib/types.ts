export const SUBJECTS = ["maths", "physics", "ict"] as const;
export type Subject = (typeof SUBJECTS)[number];
export const SUBJECT_LABEL: Record<Subject, string> = {
  maths: "Combined Maths",
  physics: "Physics",
  ict: "ICT",
};

export const TASK_TYPES = ["homework", "paper", "revision", "chapter", "recording", "other"] as const;
export type TaskType = (typeof TASK_TYPES)[number];
export type TaskStatus = "todo" | "in_progress" | "done" | "missed" | "deferred";

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
}

export interface CalEvent {
  id: string;
  title: string;
  kind: "class" | "exam" | "other";
  mode: "online" | "physical";
  subject?: Subject | undefined;
  recurrence: "none" | "weekly";
  date?: string; // yyyy-MM-dd
  weekday?: number;
  start: string;
  end: string;
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
  start: string;
  end: string;
  actualMin: number;
}

export interface PaperMark {
  id: string;
  subject: Subject;
  paperName: string;
  date: string;
  score: number;
  max: number;
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
}
