import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Plus, Trash2, Upload } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { setSoundEnabled, useSoundEnabled } from "@/lib/sound";
import { exportData, migrateWithReport, useStore, defaultSettings } from "@/lib/store";
import { InvalidBackupError, describeReport } from "@/lib/schema";
import {
  SUBJECTS,
  SUBJECT_LABEL,
  type Settings,
  type StoreData,
  type Subject,
  type Weights,
} from "@/lib/types";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — A/L Command Center" },
      {
        name: "description",
        content: "Study windows, focus length, goals, scoring weights and backups.",
      },
      { property: "og:title", content: "Settings — A/L Command Center" },
      {
        property: "og:description",
        content: "Study windows, focus length, goals, scoring weights and backups.",
      },
    ],
  }),
  component: SettingsPage,
});

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEIGHT_LABELS: Record<keyof Weights, string> = {
  deadline: "Deadline urgency",
  overdue: "Overdue",
  importance: "Importance",
  weakTopic: "Weak topic",
  goal: "Weekly goal",
  carryOver: "Carry-over",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function SettingsPage() {
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const replaceAll = useStore((s) => s.replaceAll);
  const fileRef = useRef<HTMLInputElement>(null);
  const soundOn = useSoundEnabled();
  const [pending, setPending] = useState<StoreData | null>(null);
  const [pendingNotes, setPendingNotes] = useState<string[]>([]);
  const [weak, setWeak] = useState<{ subject: Subject; topic: string }>({
    subject: "maths",
    topic: "",
  });

  const num = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    update({ [k]: Math.max(0, Number(e.target.value) || 0) } as Partial<Settings>);

  const windowsErr = settings.studyWindows.some((w) => w.end <= w.start);

  const doExport = () => {
    const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `al-command-center-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const onFile = async (f?: File) => {
    if (!f) return;
    try {
      const { data, report } = migrateWithReport(JSON.parse(await f.text()));
      setPending(data);
      setPendingNotes(describeReport(report));
    } catch (e) {
      setPending(null);
      toast.error(
        e instanceof InvalidBackupError
          ? e.message
          : e instanceof SyntaxError
            ? "That file isn't valid JSON."
            : "That file isn't a valid A/L Command Center backup.",
      );
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <>
      <PageHeader title="Settings" subtitle="Personal routine, planner tuning and backups." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Appearance">
          <p className="mb-4 text-sm text-muted-foreground">
            Light is the default. Your choice is remembered in this browser only.
          </p>
          <div className="max-w-xs">
            <ThemeToggle />
          </div>
          <div className="mt-5 flex items-start justify-between gap-4 border-t pt-4">
            <div>
              <Label htmlFor="sound-switch" className="text-sm font-medium">
                Sounds
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">
                A soft click when focus starts, a chime when a block ends and a short phrase when
                you reach a goal. Remembered in this browser only.
              </p>
            </div>
            <Switch id="sound-switch" checked={soundOn} onCheckedChange={setSoundEnabled} />
          </div>
        </Section>

        <Section title="Routine">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Wake time">
              <Input
                type="time"
                value={settings.wake}
                onChange={(e) => update({ wake: e.target.value })}
              />
            </Field>
            <Field label="Sleep time">
              <Input
                type="time"
                value={settings.sleep}
                onChange={(e) => update({ sleep: e.target.value })}
              />
            </Field>
            <Field label="Focus block (min)">
              <Input type="number" value={settings.focusMin} onChange={num("focusMin")} />
            </Field>
            <Field label="Break (min)">
              <Input type="number" value={settings.breakMin} onChange={num("breakMin")} />
            </Field>
            <Field label="Max study per day (min)">
              <Input
                type="number"
                value={settings.maxDailyStudyMin}
                onChange={num("maxDailyStudyMin")}
              />
            </Field>
            <Field label="Timezone">
              <Input
                value={settings.timezone}
                onChange={(e) => update({ timezone: e.target.value })}
              />
            </Field>
            <Field label="Daily goal (min)">
              <Input type="number" value={settings.dailyGoalMin} onChange={num("dailyGoalMin")} />
            </Field>
            <Field label="Weekly goal (min)">
              <Input type="number" value={settings.weeklyGoalMin} onChange={num("weeklyGoalMin")} />
            </Field>
          </div>
        </Section>

        <Section title="Planner weights">
          <div className="grid grid-cols-2 gap-4">
            {(Object.keys(WEIGHT_LABELS) as (keyof Weights)[]).map((k) => (
              <Field key={k} label={WEIGHT_LABELS[k]}>
                <Input
                  type="number"
                  value={settings.weights[k]}
                  onChange={(e) =>
                    update({
                      weights: {
                        ...settings.weights,
                        [k]: Math.max(0, Number(e.target.value) || 0),
                      },
                    })
                  }
                />
              </Field>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span>Total: {Object.values(settings.weights).reduce((a, b) => a + b, 0)}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => update({ weights: defaultSettings().weights })}
            >
              Reset weights
            </Button>
          </div>
        </Section>

        <Section title="Study windows">
          <div className="space-y-2">
            {settings.studyWindows.map((w, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  className="h-9 rounded-md border bg-input/30 px-2 text-sm"
                  value={w.day}
                  onChange={(e) => {
                    const next = [...settings.studyWindows];
                    next[i] = { ...w, day: Number(e.target.value) };
                    update({ studyWindows: next });
                  }}
                >
                  {DAYS.map((d, di) => (
                    <option key={d} value={di}>
                      {d}
                    </option>
                  ))}
                </select>
                {(["start", "end"] as const).map((k) => (
                  <Input
                    key={k}
                    type="time"
                    value={w[k]}
                    onChange={(e) => {
                      const next = [...settings.studyWindows];
                      next[i] = { ...w, [k]: e.target.value };
                      update({ studyWindows: next });
                    }}
                  />
                ))}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove window"
                  onClick={() =>
                    update({ studyWindows: settings.studyWindows.filter((_, j) => j !== i) })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          {windowsErr && (
            <p className="mt-2 text-xs text-destructive">
              A window must end after it starts (no crossing midnight).
            </p>
          )}
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() =>
              update({
                studyWindows: [...settings.studyWindows, { day: 1, start: "16:00", end: "18:00" }],
              })
            }
          >
            <Plus className="h-4 w-4" /> Add window
          </Button>
        </Section>

        <Section title="Weak topics">
          <div className="mb-3 flex flex-wrap gap-2">
            {settings.weakTopics.length === 0 && (
              <p className="text-sm text-muted-foreground">None yet.</p>
            )}
            {settings.weakTopics.map((t, i) => (
              <button
                key={i}
                className="rounded-full border px-3 py-1 text-xs hover:border-destructive"
                onClick={() =>
                  update({ weakTopics: settings.weakTopics.filter((_, j) => j !== i) })
                }
                title="Remove"
              >
                {SUBJECT_LABEL[t.subject]} · {t.topic} ×
              </button>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!weak.topic.trim()) return;
              update({
                weakTopics: [...settings.weakTopics, { ...weak, topic: weak.topic.trim() }],
              });
              setWeak({ ...weak, topic: "" });
            }}
          >
            <select
              className="h-9 rounded-md border bg-input/30 px-2 text-sm"
              value={weak.subject}
              onChange={(e) => setWeak({ ...weak, subject: e.target.value as Subject })}
            >
              {SUBJECTS.map((s) => (
                <option key={s} value={s}>
                  {SUBJECT_LABEL[s]}
                </option>
              ))}
            </select>
            <Input
              placeholder="e.g. Vectors"
              value={weak.topic}
              onChange={(e) => setWeak({ ...weak, topic: e.target.value })}
            />
            <Button type="submit" variant="secondary">
              Add
            </Button>
          </form>
        </Section>

        <Section title="Backup">
          <p className="mb-4 text-sm text-muted-foreground">
            Your data lives only in this browser. It does not sync between devices and is lost if
            you clear site data. Export regularly.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={doExport}>
              <Download className="h-4 w-4" /> Export JSON
            </Button>
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" /> Import JSON
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </div>
          {pending && (
            <div className="mt-4 rounded-md border border-warning/50 bg-warning/10 p-4 text-sm">
              <p className="mb-2 font-medium">Replace all current data with this backup?</p>
              <p className="mb-3 text-muted-foreground">
                {pending.tasks.length} tasks · {pending.events.length} events ·{" "}
                {pending.goals.length} goals · {pending.sessions.length} sessions ·{" "}
                {pending.marks.length} marks
              </p>
              {pendingNotes.length > 0 && (
                <div className="mb-3 text-muted-foreground">
                  <p className="font-medium text-foreground">
                    Some entries can&apos;t be imported:
                  </p>
                  <ul className="list-disc pl-5">
                    {pendingNotes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    replaceAll(pending);
                    setPending(null);
                    setPendingNotes([]);
                    toast.success("Backup restored.");
                  }}
                >
                  Replace
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setPending(null);
                    setPendingNotes([]);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </Section>
      </div>
    </>
  );
}
