import type { FactorKey } from "@/lib/planner";
import type { Subject } from "@/lib/types";

export const SUBJECT_BLOCK: Record<Subject, string> = {
  maths: "border-l-maths bg-maths/15 text-maths",
  physics: "border-l-physics bg-physics/15 text-physics",
  ict: "border-l-ict bg-ict/15 text-ict",
};

export const SUBJECT_DOT: Record<Subject, string> = { maths: "bg-maths", physics: "bg-physics", ict: "bg-ict" };

export const FACTOR_COLOR: Record<FactorKey, string> = {
  deadline: "bg-primary",
  overdue: "bg-destructive",
  importance: "bg-maths",
  weakTopic: "bg-ict",
  goal: "bg-physics",
  carryOver: "bg-muted-foreground",
};

export const parseYmd = (key: string) => {
  const [y = 1970, m = 1, d = 1] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const hhmm = (min: number) => {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};
