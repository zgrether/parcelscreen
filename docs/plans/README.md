# Phase plans

Claude Code writes `phase-N.md` here before coding each phase. The owner approves it in the PR.

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
