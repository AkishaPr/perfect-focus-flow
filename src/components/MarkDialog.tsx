import { useState } from "react";
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
import { formatPercent } from "@/lib/format";
import { markError, markPercent } from "@/lib/marks";
import { useStore } from "@/lib/store";
import { SUBJECTS, SUBJECT_LABEL, type PaperMark, type Subject } from "@/lib/types";

const sel = "h-9 w-full rounded-md border bg-input/30 px-2 text-sm";

/** `initial` is the mark being edited, or a blank one to add; null keeps the dialog closed. */
export function MarkDialog({
  initial,
  isNew,
  onClose,
}: {
  initial: PaperMark | null;
  isNew: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={initial !== null} onOpenChange={(open) => !open && onClose()}>
      {/* Keyed by id so each mark opens with a fresh form, with no effect to sync it. */}
      {initial && <MarkForm key={initial.id} initial={initial} isNew={isNew} onClose={onClose} />}
    </Dialog>
  );
}

/** Empty and unparsable text are "not a number", not 0, so a blank score can't be saved as zero. */
const parse = (text: string) => (text.trim() === "" ? Number.NaN : Number(text));

function MarkForm({
  initial,
  isNew,
  onClose,
}: {
  initial: PaperMark;
  isNew: boolean;
  onClose: () => void;
}) {
  const upsert = useStore((s) => s.upsertMark);
  const remove = useStore((s) => s.deleteMark);
  const [subject, setSubject] = useState<Subject>(initial.subject);
  const [paperName, setPaperName] = useState(initial.paperName);
  const [date, setDate] = useState(initial.date);
  // A new mark starts with an empty score so typing replaces nothing.
  const [score, setScore] = useState(isNew ? "" : String(initial.score));
  const [max, setMax] = useState(String(initial.max));
  const [touched, setTouched] = useState(false);

  const scoreNum = parse(score);
  const maxNum = parse(max);
  const error = markError({ paperName, date, score: scoreNum, max: maxNum });
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
      paperName: paperName.trim(),
      date,
      score: scoreNum,
      max: maxNum,
    });
    onClose();
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{isNew ? "Add paper mark" : "Edit paper mark"}</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="mark-subject">Subject</Label>
          <select
            id="mark-subject"
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
          <Label htmlFor="mark-date">Date sat</Label>
          <Input
            id="mark-date"
            type="date"
            value={date}
            onChange={(e) => touch(setDate)(e.target.value)}
          />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="mark-name">Paper</Label>
          <Input
            id="mark-name"
            autoFocus
            value={paperName}
            onChange={(e) => touch(setPaperName)(e.target.value)}
            placeholder="e.g. 2024 Paper I, or Term 2 mock"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mark-score">Your score</Label>
          <Input
            id="mark-score"
            type="number"
            inputMode="decimal"
            step="any"
            min={0}
            value={score}
            onChange={(e) => touch(setScore)(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mark-max">Out of</Label>
          <Input
            id="mark-max"
            type="number"
            inputMode="decimal"
            step="any"
            min={1}
            value={max}
            onChange={(e) => touch(setMax)(e.target.value)}
          />
        </div>
      </div>
      <p aria-live="polite" className="min-h-5 text-sm text-muted-foreground">
        {error === null ? (
          <>
            That's{" "}
            <strong className="text-foreground">
              {formatPercent(markPercent({ score: scoreNum, max: maxNum }))}
            </strong>
            .
          </>
        ) : touched ? (
          <span className="text-destructive">{error}</span>
        ) : null}
      </p>
      <DialogFooter className="sm:justify-between">
        {isNew ? (
          <span />
        ) : (
          <Button
            variant="ghost"
            className="text-destructive"
            onClick={() => {
              if (window.confirm(`Delete the mark for "${initial.paperName || "this paper"}"?`)) {
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
