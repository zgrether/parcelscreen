/**
 * The grade study's numbers (test/tools/grade-study.test.ts, STAGE=report). Pure: parcels in, tables out.
 * The narrative around them is in gradeStudyText.ts, written after reading these.
 */
import { grade } from "@/lib/screen/score";
import type { StudyParcel } from "./grade-study.test";

export const GRADES = ["A", "B", "C", "D", "F"] as const;
export type Grade = (typeof GRADES)[number];
/** The app's own cutoffs (score.ts), so the study can't drift from them. */
export const gradeOf = (x: number): Grade => grade(x) as Grade;

type Site = NonNullable<StudyParcel["result"]["sites"]>[number];

/** A factor: how to read it from a site (and its parcel), and what kind of number it is. */
export interface Factor {
  key: string;
  label: string;
  part: "quality" | "cost" | "total" | "raw" | "soil";
  /** For quality factors, the weight; for cost, the maximum points. */
  scale?: number;
  of: (s: Site, p: StudyParcel) => number | null;
}

export const FACTORS: Factor[] = [
  { key: "sun", label: "Sun (Dec direct share × 100)", part: "quality", scale: 0.4, of: (s) => s.q.sun },
  { key: "aspect", label: "Aspect", part: "quality", scale: 0.15, of: (s) => s.q.aspect },
  {
    key: "frost",
    label: "Frost (height above the valley floor)",
    part: "quality",
    scale: 0.15,
    of: (s) => s.q.frost,
  },
  { key: "slope", label: "Slope", part: "quality", scale: 0.15, of: (s) => s.q.slope },
  { key: "sky", label: "Sky (per parcel)", part: "quality", scale: 0.15, of: (s) => s.q.sky },
  { key: "septic", label: "Septic (NRCS rating)", part: "cost", scale: 40, of: (s) => s.c.septic },
  {
    key: "foundation",
    label: "Foundation (NRCS rating)",
    part: "cost",
    scale: 25,
    of: (s) => s.c.foundation,
  },
  { key: "rock", label: "Rock (bedrock < 100 cm)", part: "cost", scale: 15, of: (s) => s.c.rock },
  { key: "pad", label: "Pad (slope)", part: "cost", scale: 20, of: (s) => s.c.pad },
  { key: "driveway", label: "Driveway", part: "cost", scale: 40, of: (s) => s.c.driveway },
  { key: "quality", label: "Quality (total)", part: "total", of: (s) => s.quality },
  { key: "cost", label: "Cost index (total)", part: "total", of: (s) => s.costIdx },
  { key: "score", label: "Score", part: "total", of: (s) => s.score },
];

export const RAW: Factor[] = [
  {
    key: "sunShare",
    label: "Dec direct sun / daylight",
    part: "raw",
    of: (s) => (s.daylightH ? s.sunH / s.daylightH : null),
  },
  { key: "slopeDeg", label: "Slope (°)", part: "raw", of: (s) => s.slopeDeg },
  {
    key: "aspectOff",
    label: "Aspect off 160° (°)",
    part: "raw",
    of: (s) => (s.slopeDeg < 3 ? 0 : angOff(s.aspectDeg, 160)),
  },
  {
    key: "aboveFloor",
    label: "Above the valley floor (ft)",
    part: "raw",
    of: (s, p) =>
      p.result.terrain?.valleyFloorFt != null ? s.elevFt - p.result.terrain.valleyFloorFt : null,
  },
  { key: "driveFt", label: "Driveway (ft)", part: "raw", of: (s) => s.driveFt ?? null },
  { key: "acres", label: "Site acres", part: "raw", of: (s) => s.acres },
];

