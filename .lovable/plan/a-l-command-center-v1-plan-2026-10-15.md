# A/L Command Center — V1 Plan

Single-user, browser-local productivity app for an A/L Maths-stream student (Combined Maths, Physics, ICT). Dark, focused UI. No auth, no cloud, no chatbot.

## Screens

1. **Today** (`/`) — fixed events timeline, today's planned tasks, available study minutes, overdue list, missed-task alert banner, daily progress ring, large **Start Next Task** button.
2. **Week** (`/week`) — 7-day calendar grid (Mon–Sun, 05:00–23:00). Recurring classes, one-time events, planned study blocks. Click-to-add events.
3. **Tasks** (`/tasks`) — filterable list (subject, status, type), create/edit dialog with all fields.
4. **Goals** (`/goals`) — weekly goals (papers, revision, homework, chapters, recordings) with progress bars from linked tasks.
5. **Timer** (`/focus`) — focus/break timer for the active task; records actual duration; complete / pause / abandon.
6. **Progress** (`/progress`) — study time per day/subject, completed vs missed, paper marks table + trend chart.
7. **Settings** (`/settings`) — wake/sleep, study windows, focus/break length, daily/weekly target minutes, timezone (default Asia/Colombo), scoring weights, weak topics, JSON export/import, local-data warning.

Shared shell: sidebar on desktop, bottom tab bar on mobile.

## Data models (TypeScript)

```text
Settings   { timezone, wake, sleep, studyWindows[{day, start, end}], focusMin, breakMin,
             maxDailyStudyMin, dailyGoalMin, weeklyGoalMin, weights{...}, weakTopics[{subject, topic}] }
Event      { id, title, kind: class|exam|other, mode: online|physical, subject?,
             recurrence: none|weekly, date? | weekday?, start, end }
Task       { id, title, subject, topic, type: homework|paper|revision|chapter|recording|other,
             estimateMin, deadline?, importance 1-5, splittable, minChunkMin, status:
             todo|in_progress|done|missed|deferred, goalId?, carryOverCount, createdAt }
Goal       { id, weekStart, type, target, title }
PlanBlock  { id, taskId, date, start, end, status: planned|done|missed|partial }
Session    { id, taskId, start, end, actualMin }
PaperMark  { id, subject, paperName, date, score, max }
Store      { version, settings, events, tasks, goals, blocks, sessions, marks }
```

## Smart planner (pure, deterministic)

1. **Free windows** for a date = study windows ∩ [wake, sleep] − fixed events (with small buffer) − already-done blocks.
2. **Score** each open task (0–100, weights configurable):
   - deadline urgency 30 (scaled by days left vs. estimate)
   - overdue 20 (grows with days overdue, capped)
   - importance 20
   - weak topic 15 (subject+topic match)
   - weekly goal 10 (linked to an unfinished goal this week)
   - carry-over 5 (by carryOverCount)
3. **Fit**: sort by score (tie-break: deadline, then id). Greedy place into windows; insert break after each focus chunk; split only if `splittable` and chunk ≥ `minChunkMin`; stop at `maxDailyStudyMin`.
4. Output `{ blocks, unscheduled[{task, reason}] }`. Unscheduled tasks shown clearly, never hidden.

## Missed-task recovery

- On app open and every minute: planned blocks whose end < now and not done → mark missed, task status stays open, carryOverCount++.
- Banner: "N tasks missed" → preview dialog showing revised plan (re-run planner from now) diff: moved / still unscheduled.
- User clicks Apply or Dismiss. Nothing deleted automatically.

## Persistence

- localStorage key `alcc:v1`, single JSON store, schema `version` + migration function.
- Zustand store with persist middleware; read only after hydration (no SSR mismatch).
- Export: download JSON. Import: validate with zod, preview counts, replace or cancel.
- Visible notice: data lives in this browser only; export regularly.

## Edge cases

Overlapping events, windows crossing midnight (disallowed in V1), task longer than any window and not splittable, zero free time, deadline already passed, timezone change, DST-free Colombo but generic date handling via date-fns-tz, timer running across tab reload (persist start time), corrupt/older import file, deleting a task with planned blocks.

## Tests (Vitest)

- Window computation (events subtract correctly, buffers).
- Scoring weights and tie-break determinism.
- Fitting: no overlap with events, respects max daily load, splitting rules, unscheduled reasons.
- Missed detection and recovery never drops tasks.
- Import validation / migration.

## Stages (each a separate step)

```text
1. Design system, app shell, routes, settings + store + export/import
2. Events + Week calendar                         (needs 1)
3. Tasks + Goals CRUD                             (needs 1)
4. Planner engine + unit tests                    (needs 2,3)
5. Today dashboard + Start Next Task              (needs 4)
6. Focus timer + sessions                         (needs 5)
7. Missed-task recovery flow                      (needs 4,5)
8. Progress dashboard + paper marks               (needs 6)
9. Polish: responsive pass, empty states, edge cases
```

## Technical notes

TanStack Start routes, Zustand + persist, zod, date-fns / date-fns-tz, recharts, shadcn UI. Planner lives in a pure `src/lib/planner/` module with no React, so it is fully testable.
