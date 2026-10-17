import type { CalEvent, Goal, PaperMark, PlanBlock, Session, Settings, Task } from "@/lib/types";
import type { PlannerInput } from "@/lib/planner";

/** Monday 19 Oct 2026, 09:00 local. Built with the local constructor so tests don't depend on the machine's timezone. */
export const MON_9AM = new Date(2026, 9, 19, 9, 0);
export const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m);

export const makeSettings = (over: Partial<Settings> = {}): Settings => ({
  timezone: "Asia/Colombo",
  wake: "06:00",
  sleep: "22:30",
  studyWindows: [],
  focusMin: 50,
  breakMin: 10,
  maxDailyStudyMin: 360,
  dailyGoalMin: 240,
  weeklyGoalMin: 1800,
  weights: { deadline: 30, overdue: 20, importance: 20, weakTopic: 15, goal: 10, carryOver: 5 },
  weakTopics: [],
  ...over,
});

/** The same study window every day of the week. */
export const dailyWindow = (start: string, end: string) =>
  [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, start, end }));

let seq = 0;
export const makeTask = (over: Partial<Task> = {}): Task => {
  seq += 1;
  return {
    id: `t${seq}`,
    title: `Task ${seq}`,
    subject: "maths",
    topic: "",
    type: "homework",
    estimateMin: 60,
    importance: 3,
    splittable: true,
    minChunkMin: 25,
    status: "todo",
    carryOverCount: 0,
    createdAt: `2026-10-12T08:${String(seq % 60).padStart(2, "0")}:00.000Z`,
    ...over,
  };
};

export const makeEvent = (over: Partial<CalEvent> = {}): CalEvent => ({
  id: "e1",
  title: "Maths class",
  kind: "class",
  mode: "physical",
  subject: "maths",
  recurrence: "weekly",
  weekday: 1,
  start: "17:00",
  end: "18:30",
  ...over,
});

export const makeBlock = (over: Partial<PlanBlock> = {}): PlanBlock => ({
  id: "b1",
  taskId: "t1",
  date: "2026-10-19",
  start: "16:00",
  end: "17:00",
  status: "planned",
  ...over,
});

export const makeSession = (over: Partial<Session> = {}): Session => ({
  id: "s1",
  taskId: "t1",
  start: "2026-10-18T10:00:00.000Z",
  end: "2026-10-18T11:00:00.000Z",
  actualMin: 60,
  ...over,
});

export const makeMark = (over: Partial<PaperMark> = {}): PaperMark => ({
  id: "m1",
  subject: "maths",
  paperName: "Paper",
  date: "2026-10-10",
  score: 60,
  max: 100,
  ...over,
});

export const makeGoal = (over: Partial<Goal> = {}): Goal => ({
  id: "g1",
  weekStart: "2026-10-19",
  type: "homework",
  target: 3,
  title: "3 homeworks",
  ...over,
});

/** Planner input with a 16:00–21:00 study window every day unless overridden. */
export const makeInput = (over: Partial<PlannerInput> = {}): PlannerInput => ({
  now: MON_9AM,
  settings: makeSettings({ studyWindows: dailyWindow("16:00", "21:00") }),
  events: [],
  tasks: [],
  goals: [],
  blocks: [],
  sessions: [],
  marks: [],
  ...over,
});
