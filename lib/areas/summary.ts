/**
 * The monthly refresh's plain summary (step 13, docs/plans/step-13-area-catalog.md §3.6): what moved since the files
 * on main, one line per change worth reading ("Meadows of Dan: ER 41 → 18 min"), then each source whose edition
 * changed, then how many areas didn't change. It's the refresh PR's body; no change worth reading, no PR.
 */
import type { AreaFile, Measure } from "./types";

/** How far a median moves before it's worth a line, in its own unit. */
export const SUMMARY_THRESHOLDS: Record<Measure, number> = {
  elevFt: 50,
  skyMag: 0.1,
  janLowF: 1,
  julHighF: 1,
  viewOpenPct: 2,
  erMin: 1,
  groceryMin: 1,
  airportMin: 1,
  trailheadMin: 1,
  openLandFt: 528,
  longTrailMin: 1,
};

/** Each measure as the summary names it, and how it shows a value. */
const SAYS: Record<Measure, { name: string; show: (v: number) => string }> = {
  elevFt: { name: "Elevation", show: (v) => `${v.toLocaleString("en-US")} ft` },
  skyMag: { name: "Night sky", show: (v) => `${v.toFixed(2)} mag` },
  janLowF: { name: "January low", show: (v) => `${v.toFixed(1)} °F` },
  julHighF: { name: "July high", show: (v) => `${v.toFixed(1)} °F` },
  viewOpenPct: { name: "Long view", show: (v) => `${v}% open` },
  erMin: { name: "ER", show: (v) => `${v} min` },
  groceryMin: { name: "Groceries", show: (v) => `${v} min` },
  airportMin: { name: "Airport", show: (v) => `${v} min` },
  trailheadMin: { name: "Trailhead", show: (v) => `${v} min` },
  openLandFt: { name: "Public land", show: (v) => `${(v / 5280).toFixed(1)} mi` },
  longTrailMin: { name: "Long trail", show: (v) => `${v} min` },
};

/** The sources whose line carries the run's own date: a new month alone isn't a change. */
const DATED_BY_THE_RUN = new Set(["places", "drives"]);

/** "a → b", the unit once when both ends share it: "ER 41 → 18 min". */
function moved(m: Measure, a: number | null, b: number | null): string {
  const s = SAYS[m];
  if (a === null) return `${s.name} now measured: ${s.show(b!)}`;
  if (b === null) return `${s.name} no longer measured (was ${s.show(a)})`;
  const [x, y] = [s.show(a), s.show(b)];
  const unit = (t: string) => t.replace(/^[-\d.,]+/, "");
  return unit(x) === unit(y) && unit(x)
    ? `${s.name} ${x.slice(0, x.length - unit(x).length).trim()} → ${y}`
    : `${s.name} ${x} → ${y}`;
}

export interface Summary {
  /** Anything worth a PR: a median past its threshold, an area thin or not, an area added or gone, a new edition. */
  changed: boolean;
  markdown: string;
}

export function refreshSummary(
  before: readonly AreaFile[],
  after: readonly AreaFile[],
  date: string,
): Summary {
  const was = new Map(before.map((f) => [f.id, f]));
  const lines: string[] = [];
  let unchanged = 0;
  for (const f of after) {
    const old = was.get(f.id);
    if (!old) {
      lines.push(`${f.name}: profiled for the first time`);
      continue;
    }
    const mine: string[] = [];
    for (const m of Object.keys(SUMMARY_THRESHOLDS) as Measure[]) {
      const a = old.medians[m];
      const b = f.medians[m];
      if (a === null && b === null) continue;
      if (a === null || b === null || Math.abs(b - a) >= SUMMARY_THRESHOLDS[m]) mine.push(moved(m, a, b));
    }
    if (old.thin !== f.thin)
      mine.push(
        f.thin ? `now thin (${f.points.ll.length} points)` : `no longer thin (${f.points.ll.length} points)`,
      );
    if (mine.length) lines.push(...mine.map((x) => `${f.name}: ${x}`));
    else unchanged++;
  }
  const gone = before
    .filter((f) => !after.some((x) => x.id === f.id))
    .map((f) => `${f.name}: no longer in the catalog`);
  lines.push(...gone);

  // Each source's edition, as the first area before and after reads it (every area shares them).
  const editions: string[] = [];
  const [b0, a0] = [before[0], after[0]];
  if (b0 && a0)
    for (const [k, v] of Object.entries(a0.sources))
      if (!DATED_BY_THE_RUN.has(k) && b0.sources[k] !== v)
        editions.push(`${k}: ${b0.sources[k] ?? "none"} → ${v}`);

  const changed = lines.length > 0 || editions.length > 0;
  const md = [
    `## Area catalog refresh, ${date}`,
    "",
    lines.length
      ? "**What moved** (a typical point's value, the median of each area's points):"
      : "Nothing moved.",
    ...lines.map((l) => `- ${l}`),
    ...(editions.length ? ["", "**New editions:**", ...editions.map((e) => `- ${e}`)] : []),
    "",
    `${unchanged} ${unchanged === 1 ? "area" : "areas"} unchanged.`,
  ];
  return { changed, markdown: md.join("\n") + "\n" };
}
