import { RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { FACTORS, FACTOR_LABEL } from "@/lib/planner";
import type { Weights } from "@/lib/types";
import { FACTOR_COLOR } from "./theme";

interface Props {
  weights: Weights;
  saved: Weights;
  onChange: (w: Weights) => void;
  onSave: () => void;
}

export function WeightTuner({ weights, saved, onChange, onSave }: Props) {
  const dirty = FACTORS.some((f) => weights[f] !== saved[f]);
  const total = FACTORS.reduce((s, f) => s + weights[f], 0) || 1;
  return (
    <section aria-labelledby="tuner-title" className="rounded-xl border bg-card">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h2 id="tuner-title" className="text-sm font-semibold">Scoring weights</h2>
          <p className="text-[11px] text-muted-foreground">Drag to re-plan instantly</p>
        </div>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" className="h-8 w-8" disabled={!dirty} onClick={() => onChange(saved)} aria-label="Reset weights">
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="secondary" className="h-8" disabled={!dirty} onClick={onSave}>
            <Save className="h-3.5 w-3.5" /> Save
          </Button>
        </div>
      </header>

      <div className="flex h-2 overflow-hidden" aria-hidden="true">
        {FACTORS.map((f) => (
          <div key={f} className={`${FACTOR_COLOR[f]} transition-[flex-grow] duration-300`} style={{ flexGrow: weights[f] }} />
        ))}
      </div>

      <div className="flex flex-col gap-4 p-4">
        {FACTORS.map((f) => (
          <div key={f} className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor={`w-${f}`} className="flex items-center gap-2 font-medium">
                <span className={`h-2 w-2 rounded-sm ${FACTOR_COLOR[f]}`} />
                {FACTOR_LABEL[f]}
              </label>
              <span className="font-mono text-muted-foreground">
                {weights[f]} <span className="opacity-60">· {Math.round((weights[f] / total) * 100)}%</span>
              </span>
            </div>
            <Slider
              id={`w-${f}`}
              min={0}
              max={50}
              step={1}
              value={[weights[f]]}
              onValueChange={([v]) => onChange({ ...weights, [f]: v ?? 0 })}
              aria-label={`${FACTOR_LABEL[f]} weight`}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
