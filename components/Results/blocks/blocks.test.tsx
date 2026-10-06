/**
 * The report blocks against the prototype's own results panel (step 14 plan §8). Each block is rendered with
 * react-dom/server in Node, which also proves it renders on a server (no hooks, no DOM), and its visible text
 * must equal the prototype's section, run on the same recorded result. The horizon chart is compared as
 * drawings: the same skyline and sun path, with B11's labels.
 */
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Heading } from "@/lib/report/parts";
import { skyHeading } from "@/lib/report/sky";
import { horizonChart, sunHeading } from "@/lib/report/sun";
import { terrainHeading } from "@/lib/report/terrain";
import { verdictHeading } from "@/lib/report/verdict";
import { DEFAULT_USER_CONFIG, STEPS } from "@/lib/screen/config";
import type { PartialScreenResult, ScreenResult } from "@/lib/screen/types";
import { loadFixture, type FixtureSlug, type PrototypeResult } from "@/test/support/fixtures";
import { fromPrototype } from "@/test/support/fromPrototype";
import { prototypeSections, visibleText } from "@/test/support/prototypeReport";
import { buildHeading } from "@/lib/report/build";
import { drivewayHeading, profilePath } from "@/lib/report/driveway";
import { gardenHeading } from "@/lib/report/garden";
import { houseHeading } from "@/lib/report/house";
import { soilsHeading } from "@/lib/report/soils";
import { floodHeading, gettingThereHeading, publicLandHeading } from "@/lib/report/surroundings";
import { unknownHeading } from "@/lib/report/unknown";
import { DarkSkies } from "./DarkSkies";
import { DecemberSun } from "./DecemberSun";
import { Driveway } from "./Driveway";
import { ExistingHouse } from "./ExistingHouse";
import { Floodplain } from "./Floodplain";
import { GettingThere } from "./GettingThere";
import { PublicLand } from "./PublicLand";
import { Soils } from "./Soils";
import { StillUnknown } from "./StillUnknown";
import { Terrain } from "./Terrain";
import { evaluationPoint, type BlockProps, type EvaluationPoint } from "./types";
import { Verdict } from "./Verdict";
import { WhereToBuild } from "./WhereToBuild";
import { WhereToGarden } from "./WhereToGarden";

const BLOCKS: {
  slug: string;
  Block: ComponentType<BlockProps>;
  heading(r: PartialScreenResult, p: EvaluationPoint | null): Heading;
}[] = [
  { slug: "verdict", Block: Verdict, heading: () => verdictHeading },
  { slug: "terrain", Block: Terrain, heading: () => terrainHeading },
  { slug: "december-sun", Block: DecemberSun, heading: (_, p) => sunHeading(p) },
  { slug: "dark-skies", Block: DarkSkies, heading: skyHeading },
  { slug: "the-existing-house", Block: ExistingHouse, heading: () => houseHeading },
  { slug: "where-to-build", Block: WhereToBuild, heading: () => buildHeading },
  { slug: "driveway", Block: Driveway, heading: drivewayHeading },
  { slug: "where-to-garden", Block: WhereToGarden, heading: () => gardenHeading },
  { slug: "soils", Block: Soils, heading: () => soilsHeading },
  { slug: "floodplain", Block: Floodplain, heading: () => floodHeading },
  { slug: "public-land-within-a-mile", Block: PublicLand, heading: () => publicLandHeading },
  { slug: "getting-there-and-getting-out", Block: GettingThere, heading: () => gettingThereHeading },
  { slug: "still-unknown", Block: StillUnknown, heading: () => unknownHeading },
];

/**
 * Differences from the prototype the plan approved, removed from our text before comparing. Q4: the Soils
 * block carries the map-unit-scale caveat, which the prototype kept in its help dialog only.
 */
const APPROVED: Record<string, string> = {
  soils: "Map-unit lines are drawn at county scale, so a boundary can be 100 ft off on the ground.",
};

const render = (Block: ComponentType<BlockProps>, result: PartialScreenResult) =>
  renderToStaticMarkup(<Block result={result} point={evaluationPoint(result)} variant="panel" />);

const RUNS: [FixtureSlug, "run" | "setHouse" | "houseRun" | "evaluateSite2"][] = [
  ["ferney-creek-52-47A", "run"],
  ["ferney-creek-52-47A", "setHouse"],
  ["ferney-creek-52-47A", "houseRun"],
  ["macks-mountain-35-3", "run"],
  ["macks-mountain-35-3", "evaluateSite2"],
];

/** Every block, compared with the prototype's section of the same name (or with its absence). */
function expectParity(R: PrototypeResult, ours: PartialScreenResult, partial: boolean) {
  const proto = prototypeSections(R, DEFAULT_USER_CONFIG, partial);
  for (const { slug, Block, heading } of BLOCKS) {
    const html = render(Block, ours);
    const section = proto.get(slug);
    if (!section) {
      expect(html, slug).toBe("");
      continue;
    }
    const text = APPROVED[slug]
      ? visibleText(html).replace(visibleText(APPROVED[slug]), "")
      : visibleText(html);
    expect(text, slug).toBe(visibleText(section.body));
    const h = heading(ours, evaluationPoint(ours));
    expect(visibleText(`${h.title}${h.sub ?? ""}?`), `${slug} heading`).toBe(section.heading);
  }
}

