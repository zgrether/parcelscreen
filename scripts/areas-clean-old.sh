#!/usr/bin/env bash
# Removes the older versions' area files: every public/areas/v<n>/*.json but the current version's, directly in each
# folder, never in a subfolder (v1/samples/ is the samples', a version of their own). The places workflow's areas job
# runs it from the repository's root before committing (#350: a bare pathspec's * crossed into v1/samples/).
# test/tools/areas-clean.test.ts guards it.
#
#   scripts/areas-clean-old.sh <current AREA_FILE_VERSION>
set -euo pipefail
current="$1"
for d in public/areas/v*/; do
  [ -d "$d" ] || continue
  # :(glob) makes the * stop at the folder.
  [ "$d" = "public/areas/v$current/" ] || git rm -q --ignore-unmatch ":(glob)$d*.json"
done
