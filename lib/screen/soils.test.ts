import type { Feature, Polygon } from "geojson";
import { describe, expect, it } from "vitest";
import { differences } from "../../test/support/compare";
import { FIXTURE_SLUGS, loadFixture } from "../../test/support/fixtures";
import { fromPrototype } from "../../test/support/fromPrototype";
import { throughSites } from "../../test/support/pipeline";
import { prototypeFn } from "../../test/support/prototypeFns";
import { DEFAULT_USER_CONFIG } from "./config";
import { siteFlags } from "./sites";
import {
  bottomland,
  componentQuery,
  fetchSoilPolygons,
  fetchSoils,
  polygonQuery,
  screenableRows,
  soilFlags,
  soilRead,
  vetBenches,
  vetGardens,
  type SoilUnit,
} from "./soils";
import { terrainFlags } from "./terrain";
import type { Dem, SoilRow } from "./types";

const COLS = [
  "mukey",
  "muname",
  "farmlndcl",
  "cokey",
  "compname",
  "comppct_r",
  "drainagecl",
  "hydricrating",
  "slope_l",
  "slope_h",
  "brockdepmin",
  "drclassdcd",
  "hydgrpdcd",
  "wtdepannmin",
  "flodfreqdcd",
  "engdwbdcd",
  "engdwobdcd",
  "engstafdcd",
  "englrsdcd",
  "septic",
] as const;
const row = (o: Partial<SoilRow>): SoilRow => ({
  ...(Object.fromEntries(COLS.map((c) => [c, null])) as SoilRow),
  ...o,
});

describe("SDA queries", () => {
  it.each(FIXTURE_SLUGS)("are byte-identical to the prototype's (%s)", (slug) => {
    const fx = loadFixture(slug);
    const recorded = fx.har.log.entries
      .filter((e) => /sdmdataaccess/i.test(e.request.url))
      .map((e) => new URLSearchParams(e.request.postData!.text).get("query"));
    expect(recorded).toContain(componentQuery(fx.input.polygon));
    expect(recorded).toContain(polygonQuery(fx.input.polygon));
  });
});

// Plain-language readings and the bottomland veto, checked against the prototype's own functions on every
// real component in both fixtures plus 3,000 seeded synthetic rows that cover the branches.
describe("soilRead and bottomland vs the prototype's functions", () => {
  const protoRead = prototypeFn<(x: SoilRow) => unknown>("soilRead", { CFG: { shallowBedrockCm: 100 } });
  const protoBottom = prototypeFn<(x: SoilRow) => string | null>("bottomland");
  const real = FIXTURE_SLUGS.flatMap((s) => fromPrototype(loadFixture(s).goldens.run).soils!);
  let seed = 7;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
  const ratings = [null, "", "Not limited", "Somewhat limited", "Very limited", "Not rated"];
  const synthetic = Array.from({ length: 3000 }, (_, i) =>
    row({
      compname: `Soil${i}`,
      muname: pick([
        null,
        "Unicoi complex, 8 to 15 percent slopes",
        "Tate loam, 25 to 45 percent slopes",
        "Udorthents",
      ]),
      drainagecl: pick([
        null,
        "",
        "Well drained",
        "Moderately well drained",
        "Somewhat poorly drained",
        "Poorly drained",
        "Very poorly drained",
      ]),
      drclassdcd: pick([null, "Well drained", "Poorly drained"]),
      flodfreqdcd: pick([null, "", "None", "Rare", "Occasional", "Frequent", "Very frequent"]),
      hydricrating: pick([null, "No", "Yes", "Partially hydric"]),
      septic: pick(ratings),
      engstafdcd: pick(ratings),
      engdwbdcd: pick(ratings),
      engdwobdcd: pick(ratings),
      slope_h: pick([null, "", "4", "15", "16", "25", "26", "60"]),
      brockdepmin: pick([null, "", "0", "50", "99", "100", "150", "201", "250"]),
      wtdepannmin: pick([null, "", "20", "99", "100", "180"]),
      farmlndcl: pick([
        null,
        "All areas are prime farmland",
        "Not prime farmland",
        "Farmland of statewide importance",
        "Farmland of local importance",
        "Prime farmland if drained",
      ]),
    }),
  );

  it.each([
    ["the recorded components", real],
    ["3,000 synthetic rows", synthetic],
  ] as const)("agree on %s", (_name, rows) => {
    expect(rows.length).toBeGreaterThan(0);
    for (const x of rows) {
      expect(soilRead(x, 100), x.compname!).toEqual(protoRead(x));
      expect(bottomland(x), x.compname!).toBe(protoBottom(x));
    }
  });
});

