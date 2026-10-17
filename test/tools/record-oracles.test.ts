/**
 * Records a port-only fixture's oracles once (step 2 plan §7.3): `cards-v8.json`, the card for each of the two weight
 * sets the app shipped with, and `grades-v8.json`, each scenario's derived site and house scores, sky score, flags and
 * verdict, from today's derivations over its expected.json. They are regression snapshots, not a v7 parity proof (the
 * prototype-backed fixtures keep cards-v7.json and grades-v7.json): lib/rubric/default.test.ts and
 * lib/screen/derive.test.ts compare against them, so a later change to a derivation shows.
 *
 *   pnpm record:oracles      writes the files a port-only fixture lacks; never overwrites one
 *
 * Run by hand, never in CI.
 */
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "vitest";
import { reportCard, type Card } from "@/lib/report/card";
import { derived, derivedHouse, derivedSites, skyScoreOf } from "@/lib/screen/derive";
import { flagsOf } from "@/lib/screen/flags";
import { expectedOf } from "../support/expected";
import { FIXTURE_SLUGS, isPrototypeSlug } from "../support/fixtures";
import { PERSONS } from "../support/rubrics";
import { SCENARIOS } from "../support/scenarios";

const SCORE = ["score", "grade", "quality", "qGrade", "q", "c", "costIdx", "costTier"] as const;
const scoresOf = (s: object) => Object.fromEntries(SCORE.map((k) => [k, (s as Record<string, unknown>)[k]]));

/** The card without the rubric and each row's measure, as the oracle tests compare it. */
const comparable = (c: Card) => {
  const { rubric: _rubric, ...rest } = c;
  return { ...rest, rows: rest.rows.map(({ measure: _m, ...row }) => row) };
};

describe.runIf(import.meta.env.MODE === "record-oracles")("record a port-only fixture's oracles", () => {
  for (const slug of FIXTURE_SLUGS.filter((s) => !isPrototypeSlug(s)))
    it(slug, () => {
      const dir = join(process.cwd(), "test", "fixtures", slug);
      const cardsPath = join(dir, "cards-v8.json"),
        gradesPath = join(dir, "grades-v8.json");
      const stamp =
        "schema v9, engine 22: recorded once from the derivations (step 2, PR 5); a regression snapshot";
      if (!existsSync(cardsPath)) {
        const out: Record<string, unknown> = { recordedAt: stamp };
        for (const scenario of SCENARIOS[slug])
          out[scenario] = Object.fromEntries(
            PERSONS.map((nr) => [
              nr.id,
              { person: nr.id, ...comparable(reportCard(expectedOf(slug, scenario), nr)) },
            ]),
          );
        writeFileSync(cardsPath, JSON.stringify(out, null, 1) + "\n");
      }
      if (!existsSync(gradesPath)) {
        const out: Record<string, unknown> = { recordedAt: stamp };
        for (const scenario of SCENARIOS[slug]) {
          const r = expectedOf(slug, scenario);
          const h = derivedHouse(r);
          out[scenario] = {
            verdict: derived(r).verdict,
            flags: flagsOf(r),
            sky: r.sky ? { score: skyScoreOf(r.sky) } : null,
            sites: (derivedSites(r) ?? []).map((s) => ({ rank: s.rank, ...scoresOf(s) })),
            house: h && !("outside" in h) ? scoresOf(h) : null,
          };
        }
        writeFileSync(gradesPath, JSON.stringify(out, null, 1) + "\n");
      }
    });
});
