/**
 * A homesite's measurements in one line (owner, 2026-10-22): Best homesite and the other sites show what was measured,
 * never a letter, so an override on the card (which grades the parcel's graded site only) can't leave a stale letter
 * beside a site. The same fields in the same order for every site: December sun, the way it faces, elevation, the
 * gentle ground for the build, the driveway.
 *
 *   "8.2 h December sun · faces W · 2,649 ft · 1.9 ac gentle ground (4.1× footprint) · 129 ft drive at 6%"
 *
 * The driveway's grade is the steepest the Driveway row reads (card.ts drivewayGradePct).
 */
import { compass, fmt } from "../format";
import { SCREEN_CONSTANTS } from "../screen/config";
import type { PartialScreenResult, ScoredDriveway } from "../screen/types";
import { M2FT, M2_PER_ACRE } from "../screen/util";
import { drivewayGradePct, footprintFt2 } from "./card";

export const MEASURE_WORDS = {
  sun: (h: string) => `${h} h December sun`,
  faces: (dir: string) => `faces ${dir}`,
  elevation: (ft: string) => `${ft} ft`,
  gentle: (ac: string, x: string) => `${ac} ac gentle ground (${x}× footprint)`,
  houseOnly: "fits the house only",
  tooSmall: "too small for the house",
  drive: (ft: string, pct: string) => `${ft} ft drive at ${pct}%`,
  easement: "needs an easement",
  noRoute: "no driveway route",
  noPractical: "no practical driveway",
} as const;

type BuildConfig = typeof SCREEN_CONSTANTS.build;
const FT2_PER_ACRE = M2_PER_ACRE * M2FT * M2FT;

/** The driveway's part: absent until the driveway step has run. */
function drivePart(dw: ScoredDriveway | null | undefined): string | null {
  if (dw === undefined) return null;
  if (dw === null) return MEASURE_WORDS.noRoute;
  if (dw.noPractical) return MEASURE_WORDS.noPractical;
  const line = MEASURE_WORDS.drive(fmt(dw.lengthFt), fmt(drivewayGradePct(dw)));
  return dw.needsEasement ? `${line}, ${MEASURE_WORDS.easement}` : line;
}

/**
 * The line for the ranked site at `index` (into the result's `sites`), or for the marked house ("house"), which has no
 * gentle-ground figure of its own. Empty when there's nothing there.
 */
export function siteMeasures(
  r: PartialScreenResult,
  index: number | "house",
  build: BuildConfig = SCREEN_CONSTANTS.build,
): string {
  const parts: (string | null)[] = [];
  if (index === "house") {
    const h = r.house;
    if (!h || "outside" in h) return "";
    parts.push(
      MEASURE_WORDS.sun(fmt(h.sunH, 1)),
      h.aspectDeg === null ? null : MEASURE_WORDS.faces(compass(h.aspectDeg)),
      h.elevFt === null ? null : MEASURE_WORDS.elevation(fmt(h.elevFt)),
      drivePart(h.driveway),
    );
  } else {
    const s = r.sites?.[index];
    if (!s) return "";
    const x = s.gentleNearAc / (footprintFt2(build) / FT2_PER_ACRE);
    parts.push(
      MEASURE_WORDS.sun(fmt(s.sunH, 1)),
      MEASURE_WORDS.faces(compass(s.aspectDeg)),
      MEASURE_WORDS.elevation(fmt(s.elevFt)),
      s.fit === "fits"
        ? MEASURE_WORDS.gentle(fmt(s.gentleNearAc, 1), fmt(x, x < 10 ? 1 : 0))
        : s.fit === "house only"
          ? MEASURE_WORDS.houseOnly
          : MEASURE_WORDS.tooSmall,
      drivePart(s.driveway),
    );
  }
  return parts.filter((p): p is string => p !== null).join(" · ");
}
