/**
 * How the port's ScreenResult is held against a prototype golden (plan §7a.3): the comparator's tolerances,
 * and the one addition the port makes to a result. Shared by the Node goldens (lib/screen/screen.test.ts)
 * and the browser e2e (e2e/), so both hold the same line.
 */
import { overLimitNote } from "@/lib/screen/driveway";
import type { ScreenResult } from "@/lib/screen/types";
import type { CompareOptions } from "./compare";

/**
 * Two tolerances beyond the 1e-9 default, each measured, not guessed (plan §5 "Engine rounding"):
 * - The road-distance family (roadRunFt, roadGrade, driveFt, the driveway cost point) comes from
 *   turf.nearestPointOnLine, which amplifies Chromium-vs-Node last-bit differences. Largest seen: 3.6e-6
 *   relative (Macks Mountain site #6, 1,065.99 ft).
 * - driveway.roadsNearestFt (the shortest road-to-boundary distance) comes from turf.pointToLineDistance near
 *   zero. The prototype's own loop on identical inputs gives 1.9219725335 ft in Chromium (the golden) and
 *   1.8970742829 ft in Node for Ferney Creek; 0.8974019750 vs 0.8875825113 for Macks Mountain.
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
 * (driveway.overLimit) and one sentence appended to the note. The prototype's note must come first, in full
 * and unchanged: the golden's note is the prefix, then exactly the appended sentence. For parity both
 * additions are taken off again. Throws when the note isn't the prototype's plus that sentence.
 */
export function asPrototype(r: ScreenResult, golden: unknown): ScreenResult {
  const d = r.driveway;
  if (!d?.overLimit) return r;
  const original = (golden as { driveway: { note: string } }).driveway.note;
  const appended = ` ${overLimitNote(d.overLimit)}`;
  if (d.note !== original + appended)
    throw new Error(`driveway.note isn't the prototype's note plus the over-limit sentence:\n${d.note}`);
  const { overLimit: _, ...rest } = d;
  void _;
  return { ...r, driveway: { ...rest, note: original } };
}
