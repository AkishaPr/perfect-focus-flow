# Planner engine

Pure TypeScript (no React, no store, no clock). `generatePlan(input)` returns blocks, anything
that didn't fit (with reasons), warnings, per-day capacity and a priority ranking. The plan is
_derived_: run it again whenever tasks, events or the time change. Persist only user decisions.

```ts
import { generatePlan } from "@/lib/planner";
const plan = generatePlan({ ...useStore.getState(), now: new Date() });
```

## How a plan is made

1. **Free time** = study windows − classes/exams/events (+ travel buffers) − locked blocks − the past.
   Physical classes keep 30 min clear either side, online classes 5 min.
2. **Walk the free slots in time order.** At each point place the task with the best score
   (`settings.weights`) minus a small penalty for repeating the same subject.
3. **Splittable** tasks are cut into `focusMin` blocks with `breakMin` between them and never leave a
   sliver smaller than `minChunkMin`. **Unsplittable** tasks (e.g. past papers) need one gap.
4. **Whatever doesn't fit is reported**, never overbooked: `unscheduled` (with a reason) and `warnings`.

## Logged study time (Stage 6)

Sessions from the focus timer feed the planner two ways: `remainingMin` subtracts a task's logged
minutes from its estimate (a task with its whole estimate logged is reported as `estimate-used-up`),
and today's daily cap is reduced by `studiedMinOn`, the single definition of minutes studied on a
day (sessions by `actualMin`, plus done/partial blocks no session points at).

## Score (0–100)

Weighted mean of six 0–1 factors using `settings.weights`: `deadline` (slack-based: free time before
the deadline ÷ work left), `overdue`, `importance`, `weakTopic` (topics from Settings, or a weak
subject from recent marks at 60% strength), `goal` (share of this week's linked goal still open),
`carryOver` (saturates at 3). Deadline slack looks at each task alone, so it doesn't know other
tasks compete for the same free time.

## Knobs (`PlannerOptions`)

| Option                                  | Default | Meaning                                             |
| --------------------------------------- | ------- | --------------------------------------------------- |
| `horizonDays`                           | 7       | Days planned, starting today                        |
| `slackFraction`                         | 0.15    | Share of `maxDailyStudyMin` kept unscheduled        |
| `minSlotMin`                            | 20      | Free gaps shorter than this are ignored             |
| `onlineBufferMin` / `physicalBufferMin` | 5 / 30  | Clear time around classes                           |
| `varietyPenalty`                        | 6       | Score points off per consecutive same-subject block |
| `lockedBlockIds`                        | none    | Planned blocks to keep exactly as they are          |

## Today view (`today.ts`)

`buildToday(data, now)` derives everything the Today page shows: the active block, next up,
today's timeline, stats and warnings. Blocks saved in the store as `"planned"` are the user's own
"I'm doing this" commitments (`startBlock`), so they're passed to the planner as locked. A
committed block outlives its planned time, because the planner drops past blocks, so "in progress"
is read from the store, not the plan.

## Missed-work recovery (`recovery.ts`)

The plan is derived, so tomorrow nothing remembers what today's plan promised. `snapshotDay`
records the minutes each task was given; the next day `buildReview` compares that with what was
actually studied (`studiedMinForTaskOn`) and lists tasks that got under half their time. The user
chooses per task: **carry over** (+1 `carryOverCount`, which raises priority and, at 3, triggers
the "stuck" warning), **keep as is** (no penalty), **defer** (out of planning) or **done** (did it
off the app). A one-click "carry over" skips tasks one carry-over away from stuck, so avoidance
can't continue silently. Snapshots live in their own slice (`src/lib/recovery/log.ts`).

## Not here yet

Spaced-revision task generation, estimate calibration from real session times and the exam-phase
mix belong to later stages.
