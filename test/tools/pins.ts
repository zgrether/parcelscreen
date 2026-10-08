/**
 * The exact pins (owner, 2026-10-08; docs/plans/phase-0.md §4): every Turf package, and geotiff with the
 * packages it decodes with. Pure: it reads the text of pnpm-lock.yaml, so its rule is unit-tested and CI runs it
 * on the real lockfile (test/tools/pins.test.ts, `pnpm check:pins`).
 *
 * Why a check and not just the pins: @turf/turf and geotiff both declare their parts as ^ ranges, so an exact
 * pin on the front package alone let the parts float (the port ran Turf 7.4.0 behind a 7.1.0 @turf/turf). The
 * overrides in pnpm-workspace.yaml pin each part; this catches a part they don't name yet, or a pin that moved.
 */

export const TURF_VERSION = "7.4.0";
/** Turf's fork of JSTS (used by @turf/buffer), on its own version line. */
export const TURF_EXCEPTIONS: Readonly<Record<string, string>> = { "@turf/jsts": "2.7.2" };

export const GEOTIFF_VERSION = "2.1.3";
/**
 * What geotiff decodes with: deflate, LERC, zstd and half-floats. Its other dependencies (quick-lru,
 * parse-headers, web-worker, xml-utils) serve remote files, worker pools and GDAL XML metadata, none of which
 * lib/screen/dem.ts uses (fromArrayBuffer, getImage, readRasters).
 */
export const GEOTIFF_DECODERS: Readonly<Record<string, string>> = {
  pako: "2.2.0",
  lerc: "3.0.0",
  zstddec: "0.1.0",
  "@petamoriken/float16": "3.9.3",
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** Every version of a package the lockfile resolves, from its package keys. */
export function resolvedVersions(lock: string, name: string): string[] {
  const re = new RegExp(`^ {2}'?${escape(name)}@([^':(\\s]+)`, "gm");
  return [...new Set([...lock.matchAll(re)].map((m) => m[1]!))];
}

/** Every "@turf/<name>" the lockfile resolves. */
export function turfNames(lock: string): string[] {
  return [...new Set([...lock.matchAll(/^ {2}'?(@turf\/[a-z0-9-]+)@/gm)].map((m) => m[1]!))];
}

/** The lockfile's own record of the overrides it was resolved with: key → version. */
export function lockedOverrides(lock: string): Record<string, string> {
  const section = /^overrides:\n((?: {2}.+\n)+)/m.exec(lock)?.[1] ?? "";
  const out: Record<string, string> = {};
  for (const m of section.matchAll(/^ {2}'?([^'\n]+?)'?: '?([^'\s]+)'?$/gm)) out[m[1]!] = m[2]!;
  return out;
}

/** A resolved package's own dependencies, from the lockfile's snapshots: name → version. */
export function snapshotDependencies(lock: string, key: string): Record<string, string> {
  const snapshots = lock.slice(lock.search(/^snapshots:$/m));
  const block =
    new RegExp(`^ {2}'?${escape(key)}'?:\\n {4}dependencies:\\n((?: {6}.+\\n)+)`, "m").exec(snapshots)?.[1] ??
    "";
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/^ {6}'?([^'\n]+?)'?: '?([^'\s(]+)/gm)) out[m[1]!] = m[2]!;
  return out;
}

/** Every problem with the pinned packages in this lockfile; empty when all is pinned. */
export function pinProblems(lock: string): string[] {
  const overrides = lockedOverrides(lock);
  const problems: string[] = [];
  const expectOnly = (name: string, want: string, overrideKey: string) => {
    const got = resolvedVersions(lock, name);
    if (!got.length) problems.push(`${name} isn't in the lockfile`);
    for (const v of got) if (v !== want) problems.push(`${name} resolves to ${v}, not ${want}`);
    if (overrides[overrideKey] !== want)
      problems.push(
        `${overrideKey} has no exact override (${overrides[overrideKey] ?? "none"}): add "${overrideKey}": ${want} to pnpm-workspace.yaml`,
      );
  };

  const turf = turfNames(lock);
  if (!turf.length) problems.push("no @turf package found in the lockfile");
  for (const name of turf) expectOnly(name, TURF_EXCEPTIONS[name] ?? TURF_VERSION, name);

  expectOnly("geotiff", GEOTIFF_VERSION, "geotiff");
  const deps = snapshotDependencies(lock, `geotiff@${GEOTIFF_VERSION}`);
  for (const [name, want] of Object.entries(GEOTIFF_DECODERS)) {
    if (deps[name] !== want)
      problems.push(`geotiff's ${name} resolves to ${deps[name] ?? "nothing"}, not ${want}`);
    if (overrides[`geotiff>${name}`] !== want)
      problems.push(
        `geotiff>${name} has no exact override (${overrides[`geotiff>${name}`] ?? "none"}): add "geotiff>${name}": ${want} to pnpm-workspace.yaml`,
      );
  }
  return problems;
}
