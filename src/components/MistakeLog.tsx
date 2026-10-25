import { useMemo, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { MistakeDialog } from "@/components/MistakeDialog";
import { SUBJECT_BG } from "@/components/subject-colors";
import { Button } from "@/components/ui/button";
import { studyDayKey } from "@/lib/calendar";
import { formatPoints } from "@/lib/format";
import {
  autoWeakTopics,
  MISTAKE_WINDOW_DAYS,
  normTopic,
  recentMistakes,
  topicLosses,
} from "@/lib/planner";
import { uid } from "@/lib/store";
import {
  MISTAKE_CAUSES,
  MISTAKE_CAUSE_LABEL,
  SUBJECT_LABEL,
  type Mistake,
  type MistakeCause,
} from "@/lib/types";
import { stagger } from "@/lib/motion";

const CARD = "rounded-xl border bg-card p-5 shadow-xs";
const SHOWN_MISTAKES = 8;
const SHOWN_TOPICS = 6;

/** A blank mistake to start the "Log mistake" form from: today, a concept gap. */
const newMistake = (today: Date): Mistake => ({
  id: uid(),
  subject: "maths",
  topic: "",
  date: studyDayKey(today),
  marksLost: 0,
  cause: "concept",
});

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const topicKey = (m: { subject: string; topic: string }) =>
  `${m.subject}\u0000${normTopic(m.topic)}`;

/** Progress page section: log marks lost by topic; the planner reads the recent ones. */
export function MistakeLog({ mistakes, now }: { mistakes: Mistake[]; now: Date }) {
  const [editing, setEditing] = useState<{ mistake: Mistake; isNew: boolean } | null>(null);
  const [showAll, setShowAll] = useState(false);

  const sorted = useMemo(
    () => [...mistakes].sort((a, z) => z.date.localeCompare(a.date) || z.id.localeCompare(a.id)),
    [mistakes],
  );
  const shown = showAll ? sorted : sorted.slice(0, SHOWN_MISTAKES);
  const recent = useMemo(() => recentMistakes(mistakes, now), [mistakes, now]);
  const losses = useMemo(() => topicLosses(mistakes, now).slice(0, SHOWN_TOPICS), [mistakes, now]);
  const boosted = useMemo(
    () => new Set(autoWeakTopics(mistakes, now).map(topicKey)),
    [mistakes, now],
  );
  const byCause = useMemo(() => {
    const out: Record<MistakeCause, number> = { concept: 0, careless: 0, time: 0 };
    for (const m of recent) out[m.cause] += m.marksLost;
    return out;
  }, [recent]);

  return (
    <section aria-label="Mistake log" className="motion-rise" style={stagger(3)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Mistake log</h2>
        <Button size="sm" onClick={() => setEditing({ mistake: newMistake(now), isNew: true })}>
          <Plus className="h-4 w-4" /> Log mistake
        </Button>
      </div>

      {mistakes.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          <p>No mistakes logged yet.</p>
          <p className="mt-1">
            After a paper, log each question where you lost marks, with its topic and why. Topics
            that keep costing you marks become weak topics, and the planner gives their tasks extra
            priority.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className={CARD}>
            <h3 className="mb-1 text-sm font-medium">
              Where marks went in the last {MISTAKE_WINDOW_DAYS / 7} weeks
            </h3>
            {losses.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing logged in the last {MISTAKE_WINDOW_DAYS / 7} weeks.
              </p>
            ) : (
              <>
                <ul aria-label="Topics losing the most marks" className="mt-2 divide-y text-sm">
                  {losses.map((t) => (
                    <li key={topicKey(t)} className="flex items-center gap-3 py-2">
                      <span
                        aria-hidden="true"
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${SUBJECT_BG[t.subject]}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{t.topic}</span>
                        <span className="text-xs text-muted-foreground">
                          {SUBJECT_LABEL[t.subject]}
                        </span>
                      </span>
                      {boosted.has(topicKey(t)) && (
                        <span className="shrink-0 rounded-full border border-warning/50 bg-warning/10 px-2 py-0.5 text-xs">
                          planner boost
                        </span>
                      )}
                      <span className="shrink-0 text-right">
                        <span className="block font-medium">
                          {formatPoints(t.marksLost)} marks lost
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {plural(t.count, "mistake")}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">
                  {MISTAKE_CAUSES.map(
                    (c) => `${MISTAKE_CAUSE_LABEL[c]}: ${formatPoints(byCause[c])}`,
                  ).join(" · ")}{" "}
                  (marks). Only concept gaps and time pressure count towards a planner boost, and a
                  topic needs a few marks lost first.
                </p>
              </>
            )}
          </div>

          <div>
            <ul aria-label="All mistakes" className="divide-y rounded-xl border bg-card shadow-xs">
              {shown.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span
                    aria-hidden="true"
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${SUBJECT_BG[m.subject]}`}
                  />
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">
                    {new Date(`${m.date}T00:00:00`).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                      year: "2-digit",
                    })}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{m.topic}</span>
                    <span className="text-xs text-muted-foreground">
                      {SUBJECT_LABEL[m.subject]} · {MISTAKE_CAUSE_LABEL[m.cause]}
                      {m.paperName ? ` · ${m.paperName}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 font-medium">−{formatPoints(m.marksLost)}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit mistake: ${m.topic}`}
                    onClick={() => setEditing({ mistake: m, isNew: false })}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
            {sorted.length > SHOWN_MISTAKES && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => setShowAll(!showAll)}
              >
                {showAll ? "Show fewer" : `Show all ${sorted.length}`}
              </Button>
            )}
          </div>
        </div>
      )}

      <MistakeDialog
        initial={editing?.mistake ?? null}
        isNew={editing?.isNew ?? false}
        onClose={() => setEditing(null)}
      />
    </section>
  );
}
