/**
 * Developer page for steps 14a–14c: the report blocks rendered from the recorded golden results, on the
 * server (this is a Server Component, as the Phase 1 parcel page and its PDF will be). It lets each blocks
 * PR be clicked before the explorer's panel exists; step 14d removes it. A section whose block renders
 * nothing (no house marked, no garden patch) is left out, as the panel will.
 */
import ferney from "@/test/fixtures/ferney-creek-52-47A/golden.json";
import macks from "@/test/fixtures/macks-mountain-35-3/golden.json";
import { DarkSkies } from "@/components/Results/blocks/DarkSkies";
import { DecemberSun } from "@/components/Results/blocks/DecemberSun";
import { Driveway } from "@/components/Results/blocks/Driveway";
import { ExistingHouse } from "@/components/Results/blocks/ExistingHouse";
import { Floodplain } from "@/components/Results/blocks/Floodplain";
import { GettingThere } from "@/components/Results/blocks/GettingThere";
import { PublicLand } from "@/components/Results/blocks/PublicLand";
import { Soils } from "@/components/Results/blocks/Soils";
import { StillUnknown } from "@/components/Results/blocks/StillUnknown";
import { Terrain } from "@/components/Results/blocks/Terrain";
import { evaluationPoint, type BlockProps } from "@/components/Results/blocks/types";
import { Verdict } from "@/components/Results/blocks/Verdict";
import { WhereToBuild } from "@/components/Results/blocks/WhereToBuild";
import { WhereToGarden } from "@/components/Results/blocks/WhereToGarden";
import { buildHeading } from "@/lib/report/build";
import { drivewayHeading } from "@/lib/report/driveway";
import { gardenHeading } from "@/lib/report/garden";
import { houseHeading } from "@/lib/report/house";
import { soilsHeading } from "@/lib/report/soils";
import { floodHeading, gettingThereHeading, publicLandHeading } from "@/lib/report/surroundings";
import { unknownHeading } from "@/lib/report/unknown";
import type { Heading } from "@/lib/report/parts";
import { skyHeading } from "@/lib/report/sky";
import { sunHeading } from "@/lib/report/sun";
import { terrainHeading } from "@/lib/report/terrain";
import { verdictHeading } from "@/lib/report/verdict";
import type { PartialScreenResult } from "@/lib/screen/types";
import type { PrototypeResult } from "@/test/support/fixtures";
import { fromPrototype } from "@/test/support/fromPrototype";
import type { ReactNode } from "react";

const RUNS: Record<string, { name: string; R: unknown }> = {
  "ferney-run": { name: "Ferney Creek 52-47A", R: ferney.run },
  "ferney-house": { name: "Ferney Creek, house marked (re-run)", R: ferney.houseRun },
  "ferney-moved": { name: "Ferney Creek, house added to a run", R: ferney.setHouse },
  "macks-run": { name: "Macks Mountain 35-3", R: macks.run },
  "macks-site2": { name: "Macks Mountain, evaluated at site #2", R: macks.evaluateSite2 },
};

// Blocks are plain functions of their props (no hooks), so a block can be called to see whether it renders.
const SECTIONS: [
  (p: BlockProps) => ReactNode,
  (r: PartialScreenResult, p: BlockProps["point"]) => Heading,
][] = [
  [Verdict, () => verdictHeading],
  [Terrain, () => terrainHeading],
  [DecemberSun, (_, p) => sunHeading(p)],
  [DarkSkies, skyHeading],
  [ExistingHouse, () => houseHeading],
  [WhereToBuild, () => buildHeading],
  [Driveway, drivewayHeading],
  [WhereToGarden, () => gardenHeading],
  [Soils, () => soilsHeading],
  [Floodplain, () => floodHeading],
  [PublicLand, () => publicLandHeading],
  [GettingThere, () => gettingThereHeading],
  [StillUnknown, () => unknownHeading],
];

export default async function DevResultsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams;
  const key = typeof q.run === "string" && q.run in RUNS ? q.run : "ferney-run";
  const partial = q.partial === "1";
  const full = fromPrototype(RUNS[key]!.R as PrototypeResult);
  const result: PartialScreenResult = partial ? { ...full, verdict: undefined, cancelled: undefined } : full;
  const point = evaluationPoint(result);

  return (
    <main className="mx-auto max-w-[440px] p-4">
      <h1 className="font-cond text-[22px] font-semibold">Report blocks (developer page)</h1>
      <p className="tiny muted">
        Rendered on the server from the recorded results. Step 14d moves them into the explorer and removes
        this page.
      </p>
      <nav className="tiny mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {Object.entries(RUNS).map(([k, r]) => (
          <a
            key={k}
            href={`?run=${k}${partial ? "&partial=1" : ""}`}
            className={k === key ? "font-semibold" : ""}
          >
            {r.name}
          </a>
        ))}
        <a href={`?run=${key}${partial ? "" : "&partial=1"}`}>{partial ? "Finished run" : "While running"}</a>
      </nav>
      {SECTIONS.map(([Block, heading]) => {
        const h = heading(result, point);
        const body = Block({ result, point, variant: "panel" });
        if (body === null) return null;
        return (
          <section key={h.slug} className="block" data-key={h.slug}>
            <h2>
              {h.title}
              {h.sub && <small>{h.sub}</small>}
            </h2>
            {body}
          </section>
        );
      })}
    </main>
  );
}
