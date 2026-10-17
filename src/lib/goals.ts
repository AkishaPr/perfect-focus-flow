import { weekStart, ymd } from "./calendar";
import type { Goal, Task } from "./types";

export interface GoalProgress {
  done: number;
  linked: number;
  target: number;
  /** 0–100, capped at 100 even when more tasks than the target are done. */
  percent: number;
}

/** A goal's progress counts linked tasks marked done. */
export function goalProgress(goal: Goal, tasks: Task[]): GoalProgress {
  const linked = tasks.filter((t) => t.goalId === goal.id);
  const done = linked.filter((t) => t.status === "done").length;
  const percent = goal.target > 0 ? Math.min(100, Math.round((done / goal.target) * 100)) : 0;
  return { done, linked: linked.length, target: goal.target, percent };
}

/** Goals offered in the task editor: the task's deadline week (or this week), plus the currently linked goal. */
export function goalsForTask(goals: Goal[], task: Pick<Task, "deadline" | "goalId">, today = new Date()): Goal[] {
  const ref = task.deadline ? new Date(`${task.deadline}T00:00:00`) : today;
  const wk = ymd(weekStart(ref));
  return goals.filter((g) => g.weekStart === wk || g.id === task.goalId);
}
