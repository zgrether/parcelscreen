/**
 * Where to build (proto L1506–1514) and its side-by-side table (proto compareTable, L1568–1575). Every score here is
 * derived from the stored measurements (v8; lib/screen/derive.ts).
 */
import { compass, fmt } from "../format";
import { derivedHouse, derivedSites } from "../screen/derive";
import type { PartialScreenResult, ScoredSite } from "../screen/types";
import { factorsOf, type RichItem, type SiteCard } from "./facts";
import { onMap, said, type Heading, type Part } from "./parts";

export const buildHeading: Heading = {
  title: "Where to build",
  sub: "ranked from the data",
  slug: "where-to-build",
  help: "h-rank",
};

/** One row of the side-by-side table: the cells in column order (proto L1571). */
export interface CompareRow {
  cells: { strong?: string; text: string }[];
}

export const COMPARE_COLUMNS = [
  "Site",
  "Quality",
  "Sun h",
  "Aspect",
  "Frost",
  "Slope",
  "Sky",
  "Cost",
  "Septic",
  "Found.",
  "Rock",
  "Pad",
  "Driveway",
  "Overall",
] as const;

export interface BuildView {
  /** "No bench survived the soil veto…", when nothing ranked but benches were excluded. */
  none: string | null;
  sites: SiteCard[];
  compare: CompareRow[];
  compareNote: string;
  shelves: { items: RichItem[]; note: string } | null;
  excluded: RichItem[];
  footer: Part[];
}

const cell = (v: number | null | undefined) => (v == null ? "—" : String(v));

function compareRows(r: PartialScreenResult): CompareRow[] {
  const rows: (Partial<ScoredSite> & { name: string })[] = (derivedSites(r) ?? []).map((s) => ({
    name: `#${s.rank}${s.compact ? " compact" : ""}`,
    ...s,
  }));
  const h = derivedHouse(r);
  if (h && !("outside" in h)) rows.push({ ...(h as Partial<ScoredSite>), name: "House" });
  return rows.map((x) => ({
    cells: [
      { text: x.name },
      { strong: x.qGrade || "—", text: ` ${cell(x.quality)}` },
      { text: x.sunH != null ? fmt(x.sunH, 1) : "—" },
      { text: x.q ? String(x.q.aspect) : "—" },
      { text: x.q ? String(x.q.frost) : "—" },
      { text: x.q ? String(x.q.slope) : "—" },
      { text: x.q ? String(x.q.sky) : "—" },
      { strong: x.costTier || "—", text: ` ${cell(x.costIdx)}` },
      { text: x.c ? cell(x.c.septic) : "—" },
      { text: x.c ? cell(x.c.foundation) : "—" },
      { text: x.c ? cell(x.c.rock) : "—" },
      { text: x.c ? fmt(x.c.pad) : "—" },
      { text: `${x.driveFt != null ? `${fmt(x.driveFt)} ft` : "—"}${x.c ? ` (${fmt(x.c.driveway)})` : ""}` },
      { text: cell(x.score) },
    ],
  }));
}

/** A site the build doesn't fit on, labelled (owner, #94 review): it ranks after the sites that fit. */
export const FIT_LABEL = {
  "house only": "fits house only",
  "too small": "too small for your build",
} as const;

/** Null until there are ranked sites or excluded benches. */
export function buildView(r: PartialScreenResult): BuildView | null {
  if (!r.sites || !(r.sites.length || r.excluded?.length)) return null;
  const titles = ["Best site", "Runner-up", "Third"];
  const sites = derivedSites(r) ?? [];
  return {
    none: sites.length
      ? null
      : "No bench survived the soil veto. The flat ground here is floodplain; a homesite would have to be cut into the slope.",
    sites: sites.slice(0, 3).map((s) => ({
      marker: { text: String(s.rank), style: s.rank === 1 ? "top" : "alt" },
      title: `${titles[s.rank - 1] ?? "Third"}${s.compact ? " (compact)" : ""}`,
      chips: [
        { text: `${s.qGrade} site`, kind: s.qGrade, title: "Site quality" },
        { text: `${s.costTier} to build`, kind: "cost", title: "Build cost tier" },
        // The build footprint (VR3a; value-ranking.md §5.4 (a)): appended when the build doesn't fit (rule 7).
        ...(s.fit === "fits" ? [] : [{ text: FIT_LABEL[s.fit], kind: "fit", title: "Build footprint" }]),
      ],
      summary: `overall ${s.score} · ${fmt(s.elevFt)} ft · ${s.ll[0].toFixed(5)}, ${s.ll[1].toFixed(5)}`,
      factors: [
        ...factorsOf(s.q),
        ...(s.driveFt != null ? [{ label: "driveway", value: `${fmt(s.driveFt)} ft` }] : []),
      ],
      items: s.why.map((w) => ({ text: w })),
    })),
    compare: compareRows(r),
    compareNote:
      "Quality is the spot itself — sun 40, aspect/frost/slope/sky 15 each — and can't be bought. Cost is what it takes to build there, as points toward 100: septic class, foundation rating, rock, pad cutting, driveway length and grade. A great spot with a long driveway is an A site at $$$, not a D.",
    shelves: r.shelves?.length
      ? {
          items: r.shelves.map((sh, i) => ({
            strong: `S${i + 1}`,
            text: ` — ${fmt(sh.acres, 2)} ac at ${fmt(sh.elevFt)} ft, faces ${compass(sh.aspectDeg)}, ${fmt(sh.slopeDeg, 1)}° slope, cell score ${fmt(sh.score)}${
              sh.distFt != null
                ? `; ${fmt(sh.distFt)} ft from site #1, ${(sh.dropFt ?? 0) >= 0 ? "up" : "down"} ${fmt(Math.abs(sh.dropFt ?? 0))} ft`
                : ""
            }`,
          })),
          note: `A shelf is ground that scores ${r.params.shelfMin}+ but is too small or too shaded for a house — fine for a building you don't live in. Watch the drop from the house: 60 ft down over 400 ft is a 15% driveway.`,
        }
      : null,
    excluded: (r.excluded ?? []).map((x) => ({
      text: `${fmt(x.acres, 1)} ac at ${x.ll[0].toFixed(5)}, ${x.ll[1].toFixed(5)} — ${x.why}. NRCS says no, whatever FEMA says.`,
    })),
    footer: [
      said("Ranked by overall = 70% site quality + 30% (100 − cost)."),
      onMap(" Numbered pins on the map."),
      said(
        " It ranks the ground the terrain scan found; it doesn't know about views, wells, or the neighbor's dog.",
      ),
    ],
  };
}
