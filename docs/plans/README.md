# Phase plans

Claude Code writes `phase-N.md` here before coding each phase. The owner approves it in the PR.

Since 2026-10-16 the roadmap (PLAN.md; the spec is `docs/design/workflow-review.md`) runs in mission mode (CLAUDE.md):
one plan per roadmap step, `step-<n>-<name>.md`, approved once; the step's PRs go into a `step/<n>-<name>` branch,
and the step reaches main as one PR carrying its hand-back (what shipped, any numbers change, deviations and parked
questions, and the manual test plan). Step 1 is `step-1-profiles-grading.md`.

## Local guard against direct pushes to `main` (free-plan repos)

```bash
cat > .git/hooks/pre-push <<'HOOK'
#!/bin/sh
while read local_ref local_sha remote_ref remote_sha; do
  if [ "$remote_ref" = "refs/heads/main" ]; then
    echo "Blocked: push to main directly. Open a PR." >&2
    exit 1
  fi
done
HOOK
chmod +x .git/hooks/pre-push
```
