/**
 * CI: a warning, never a failure, when the hospital snapshot is more than MAX_AGE_DAYS old (owner, #82 review).
 * It's meant to be regenerated quarterly (`pnpm data:hospitals`, docs/plans/phase-0.md §9.21).
 *
 *   pnpm check:hospitals-age
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const MAX_AGE_DAYS = 120;
const FILE = "lib/screen/data/hospitals.json";

/** The warning to show, or null when the snapshot is fresh enough. */
export function ageWarning(generatedAt: string, today: Date, maxDays: number = MAX_AGE_DAYS): string | null {
  const made = Date.parse(`${generatedAt}T00:00:00Z`);
  if (Number.isNaN(made))
    return `${FILE}: generatedAt "${generatedAt}" isn't a date. Run pnpm data:hospitals.`;
  const days = Math.floor((today.getTime() - made) / 86_400_000);
  return days > maxDays
    ? `${FILE} was generated ${generatedAt}, ${days} days ago (over ${maxDays}). Run pnpm data:hospitals and treat the PR as a numbers change (phase-0.md §9.21).`
    : null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(import.meta.dirname, "..");
  const { generatedAt } = JSON.parse(readFileSync(resolve(root, FILE), "utf8")) as { generatedAt: string };
  const w = ageWarning(generatedAt, new Date());
  // A GitHub Actions annotation; the step still passes.
  console.log(
    w
      ? `::warning file=${FILE},title=Hospital snapshot is stale::${w}`
      : `${FILE}: generated ${generatedAt}, fresh.`,
  );
}
