import type { Subject } from "@/lib/types";

/**
 * Colour is used the same way on every page:
 *  - a subject colour always means that subject (calendar, charts, legends);
 *  - the accent (`signal`) only ever means "now" or "the one you are looking at";
 *  - everything else stays neutral, so the two above stand out.
 * Class names are written out in full so Tailwind can see them.
 */

/** Background colour class for each subject's dot, bar and legend swatch. */
export const SUBJECT_BG: Record<Subject, string> = {
  maths: "bg-maths",
  physics: "bg-physics",
  ict: "bg-ict",
};

/** Text colour for a subject's name or value. */
export const SUBJECT_TEXT: Record<Subject, string> = {
  maths: "text-maths",
  physics: "text-physics",
  ict: "text-ict",
};

/** A fixed event: tinted fill with a solid left edge in the subject colour. */
export const SUBJECT_EVENT: Record<Subject, string> = {
  maths: "border-l-maths bg-maths/15",
  physics: "border-l-physics bg-physics/15",
  ict: "border-l-ict bg-ict/15",
};

/** A planned or finished study block: a lighter tint than a fixed event, same solid left edge. */
export const SUBJECT_BLOCK: Record<Subject, string> = {
  maths: "border-l-maths bg-maths/10",
  physics: "border-l-physics bg-physics/10",
  ict: "border-l-ict bg-ict/10",
};
