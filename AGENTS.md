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
