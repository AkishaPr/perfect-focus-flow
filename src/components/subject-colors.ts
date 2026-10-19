import type { Subject } from "@/lib/types";

/** Background colour class for each subject's dot, bar and legend swatch. */
export const SUBJECT_BG: Record<Subject, string> = {
  maths: "bg-maths",
  physics: "bg-physics",
  ict: "bg-ict",
};

/** A fixed event on the Week page: tinted fill with a solid left edge in the subject colour. */
export const SUBJECT_EVENT: Record<Subject, string> = {
  maths: "border-l-maths bg-maths/15",
  physics: "border-l-physics bg-physics/15",
  ict: "border-l-ict bg-ict/15",
};