export const SOIL: Factor[] = [
  {
    key: "septicFuzzy",
    label: "NRCS septic rating value (0 = not limited … 1 = very limited)",
    part: "soil",
    of: (_s, p) => p.soilExtra?.septicFuzzy ?? null,
  },
  {
    key: "dwobFuzzy",
    label: "NRCS dwellings-w/o-basements rating value",
    part: "soil",
    of: (_s, p) => p.soilExtra?.dwobFuzzy ?? null,
  },
  {
    key: "brock",
    label: "Depth to bedrock, min (cm)",
    part: "soil",
    of: (_s, p) => p.soilExtra?.brockdepmin ?? null,
  },
  {
    key: "restr",
    label: "Depth to any restriction (cm)",
    part: "soil",
    of: (_s, p) => p.soilExtra?.restrictionCm ?? null,
  },
  {
    key: "ksat",
    label: "Ksat, slowest layer above 150 cm (µm/s)",
    part: "soil",
    of: (_s, p) => p.soilExtra?.ksatMinUmS ?? null,
  },
  {
    key: "unitSlope",
    label: "Map unit's representative slope (%)",
    part: "soil",
    of: (_s, p) => p.soilExtra?.slopeR ?? null,
  },
];

function angOff(a: number, b: number): number {
  const d = Math.abs(((((a - b) % 360) + 540) % 360) - 180);
  return d;
}

const quantile = (xs: number[], q: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i),
    hi = Math.ceil(i);
  return s[lo]! + (s[hi]! - s[lo]!) * (i - lo);
};

export interface Dist {
  n: number;
  missing: number;
  min: number;
  p10: number;
  median: number;
  p90: number;
  max: number;
  mean: number;
  sd: number;
  distinct: number;
  mode: number;
  modeShare: number;
}

export function dist(values: (number | null)[]): Dist | null {
  const xs = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (!xs.length) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  const counts = new Map<number, number>();
  for (const x of xs) counts.set(+x.toFixed(2), (counts.get(+x.toFixed(2)) ?? 0) + 1);
  const [mode, modeN] = [...counts].sort((a, b) => b[1] - a[1])[0]!;
  return {
    n: xs.length,
    missing: values.length - xs.length,
    min: Math.min(...xs),
    p10: quantile(xs, 0.1),
    median: quantile(xs, 0.5),
    p90: quantile(xs, 0.9),
    max: Math.max(...xs),
    mean,
    sd,
    distinct: counts.size,
    mode,
    modeShare: modeN / xs.length,
  };
}

/** Pearson's r over the pairs where both are present; null when fewer than 5 or either is constant. */
export function pearson(a: (number | null)[], b: (number | null)[]): number | null {
  const pairs = a
    .map((x, i) => [x, b[i]] as const)
    .filter((p): p is readonly [number, number] => p[0] != null && p[1] != null);
  if (pairs.length < 5) return null;
  const ma = pairs.reduce((s, p) => s + p[0], 0) / pairs.length;
  const mb = pairs.reduce((s, p) => s + p[1], 0) / pairs.length;
  let sab = 0,
    saa = 0,
    sbb = 0;
  for (const [x, y] of pairs) {
    sab += (x - ma) * (y - mb);
    saa += (x - ma) ** 2;
    sbb += (y - mb) ** 2;
  }
  return saa === 0 || sbb === 0 ? null : sab / Math.sqrt(saa * sbb);
}

/** Near-constant: one value for 70%+ of parcels, two or fewer values, or a spread under 5% of its scale. */
export function nearConstant(d: Dist, scale: number): string | null {
  if (d.distinct <= 2) return `${d.distinct} value${d.distinct === 1 ? "" : "s"}`;
  if (d.modeShare >= 0.7) return `${Math.round(d.modeShare * 100)}% at ${fmt(d.mode)}`;
  if (d.sd < 0.05 * scale) return `sd ${fmt(d.sd)} on a ${scale}-point scale`;
  return null;
}

export const fmt = (x: number | null | undefined, digits = 1): string =>
  x == null || !Number.isFinite(x) ? "—" : Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(digits);

const pct = (k: number, n: number) => (n ? `${Math.round((100 * k) / n)}%` : "—");

