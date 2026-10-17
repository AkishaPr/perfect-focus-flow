# Stage 3B — Finish Tasks and Weekly Goals

No Stage 3B plan file exists in the project. Stage 3A hardened data loading/import and prepared a `completedAt` field "used from Stage 3b on". This plan finishes roadmap item 3 (Tasks + Goals) on top of 3A, without changing 3A's schema, store architecture or tests.

## Scope

1. **Completion time** — when a task is marked done (checkbox or editor), set `completedAt` to now; clear it when moved back to not done. Done in the store's `upsertTask`, so every path behaves the same.
2. **Goal progress rule** — a goal's progress counts linked tasks that are done. Moved into a small pure helper (`goalProgress`) so the Goals page and later the Today page share one rule.
3. **Goal editing** — goals can currently only be added or deleted; add editing title, type and target in place.
4. **Task editor polish** — goal picker lists only goals for the task's deadline week (or current week when no deadline), plus whichever goal is already linked so nothing silently unlinks.
5. **Deleting safety** — deleting a task or goal asks for confirmation; deleting a goal keeps its tasks (unlinks them, as today).
6. **Roadmap** — split item 3 into 3A (done) and 3B in `roadmap.md`.

## Out of scope

Planner, Today page, timer, missed-task recovery, progress charts (stages 4–8). No backend, no auth.

## Tests (added next to existing Stage 3A tests)

- Marking done sets `completedAt`; un-marking clears it; editing a done task keeps the original `completedAt`.
- `goalProgress` counts only done tasks linked to that goal, capped display at target.
- Deleting a goal unlinks its tasks and keeps them.
- Deleting a task removes its planned blocks but keeps completed ones.

## Validation

`bunx vitest run` (all 60 existing tests must still pass) and `bunx tsc --noEmit`, then a browser check: add a task, link it to a goal, mark it done, see goal progress update, reload and confirm it persisted.

## Files touched

`src/lib/store.ts` (upsertTask only), new `src/lib/goals.ts`, `src/routes/goals.tsx`, `src/routes/tasks.tsx`, `src/components/TaskDialog.tsx`, new `src/test/tasks-goals.test.ts`, `roadmap.md`.
