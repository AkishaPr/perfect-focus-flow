<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

- All app data lives in one persisted Zustand store (src/lib/store.ts, localStorage key alcc:v1) with a zod-validated migrate(); V1 is local-only by design, no backend.
- Planner logic must stay in pure modules under src/lib/planner/ (no React) so it is unit-testable.
- The running focus timer is the one exception: it lives in its own small slice (src/lib/focus/store.ts, localStorage key alcc:v1:timer), not in StoreData or backups. It stores timestamps, never tick counts. Finished work is saved as `sessions` in the main store.
- Study time for a day is defined once, in `studiedMinOn` (src/lib/planner/studied.ts): sessions by `actualMin`, plus done/partial blocks that no session points at. Use it for any "minutes studied" number (planner cap, Today, Progress); never re-add blocks and sessions yourself or time is counted twice.
- Missed-task recovery (src/lib/planner/recovery.ts) works from a snapshot of what each day's plan promised, kept in its own small slice (src/lib/recovery/log.ts, localStorage key `alcc:v1:planlog`), not in StoreData or backups. It is transient bookkeeping: a review's outcome is written onto the tasks (`carryOverCount`, `status`), so losing the log only costs one review. The first snapshot of a day wins; never overwrite it. "Missed" means under `MISSED_BELOW` of the planned time, measured with `studiedMinForTaskOn` (which uses `studiedMinOn`).
- Progress numbers come from two pure modules, `src/lib/progress.ts` (study time, finished work, what needs attention) and `src/lib/marks.ts` (paper-mark stats and chart geometry). Weeks run Monday to Sunday in local time. Study minutes only ever come from `studiedMinOn`; the per-subject split is the same definition applied to one subject's blocks and sessions, with the remainder reported as "other" (deleted tasks) so the parts always add up to the total.
- A subject's "recent average" is `recentAverage` (src/lib/planner/scoring.ts), used by both the planner's weak-subject boost and the Progress page. Never recompute it elsewhere or the page can tell the user something different from what the planner does.
- Paper marks live in `StoreData.marks` (so they are in backups) and are edited only through `upsertMark` / `deleteMark`.

