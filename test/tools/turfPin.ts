/**
 * Every Turf package at one exact version (owner, 2026-10-08, Batch A A1; docs/plans/phase-0.md §4). Pure: it
 * reads the text of pnpm-lock.yaml, so its rule is unit-tested and CI runs it on the real lockfile
 * (test/tools/turf-pin.test.ts, `pnpm check:turf`).
 *
 * Why a check and not just the pin: @turf/turf declares its parts as ^7.x, so pinning @turf/turf alone let them
 * float (the port ran 7.4.0 parts behind a 7.1.0 @turf/turf). The overrides in pnpm-workspace.yaml pin each
 * part; this catches a part they don't name yet, or a pin that moved.
 */

export const TURF_VERSION = "7.4.0";
/** Turf's fork of JSTS (used by @turf/buffer), on its own version line. */
export const TURF_EXCEPTIONS: Readonly<Record<string, string>> = { "@turf/jsts": "2.7.2" };

/** Every "@turf/<name>@<version>" the lockfile resolves, from its package keys. */
export function resolvedTurf(lock: string): { name: string; version: string }[] {
  const seen = new Set<string>();
  const out: { name: string; version: string }[] = [];
  for (const m of lock.matchAll(/^ {2}'?(@turf\/[a-z0-9-]+)@([^':(\s]+)/gm)) {
    const key = `${m[1]}@${m[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: m[1]!, version: m[2]! });
  }
  return out;
}

/** The lockfile's own record of the overrides it was resolved with: "@turf/<name>" → version. */
export function lockedOverrides(lock: string): Record<string, string> {
  const section = /^overrides:\n((?: {2}.+\n)+)/m.exec(lock)?.[1] ?? "";
  const out: Record<string, string> = {};
  for (const m of section.matchAll(/^ {2}'?(@turf\/[a-z0-9-]+)'?: '?([^'\s]+)'?$/gm)) out[m[1]!] = m[2]!;
  return out;
}

/** Every problem with the lockfile's Turf versions; empty when all is pinned. */
export function turfPinProblems(lock: string): string[] {
  const resolved = resolvedTurf(lock);
  const overrides = lockedOverrides(lock);
  const problems: string[] = [];
  if (!resolved.length) problems.push("no @turf package found in the lockfile");
  for (const { name, version } of resolved) {
    const want = TURF_EXCEPTIONS[name] ?? TURF_VERSION;
    if (version !== want) problems.push(`${name} resolves to ${version}, not ${want}`);
    if (overrides[name] !== want)
      problems.push(
        `${name} has no exact override (${overrides[name] ?? "none"}): add "${name}": ${want} to pnpm-workspace.yaml`,
      );
  }
  return problems;
}
