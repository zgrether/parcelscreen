/**
 * The site pins (proto finalizeRanking, L1185–1193): shelves S1…, the first three garden patches G1…, the
 * excluded benches ✕ and the ranked sites 1…, in the prototype's order (later ones on top). Each carries its
 * tooltip and the label a tap evaluates under ("site #2"); gardens aren't tappable. Pure, from a result.
 */
import type { LatLon } from "../geo/types";
import type { PartialScreenResult } from "../screen/types";

export type PinKind = "site" | "shelf" | "garden" | "excluded";

export interface PinSpec {
  /** Stable within a result: "site-2", "shelf-1", … */
  key: string;
  kind: PinKind;
  ll: LatLon;
  /** What the pin shows: "2", "S1", "G1", "✕". */
  text: string;
  /** Site #1 is inked (the prototype's `.top`). */
  top: boolean;
  /** The prototype's tooltip, verbatim. */
  tip: string;
  /** The label a tap evaluates under (proto setFocus), or null when a tap doesn't evaluate (gardens). */
  evalLabel: string | null;
}

/** The tooltips' closing sentence when there's a live session to evaluate with… */
const TAP = "Tap to evaluate here.";
/** …and the excluded bench's. */
const TAP_ANYWAY = "Tap to evaluate here anyway.";

export function pinSpecs(r: PartialScreenResult): PinSpec[] {
  const pins: PinSpec[] = [];
  (r.shelves ?? []).forEach((sh, i) =>
    pins.push({
      key: `shelf-${i + 1}`,
      kind: "shelf",
      ll: sh.ll,
      text: `S${i + 1}`,
      top: false,
      tip: `Shelf S${i + 1} — ${sh.acres.toFixed(2)} ac, cell score ${Math.round(sh.score)}. ${TAP}`,
      evalLabel: `shelf S${i + 1}`,
    }),
  );
  (r.gardens ?? []).slice(0, 3).forEach((g, i) =>
    pins.push({
      key: `garden-${i + 1}`,
      kind: "garden",
      ll: g.ll,
      text: `G${i + 1}`,
      top: false,
      tip: `Garden G${i + 1} — ${g.acres.toFixed(2)} ac, ${g.soilNote || ""}`,
      evalLabel: null,
    }),
  );
  (r.excluded ?? []).forEach((x, i) =>
    pins.push({
      key: `excluded-${i + 1}`,
      kind: "excluded",
      ll: x.ll,
      text: "✕",
      top: false,
      tip: `Excluded — ${x.why}. ${TAP_ANYWAY}`,
      evalLabel: "the excluded bench",
    }),
  );
  (r.sites ?? []).forEach((s) =>
    pins.push({
      key: `site-${s.rank}`,
      kind: "site",
      ll: s.ll,
      text: String(s.rank),
      top: s.rank === 1,
      tip: `#${s.rank} — score ${s.score}. ${TAP}`,
      evalLabel: `site #${s.rank}`,
    }),
  );
  return pins;
}

/**
 * The tooltip when there's no session to evaluate with (a kept result after a reload, plan §2): the
 * prototype's "Tap to evaluate here." becomes "Run again to evaluate here."
 */
export const inertTip = (p: PinSpec): string =>
  p.evalLabel
    ? p.tip.replace(p.kind === "excluded" ? TAP_ANYWAY : TAP, "Run again to evaluate here.")
    : p.tip;

/** The unsaved-evaluation note (owner, 15 plan Q1), on the sun, sky and driveway sections and in Copy summary. */
export const evaluatedNote = (label: string): string =>
  `Evaluated at ${label} — not saved. Run again or move the house to keep it.`;
