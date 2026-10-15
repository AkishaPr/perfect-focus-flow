# Applying Stage 3a to your real repo (feature branch, never main)

From a clean clone of YOUR GitHub repo, at the same main commit the ZIP was taken from:

    git fetch origin
    git checkout main && git pull
    git checkout -b stage-3a-foundation
    git am path/to/stage-3a/0*.patch        # 6 commits, in order
    npm install --no-package-lock           # or: bun install  (do NOT commit lockfile changes)
    npx tsc --noEmit && npx vitest run && npx eslint . && npx vite build
    git push -u origin stage-3a-foundation

If `git am` complains, `git am --abort` and use the all-in-one diff instead:

    git apply --index stage-3a-foundation-all-in-one.diff

(Optional) the .bundle is the same 6 commits: `git fetch stage-3a-foundation.bundle stage-3a-foundation:stage-3a-foundation`.
Commit 1 is formatting-only; review commits 2-6 for the real changes.
