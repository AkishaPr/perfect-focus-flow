import { CalendarClock } from "lucide-react";
import { examCountdown } from "@/lib/exam";
import { parseYmd } from "@/lib/planner/dates";
import { useStore } from "@/lib/store";

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

/** How long until the A/L, from the exam date in Settings. `now` is passed in so tests control it. */
export function ExamCountdown({ now }: { now: Date }) {
  const examDate = useStore((s) => s.settings.examDate);
  const { days, weeks, status } = examCountdown(now, examDate);
  const dateText = parseYmd(examDate).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <section
      aria-label="Exam countdown"
      className="mb-5 flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm shadow-xs"
    >
      <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      {status === "upcoming" ? (
        <p>
          <strong className="text-base font-semibold">{plural(days, "day")}</strong> to the A/L
          {weeks >= 1 && (
            <span className="text-muted-foreground"> · about {plural(weeks, "week")}</span>
          )}
          <span className="text-muted-foreground"> · starts {dateText}</span>
        </p>
      ) : status === "today" ? (
        <p>
          <strong className="font-semibold">The A/L starts today.</strong>{" "}
          <span className="text-muted-foreground">{dateText}</span>
        </p>
      ) : (
        <p>
          <span className="text-muted-foreground">The A/L started on {dateText}.</span>
        </p>
      )}
    </section>
  );
}