const withoutVerdict = ({ verdict: _v, cancelled: _c, ...rest }: ScreenResult): PartialScreenResult => rest;

/**
 * The goldens don't record the DEM cell size (the prototype kept it in the session). The reference parcels
 * ran at 3 m, which is also what the prototype's driveway caveat hard-codes (B12), so parity runs say so.
 */
const at3m = (R: PrototypeResult): PrototypeResult => ({ ...R, demResM: 3 });

describe.each(RUNS)("report blocks vs the prototype: %s %s", (slug, key) => {
  const R = at3m(loadFixture(slug).goldens[key]!);

  it("finished run", () => expectParity(R, fromPrototype(R), false));

  it("while running (partial)", () => expectParity(R, withoutVerdict(fromPrototype(R)), true));

  it("draws the same horizon and sun path, labelled N/E/S/W (B11)", () => {
    const ours = fromPrototype(R);
    const body = prototypeSections(R, DEFAULT_USER_CONFIG).get("december-sun")!.body;
    const [skyline, sun] = [...body.matchAll(/<path d="([^"]*)"/g)].map((m) => m[1]);
    const chart = horizonChart(ours.sun!.profile, evaluationPoint(ours)!.ll[0]);
    expect(chart.skyline).toBe(skyline);
    expect(chart.sunPath).toBe(sun);
    expect([...body.matchAll(/<text[^>]*>(\w)<\/text>/g)].map((m) => m[1])).toEqual(["E", "S", "W"]);
    expect(render(DecemberSun, ours)).toMatch(/>N<\/text>.*>E<\/text>.*>S<\/text>.*>W<\/text>/);
  });
});

describe("report blocks: runs the goldens don't cover", () => {
  const R = at3m(loadFixture("ferney-creek-52-47A").goldens.run);
  const label = (id: string) => STEPS.find(([s]) => s === id)![1];

  it("a cancelled run with failed steps", () => {
    const cancelled = { ...R, cancelled: true, failed: [label("near"), label("drive")] };
    expectParity(cancelled, fromPrototype(cancelled), false);
  });

  it("early in a run: before the sun and sky steps, those blocks render nothing", () => {
    const { sun: _s, sky: _k, point: _p, focus: _f, sunAt: _a, ...early } = R;
    expectParity(early as PrototypeResult, withoutVerdict(fromPrototype(early as PrototypeResult)), true);
  });
});

describe("driveway", () => {
  it("draws the same elevation profiles as the prototype", () => {
    const R = at3m(loadFixture("ferney-creek-52-47A").goldens.run);
    const body = prototypeSections(R, DEFAULT_USER_CONFIG).get("driveway")!.body;
    const theirs = [...body.matchAll(/<path d="([^"]*)"/g)].map((m) => m[1]);
    expect(fromPrototype(R).driveway!.routes.map((rt) => profilePath(rt.profile))).toEqual(theirs);
    expect(theirs.length).toBeGreaterThan(0);
  });

  it("B12: the caveat names the run's DEM cell size, or none when it's unknown", () => {
    const r = fromPrototype(loadFixture("ferney-creek-52-47A").goldens.run);
    expect(render(Driveway, { ...r, demResM: 10 })).toContain("Least-cost route over the 10 m lidar");
    expect(render(Driveway, { ...r, demResM: undefined })).toContain("Least-cost route over the lidar");
  });
});

describe("report blocks keep the prototype's caveats (CLAUDE.md)", () => {
  const result = fromPrototype(loadFixture("macks-mountain-35-3").goldens.run);
  // React escapes apostrophes in text; compare what a reader sees.
  const text = BLOCKS.map(({ Block }) => render(Block, result))
    .join("")
    .replace(/&#x27;/g, "'");

  it.each([
    "Grey is bare-earth terrain from lidar; trees add to it.",
    "The atlas is zenith-only, so the southern-dome line samples the ground map toward the core as a proxy.",
    "Zenith brightness from the Light Pollution Atlas 2025 (Lorenz, after Falchi/Cinzano), 1/120° grid.",
    "it doesn't know about views, wells, or the neighbor's dog.",
    "Bare-earth DEM (no trees), county soils (not borings), and VDOT decides the entrance — this is a number to put in front of an excavator, not a bid.",
    "Garden score weighs frost position heavily",
    "Map-unit lines are drawn at county scale, so a boundary can be 100 ft off on the ground.",
    "Conservation easements on private land are not in this layer and don't count — you can't walk on them.",
    "Drive times from OSRM's public router — fine for comparing parcels, not for catching a flight.",
    "trailhead counts undercount national forest access.",
  ])("%s", (caveat) => {
    expect(text).toContain(caveat);
  });
});