/** The study's tables, as markdown, keyed for the text file to place. */
export function tables(parcels: StudyParcel[]): Record<string, string> {
  const withSite = parcels.filter((p) => p.result.sites?.length);
  const best = withSite.map((p) => ({ p, s: p.result.sites![0]! }));
  const all = withSite.flatMap((p) => p.result.sites!.map((s) => ({ p, s })));
  const col = (f: Factor, rows = best) => rows.map(({ s, p }) => f.of(s, p));
  const out: Record<string, string> = {};

  // The parcels.
  out.parcels = [
    "| # | County | Parcel | Acres | How chosen | Sites | #1 grade, score | Verdict | Steps failed |",
    "|---|---|---|---|---|---|---|---|---|",
    ...parcels.map((p, i) => {
      const s = p.result.sites?.[0];
      return `| ${i + 1} | ${p.county} | ${p.parcelId} | ${fmt(p.acres)} | ${p.how} | ${p.result.sites?.length ?? 0} | ${s ? `${s.grade} ${s.score}` : "no site"} | ${p.result.verdict} | ${p.result.failed?.join(", ") || "none"} |`;
    }),
  ].join("\n");

  // Grade shares.
  const share = (rows: { s: Site }[], g: (s: Site) => Grade) =>
    GRADES.map((G) => pct(rows.filter(({ s }) => g(s) === G).length, rows.length)).join(" | ");
  out.grades = [
    `| | n | ${GRADES.join(" | ")} |`,
    "|---|---|---|---|---|---|---|",
    `| Overall grade, #1 site | ${best.length} | ${share(best, (s) => s.grade as Grade)} |`,
    `| Overall grade, every ranked site | ${all.length} | ${share(all, (s) => s.grade as Grade)} |`,
    `| Quality alone (qGrade), #1 site | ${best.length} | ${share(best, (s) => gradeOf(s.quality))} |`,
    `| Cost alone (100 − cost), #1 site | ${best.length} | ${share(best, (s) => gradeOf(100 - s.costIdx))} |`,
  ].join("\n");

  // Per factor: the distribution, and its share in each grade band (quality factors on their 0–100 score; cost
  // parts as 100 − points × 100 / max, so 0 points is 100).
  const bandOf = (f: Factor, v: number): Grade => gradeOf(f.part === "cost" ? 100 - (v * 100) / f.scale! : v);
  const factorRow = (f: Factor, rows = best) => {
    const vs = col(f, rows);
    const d = dist(vs);
    if (!d) return `| ${f.label} | — |`;
    const scale =
      f.part === "cost" ? f.scale! : f.part === "quality" || f.part === "total" ? 100 : d.max - d.min || 1;
    const flag = nearConstant(d, scale);
    const bands =
      f.part === "quality" || f.part === "cost" || f.key === "quality" || f.key === "score"
        ? GRADES.map((G) => pct(vs.filter((v) => v != null && bandOf(f, v) === G).length, d.n)).join(" / ")
        : f.key === "cost"
          ? GRADES.map((G) => pct(vs.filter((v) => v != null && gradeOf(100 - v) === G).length, d.n)).join(
              " / ",
            )
          : "";
    return `| ${f.label} | ${d.n} | ${fmt(d.min)} | ${fmt(d.p10)} | ${fmt(d.median)} | ${fmt(d.p90)} | ${fmt(d.max)} | ${fmt(d.sd)} | ${d.distinct} | ${bands} | ${flag ? `**${flag}**` : ""} |`;
  };
  const head =
    "| Factor | n | min | p10 | median | p90 | max | sd | values | A / B / C / D / F | Near-constant? |\n|---|---|---|---|---|---|---|---|---|---|---|";
  out.factorsBest = [head, ...FACTORS.map((f) => factorRow(f))].join("\n");
  out.factorsAll = [head, ...FACTORS.map((f) => factorRow(f, all))].join("\n");
  out.raw = [head, ...RAW.map((f) => factorRow(f))].join("\n");
  out.soil = [head, ...SOIL.map((f) => factorRow(f))].join("\n");

  // Cost parts: every value and how often.
  out.costValues = [
    "| Part | Values (points: share of #1 sites) |",
    "|---|---|",
    ...FACTORS.filter((f) => f.part === "cost").map((f) => {
      const vs = col(f).filter((v): v is number => v != null);
      const counts = new Map<number, number>();
      for (const v of vs) counts.set(+v.toFixed(1), (counts.get(+v.toFixed(1)) ?? 0) + 1);
      return `| ${f.label} | ${[...counts]
        .sort((a, b) => a[0] - b[0])
        .map(([v, k]) => `${fmt(v)}: ${pct(k, vs.length)}`)
        .join(", ")} |`;
    }),
  ].join("\n");

  // Correlations between the factors (#1 sites).
  const fs = FACTORS.filter((f) => f.part !== "total");
  const short = (f: Factor) => f.key;
  out.corr = [
    `| | ${fs.map(short).join(" | ")} |`,
    `|---|${fs.map(() => "---").join("|")}|`,
    ...fs.map(
      (a) =>
        `| **${a.key}** | ${fs
          .map((b) => {
            if (a === b) return "1";
            const r = pearson(col(a), col(b));
            return r == null ? "·" : Math.abs(r) >= 0.5 ? `**${r.toFixed(2)}**` : r.toFixed(2);
          })
          .join(" | ")} |`,
    ),
  ].join("\n");
  // Each factor against the score: how much of the ranking it carries.
  out.vsScore = [
    "| Factor | r with score (#1 sites) | r with score (every site) |",
    "|---|---|---|",
    ...fs.map((f) => {
      const r1 = pearson(col(f), col(FACTORS.find((x) => x.key === "score")!));
      const r2 = pearson(
        col(f, all),
        col(
          FACTORS.find((x) => x.key === "score")!,
          all,
        ),
      );
      return `| ${f.label} | ${r1 == null ? "·" : r1.toFixed(2)} | ${r2 == null ? "·" : r2.toFixed(2)} |`;
    }),
  ].join("\n");

  // The soil properties against the NRCS septic class: what a replacement could use.
  const bySeptic = new Map<string, StudyParcel[]>();
  for (const p of withSite) {
    const k = p.soilExtra?.septicClass ?? "(none)";
    bySeptic.set(k, [...(bySeptic.get(k) ?? []), p]);
  }
  const med = (ps: StudyParcel[], f: Factor) =>
    fmt(dist(ps.map((p) => f.of(p.result.sites![0]!, p)))?.median);
  out.septicVsSoil = [
    "| NRCS septic class (#1 site) | parcels | median rating value | median bedrock (cm) | median restriction (cm) | median Ksat (µm/s) | median unit slope (%) |",
    "|---|---|---|---|---|---|---|",
    ...[...bySeptic].map(
      ([k, ps]) =>
        `| ${k} | ${ps.length} | ${med(ps, SOIL[0]!)} | ${med(ps, SOIL[2]!)} | ${med(ps, SOIL[3]!)} | ${med(ps, SOIL[4]!)} | ${med(ps, SOIL[5]!)} |`,
    ),
  ].join("\n");
  out.soilPerParcel = [
    "| # | County | Parcel | #1 soil | Septic class (value) | Dwellings class (value) | Bedrock / restriction (cm) | Ksat min (µm/s) | Unit slope (%) | Site slope (°) |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...parcels.map((p, i) => {
      const x = p.soilExtra;
      const s = p.result.sites?.[0];
      return x
        ? `| ${i + 1} | ${p.county} | ${p.parcelId} | ${x.compname ?? "—"} | ${x.septicClass ?? "—"} (${fmt(x.septicFuzzy, 2)}) | ${x.dwobClass ?? "—"} (${fmt(x.dwobFuzzy, 2)}) | ${fmt(x.brockdepmin, 0)} / ${fmt(x.restrictionCm, 0)}${x.restrictionKind ? ` ${x.restrictionKind.toLowerCase()}` : ""} | ${fmt(x.ksatMinUmS, 2)} | ${fmt(x.slopeR, 0)} | ${fmt(s?.slopeDeg)} |`
        : `| ${i + 1} | ${p.county} | ${p.parcelId} | — | — | — | — | — | — | ${fmt(s?.slopeDeg)} |`;
    }),
  ].join("\n");
  return out;
}

/** The parcels for the owner's gut grades: evenly spaced through the tool's ranking, listed by parcel ID. */
export function gutPicks(parcels: StudyParcel[], n = 9): StudyParcel[] {
  const ranked = parcels
    .filter((p) => p.result.sites?.length)
    .sort((a, b) => b.result.sites![0]!.score - a.result.sites![0]!.score);
  const picks = Array.from({ length: n }, (_, i) => ranked[Math.round((i * (ranked.length - 1)) / (n - 1))]!);
  return [...new Set(picks)].sort((a, b) => a.parcelId.localeCompare(b.parcelId));
}