describe("bench vetting (synthetic: neither golden has a bottomland bench)", () => {
  const everywhere: Feature<Polygon> = {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [-180, -89],
          [180, -89],
          [180, 89],
          [-180, 89],
          [-180, -89],
        ],
      ],
    },
  };
  const wet: SoilUnit[] = [{ mukey: "1", muname: "wet", acres: 2, color: "#000", geos: [everywhere] }];
  const rows = [row({ mukey: "1", compname: "Codorus", comppct_r: "85", drainagecl: "Poorly drained" })];
  const dFine: Dem = {
    z: new Float32Array(4),
    w: 2,
    h: 2,
    x0: 500000,
    y0: 4080000,
    res: 1,
    resY: 1,
    source: "USGS 3DEP",
  };
  const bench = (id: number, acres: number) => ({
    id,
    cells: [],
    acres,
    elevFt: 0,
    slopeDeg: 0,
    aspectDeg: 0,
    rc: [0, 0] as [number, number],
    score: 70,
    slopeScore: 0,
    aspectScore: 0,
    thermalScore: 0,
    relaxed: false,
  });

  it("every bench on bottomland: best stays the largest, with the 'every bench' flag", () => {
    const v = vetBenches([bench(1, 3), bench(2, 1)], dFine, wet, rows);
    expect(v.best!.id).toBe(1);
    expect(v.best!.veto).toBe("Codorus: poorly drained");
    expect(v.flags).toEqual([
      {
        lvl: "warn",
        t: "Every bench sits on bottomland (Codorus: poorly drained). Nothing flat here is a homesite; the buildable ground is on the slopes.",
      },
    ]);
  });

  it("no soil polygons: nothing is vetoed and there are no flags", () => {
    const v = vetBenches([bench(1, 3)], dFine, null, rows);
    expect(v.best!.veto).toBeNull();
    expect(v.flags).toEqual([]);
  });
});

describe.each(FIXTURE_SLUGS)("soils on %s vs the prototype", (slug) => {
  it("matches soils, soil units, bench vetoes, gardens and the flags so far", async () => {
    const t = await throughSites(slug);
    const golden = fromPrototype(t.fx.goldens.run);
    const rows = screenableRows(await fetchSoils(t.parcel, t.deps));
    const units = await fetchSoilPolygons(t.parcel, t.deps);

    expect(rows).toEqual(golden.soils);
    expect(
      differences(
        units.map(({ geos, ...u }) => ({ ...u, geometries: geos })),
        golden.soilUnits,
      ),
    ).toEqual([]);

    // Bench vetoes, in the re-sorted order; result benches are looked up by component id.
    const vet = vetBenches(t.search.benches, t.dFine, units, rows);
    const resultBench = (id: number) => t.sites.benches[t.search.benches.findIndex((b) => b.id === id)]!;
    expect(
      differences(
        vet.benches.map((b) => ({ ...resultBench(b.id), veto: b.veto })),
        golden.benches,
      ),
    ).toEqual([]);

    // Gardens: soil, note, adjustment, final score, and the re-sort, in order now.
    expect(differences(vetGardens(t.sites.gardens, units, rows), golden.gardens)).toEqual([]);

    // Flags so far, in the prototype's order: sites, slope, bottomland, soils.
    const flags = [
      ...siteFlags(t.search, DEFAULT_USER_CONFIG, false),
      ...terrainFlags(golden.terrain!.slopeP90Deg),
      ...vet.flags,
      ...soilFlags(rows, units, t.acres, DEFAULT_USER_CONFIG.shallowBedrockCm),
    ];
    expect(golden.flags.slice(0, flags.length)).toEqual(flags);
  });
});
