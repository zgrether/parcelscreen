/**
 * How the port's ScreenResult is held against a prototype golden (plan §7a.3): the comparator's tolerances,
 * and the one addition the port makes to a result. Shared by the Node goldens (lib/screen/screen.test.ts)
 * and the browser e2e (e2e/), so both hold the same line.
 */
import { overLimitNote } from "@/lib/screen/driveway";
import type { ScreenResult } from "@/lib/screen/types";
import type { CompareOptions } from "./compare";

/**
 * Two tolerances beyond the 1e-9 default, each measured, not guessed. Both are the **Turf version**, not the
 * engines (corrected 2026-10-08, Batch A A1; plan §5): the prototype loads the Turf 7.1.0 bundle from a CDN,
 * while npm's @turf/turf 7.1.0 declares its parts as ^7.1.0, so the port runs them at 7.4.0, where
 * pointToLineDistance and nearestPointOnLine changed. The prototype's own functions in Node with the 7.1.0
 * bundle reproduce every Chromium value below to the last digit or two. (The engines do amplify too, but by
 * at most 1.6e-7 relative with the same Turf on both sides: EXPECTED_BROWSER in test/support/expected.ts.)
 * - The road-distance family (roadRunFt, roadGrade, driveFt, the driveway cost point) comes from
 *   turf.nearestPointOnLine. Largest seen: 3.6e-6 relative (Macks Mountain site #6, 1,065.99 ft); across the
 *   three fixtures' sites and roads, the two versions differ by up to 6.2e-6.
 * - driveway.roadsNearestFt (the shortest road-to-boundary distance) comes from turf.pointToLineDistance.
 *   7.1.0 gives 1.9219725335 ft for Ferney Creek (the golden) and 7.4.0 gives 1.8970742829 ft; 0.8974019750
 *   vs 0.8875825113 for Macks Mountain. On Grayson Mud Creek it's 18.4283 vs 18.2627 ft, beyond this
 *   tolerance: 7.4.0 agrees with a brute-force distance (18.262 ft), so it's listed as an intended difference
 *   (phase-0-18-acceptance.md §5), not widened here.
 */
export const PARITY: CompareOptions = {
  ignore: ["runAt", "demResM"], // the prototype stored neither
  paths: {
    "road.runFt": { rel: 1e-5 },
    "road.gradePct": { rel: 1e-5 },
    "sites.roadRunFt": { rel: 1e-5 },
    "sites.roadGrade": { rel: 1e-5 },
    "sites.driveFt": { rel: 1e-5 },
    "sites.c.driveway": { rel: 1e-5 },
    "house.roadRunFt": { rel: 1e-5 },
    "house.roadGrade": { rel: 1e-5 },
    "house.driveFt": { rel: 1e-5 },
    "house.c.driveway": { rel: 1e-5 },
    "driveway.roadsNearestFt": { abs: 0.05 },
  },
};

/**
 * New in the port (owner, after 15c): with no legal route, the result also carries the least-steep route
 * (driveway.overLimit) and one sentence appended to the note. Since #88's follow-up the same happens when the
 * least-steep route kept to the parcel is the one scored, beside routes within the limit: then both additions are
 * taken off and the rest compared as it is. With no legal route, the prototype's note must come first, in full and unchanged:
 * the golden's note is the prefix, then exactly the appended sentence. For parity both additions are taken off
 * again. Throws when the note isn't the prototype's plus that sentence.
 */
export function asPrototype(r: ScreenResult, golden: unknown): ScreenResult {
  const d = r.driveway;
  if (!d?.overLimit) return r;
  const sentence = overLimitNote(d.overLimit);
  if (d.routes.length) {
    // The scored route kept to the parcel beside routes within the limit: take off the route and the sentence, and
    // compare the rest as it is (the prototype never had this case).
    const own =
      d.note === sentence
        ? null
        : d.note?.endsWith(` ${sentence}`)
          ? d.note.slice(0, -sentence.length - 1)
          : d.note;
    const { overLimit: _o, ...rest } = d;
    void _o;
    return { ...r, driveway: { ...rest, note: own } };
  }
  const original = (golden as { driveway: { note: string | null } }).driveway.note;
  if (d.note !== (original == null ? sentence : `${original} ${sentence}`))
    throw new Error(`driveway.note isn't the prototype's note plus the over-limit sentence:\n${d.note}`);
  const { overLimit: _, ...rest } = d;
  void _;
  return { ...r, driveway: { ...rest, note: original } };
}
