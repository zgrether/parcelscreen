/**
 * The grade study's what-ifs (report only; nothing in lib/screen changes). Each re-costs a parcel's #1 site
 * from its stored parts with one or more soil or sky terms replaced, and re-scores it with the app's split.
 * The other sites aren't re-ranked: a what-if can promote a different site to #1 that this doesn't see.
 */
import { SCREEN_CONSTANTS } from "@/lib/screen/config";
import { grade } from "@/lib/screen/score";
import type { StudyParcel } from "./grade-study.test";

const SKY = SCREEN_CONSTANTS.sky;
const W = SCREEN_CONSTANTS.score.overall;

const lerp = (x: number, pts: readonly (readonly [number, number])[]): number => {
  if (x <= pts[0]![0]) return pts[0]![1];
  for (let i = 1; i < pts.length; i++)
    if (x <= pts[i]![0]) {
      const [x0, y0] = pts[i - 1]!,
        [x1, y1] = pts[i]!;
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  return pts[pts.length - 1]![1];
};

/** NRCS's "Slope 8 to > 15%" membership as these map units report it: 8% → 0, 11% → 0.367, 12% → 0.633, 15% → 1. */
export const NRCS_SLOPE = [
  [8, 0],
  [11, 0.367],
  [12, 0.633],
  [15, 1],
] as const;

export interface WhatIf {
  key: string;
  sitePct: number;
  unitPct: number | null;
  /** NRCS's limiting features (≥ 0.5) other than slope. */
  septicWhy: string;
  today: {
    septic: number;
    foundation: number;
    rock: number;
    sky: number;
    cost: number;
    score: number;
    grade: string;
  };
  /** A: the site's own lidar slope in place of the map unit's, in both NRCS ratings; rock scaled by depth. */
  a: { septic: number; foundation: number; rock: number; cost: number; score: number; grade: string };
  /** B: A, plus "seepage, bottom layer" at half weight, no slope in foundation, and the dome penalty full at w = 8. */
  b: {
    septic: number;
    foundation: number;
    rock: number;
    sky: number;
    cost: number;
    score: number;
    grade: string;
  };
}

export function whatIfs(parcels: StudyParcel[]): WhatIf[] {
  return parcels
    .filter((p) => p.result.sites?.length)
    .map((p) => {
      const s = p.result.sites![0]!;
      const reasons = p.reasons ?? [];
      const sitePct = Math.tan((s.slopeDeg * Math.PI) / 180) * 100;
      const slopeF = lerp(sitePct, NRCS_SLOPE);
      const worst = (rule: string, skipSeepage: boolean) =>
        Math.max(
          0,
          ...reasons
            .filter(
              (r) =>
                r.rule.startsWith(rule) &&
                r.depth === 1 &&
                !r.reason.startsWith("Slope") &&
                !(skipSeepage && /Seepage/.test(r.reason)),
            )
            .map((r) => r.value ?? 0),
        );
      const seepage = reasons.some(
        (r) => r.rule.startsWith("ENG - Septic") && /Seepage/.test(r.reason) && (r.value ?? 0) >= 1,
      );
      const x = p.soilExtra;
      const depths = [x?.brockdepmin, x?.restrictionCm].filter((d): d is number => d != null);
      const depth = depths.length ? Math.min(...depths) : null;
      const rockA = depth == null ? 0 : 15 * Math.max(0, Math.min(1, (150 - depth) / 100));
      const rest = s.costIdx - s.c.septic - s.c.foundation - s.c.rock;
      const score = (quality: number, cost: number) =>
        Math.round(W.quality * quality + W.cost * (100 - cost));

      const septicA = 40 * Math.max(worst("ENG - Septic", false), slopeF);
      const foundA = 25 * Math.max(worst("ENG - Dwellings W/O", false), slopeF);
      const costA = Math.min(100, rest + septicA + foundA + rockA);

      const septicB = 40 * Math.max(worst("ENG - Septic", true), slopeF, seepage ? 0.5 : 0);
      const foundB = 25 * worst("ENG - Dwellings W/O", false);
      const costB = Math.min(100, rest + septicB + foundB + rockA);
      const k = p.result.sky;
      let skyB = s.q.sky;
      if (k && k.dome) {
        const [m0, m1] = SKY.magRange;
        const base = Math.max(0, Math.min(1, (k.mag - m0) / (m1 - m0))) * 100;
        const core =
          k.coreClear <= 0 ? SKY.coreBlockedPenalty : k.coreClear < SKY.coreLowDeg ? SKY.coreLowPenalty : 0;
        skyB = Math.max(0, Math.round(base - SKY.domePenaltyMax * Math.min(1, k.dome.w / 8) - core));
      }
      const qB = s.quality + SCREEN_CONSTANTS.score.weights.sky * (skyB - s.q.sky);
      const r1 = (v: number) => +v.toFixed(1);
      const scoreA = score(s.quality, costA),
        scoreB = score(qB, costB);
      return {
        key: p.key,
        sitePct: r1(sitePct),
        unitPct: x?.slopeR ?? null,
        septicWhy:
          reasons
            .filter(
              (r) =>
                r.rule.startsWith("ENG - Septic") &&
                r.depth === 1 &&
                !r.reason.startsWith("Slope") &&
                (r.value ?? 0) >= 0.5,
            )
            .map((r) => (r.cls ?? r.reason).toLowerCase())
            .join(", ") || "slope only",
        today: {
          septic: s.c.septic,
          foundation: s.c.foundation,
          rock: s.c.rock,
          sky: s.q.sky,
          cost: s.costIdx,
          score: s.score,
          grade: s.grade,
        },
        a: {
          septic: r1(septicA),
          foundation: r1(foundA),
          rock: r1(rockA),
          cost: Math.round(costA),
          score: scoreA,
          grade: grade(scoreA),
        },
        b: {
          septic: r1(septicB),
          foundation: r1(foundB),
          rock: r1(rockA),
          sky: skyB,
          cost: Math.round(costB),
          score: scoreB,
          grade: grade(scoreB),
        },
      };
    });
}
