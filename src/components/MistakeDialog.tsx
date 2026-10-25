import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { mistakeError, normTopic } from "@/lib/planner";
import { useStore } from "@/lib/store";
import {
  MISTAKE_CAUSES,
  MISTAKE_CAUSE_LABEL,
  SUBJECTS,
  SUBJECT_LABEL,
  type Mistake,
  type MistakeCause,
  type Subject,
} from "@/lib/types";

const sel = "h-9 w-full rounded-md border bg-input/30 px-2 text-sm";

/** `initial` is the mistake being edited, or a blank one to add; null keeps the dialog closed. */
export function MistakeDialog({
  initial,
  isNew,
  onClose,
}: {
  initial: Mistake | null;
  isNew: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={initial !== null} onOpenChange={(open) => !open && onClose()}>
      {/* Keyed by id so each mistake opens with a fresh form, with no effect to sync it. */}
      {initial && (
        <MistakeForm key={initial.id} initial={initial} isNew={isNew} onClose={onClose} />
      )}
    </Dialog>
  );
}

/** Empty and unparsable text are "not a number", not 0, so a blank amount can't be saved as zero. */
const parse = (text: string) => (text.trim() === "" ? Number.NaN : Number(text));

function MistakeForm({
  initial,
  isNew,
  onClose,
}: {
  initial: Mistake;
  isNew: boolean;
  onClose: () => void;
}) {
  const upsert = useStore((s) => s.upsertMistake);
  const remove = useStore((s) => s.deleteMistake);
  const tasks = useStore((s) => s.tasks);
  const mistakes = useStore((s) => s.mistakes);
  const weakTopics = useStore((s) => s.settings.weakTopics);

  const [subject, setSubject] = useState<Subject>(initial.subject);
  const [topic, setTopic] = useState(initial.topic);
  const [date, setDate] = useState(initial.date);
  // A new mistake starts with an empty amount so typing replaces nothing.
  const [lost, setLost] = useState(isNew ? "" : String(initial.marksLost));
  const [cause, setCause] = useState<MistakeCause>(initial.cause);
  const [paperName, setPaperName] = useState(initial.paperName ?? "");
  const [note, setNote] = useState(initial.note ?? "");
  const [touched, setTouched] = useState(false);

  // Suggest topics already used for this subject, so the same topic keeps one spelling and the
  // planner can match it to your tasks (it compares topics ignoring case and spaces).
  const suggestions = useMemo(() => {
    const seen = new Map<string, string>();
    const add = (s: Subject, t: string) => {
      if (s === subject && t.trim() !== "" && !seen.has(normTopic(t)))
        seen.set(normTopic(t), t.trim());
    };
    for (const t of tasks) add(t.subject, t.topic);
    for (const w of weakTopics) add(w.subject, w.topic);
    for (const m of mistakes) add(m.subject, m.topic);
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [subject, tasks, weakTopics, mistakes]);

  const lostNum = parse(lost);
  const error = mistakeError({ topic, date, marksLost: lostNum });
  const touch =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      setTouched(true);
      set(v);
    };

  const save = () => {
    if (error) return;
    upsert({
      id: initial.id,
      subject,
      topic: topic.trim(),
      date,
      marksLost: lostNum,
      cause,
      paperName: paperName.trim() || undefined,
      note: note.trim() || undefined,
    });
    onClose();
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{isNew ? "Log a mistake" : "Edit mistake"}</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="mistake-subject">Subject</Label>
          <select
            id="mistake-subject"
            className={sel}
            value={subject}
            onChange={(e) => touch(setSubject)(e.target.value as Subject)}
          >
            {SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {SUBJECT_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mistake-date">Date of the paper</Label>
          <Input
            id="mistake-date"
            type="date"
            value={date}
            onChange={(e) => touch(setDate)(e.target.value)}
          />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="mistake-topic">Topic</Label>
          <Input
            id="mistake-topic"
            autoFocus
            list="mistake-topic-options"
            value={topic}
            onChange={(e) => touch(setTopic)(e.target.value)}
            placeholder="e.g. Vectors"
          />
          <datalist id="mistake-topic-options">
            {suggestions.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mistake-lost">Marks lost</Label>
          <Input
            id="mistake-lost"
            type="number"
            inputMode="decimal"
            step="any"
            min={0}
            value={lost}
            onChange={(e) => touch(setLost)(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mistake-cause">Why</Label>
          <select
            id="mistake-cause"
            className={sel}
            value={cause}
            onChange={(e) => touch(setCause)(e.target.value as MistakeCause)}
          >
            {MISTAKE_CAUSES.map((c) => (
              <option key={c} value={c}>
                {MISTAKE_CAUSE_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="mistake-paper">Paper (optional)</Label>
          <Input
            id="mistake-paper"
            value={paperName}
            onChange={(e) => touch(setPaperName)(e.target.value)}
            placeholder="e.g. 2024 Paper I, Q7"
          />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="mistake-note">Note (optional)</Label>
          <Input
            id="mistake-note"
            value={note}
            onChange={(e) => touch(setNote)(e.target.value)}
            placeholder="What to remember next time"
          />
        </div>
      </div>
      <div aria-live="polite" className="min-h-5 space-y-1 text-sm text-muted-foreground">
        {error !== null && touched && <p className="text-destructive">{error}</p>}
        {cause === "careless" && <p>Careless slips don't make the planner boost the topic.</p>}
      </div>
      <DialogFooter className="sm:justify-between">
        {isNew ? (
          <span />
        ) : (
          <Button
            variant="ghost"
            className="text-destructive"
            onClick={() => {
              if (window.confirm(`Delete this mistake on "${initial.topic}"?`)) {
                remove(initial.id);
                onClose();
              }
            }}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        )}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={error !== null} onClick={save}>
            Save
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  );
}
