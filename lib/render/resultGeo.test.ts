/**
 * Soils, trailheads and the driveway against the prototype's own drawing code (step 15 plan §7): its
 * drawSoilUnits and drawDriveway run with a stub Leaflet that records each shape, its style and tooltip.
 */
import { describe, expect, it } from "vitest";
import type { ScreenResult } from "../screen/types";
import { FIXTURE_SLUGS, loadFixture } from "@/test/support/fixtures";
import { fromPrototype } from "@/test/support/fromPrototype";
import { prototypeFn } from "@/test/support/prototypeFns";
import { drivewayFeatures, soilFeatures, trailheadFeatures } from "./resultGeo";

interface Drawn {
  kind: string;
  data: unknown;
  style: Record<string, unknown>;
  tip?: string;
}

function fakeLeaflet(out: Drawn[]) {
  const item = (d: Drawn) => {
    const self = { bindTooltip: (t: string) => ((d.tip = t), self), addTo: () => (out.push(d), self) };
    return self;
  };
  return {
    geoJSON: (g: unknown, o: { style: Record<string, unknown> }) =>
      item({ kind: "geo", data: g, style: o.style }),
    polyline: (ll: unknown, style: Record<string, unknown>) => item({ kind: "line", data: ll, style }),
    circleMarker: (ll: unknown, style: Record<string, unknown>) => item({ kind: "circle", data: ll, style }),
    marker: (ll: unknown, o: { icon: { html: string } }) =>
      item({ kind: "marker", data: ll, style: { html: o.icon.html } }),
    divIcon: (o: unknown) => o,
  };
}

const runs = FIXTURE_SLUGS.flatMap((slug) =>
  Object.keys(loadFixture(slug).goldens).map((k) => [slug, k] as const),
);
const golden = (slug: (typeof runs)[number][0], key: string) =>
  structuredClone(loadFixture(slug).goldens[key as "run"]!) as Record<string, unknown> & {
    soilUnits?: { geos: unknown[] }[];
    near?: { trailheads: { name: string; ll: [number, number] }[] };
  };

describe("soil units (15c) vs the prototype's drawSoilUnits", () => {
  it.each(runs)("%s %s: every piece, in its colour, with its tooltip", (slug, key) => {
    const R = golden(slug, key);
    const drawn: Drawn[] = [];
    prototypeFn<(u: unknown) => void>("drawSoilUnits", {
      L: fakeLeaflet(drawn),
      overlays: {},
      SOIL_COLORS: ["#c2803a", "#4a7c9e", "#8a5ea8", "#b04a4a", "#3f8f6b", "#a89a2e", "#6b6b6b", "#d07aa0"],
    })(R.soilUnits ?? []);
    // Per piece the prototype draws a white halo, then the coloured, tooltipped outline.
    const outlines = drawn.filter((d) => d.tip);
    const ours = soilFeatures(fromPrototype(R as never) as ScreenResult).features;
    expect(ours.length).toBe(outlines.length);
    ours.forEach((f, i) => {
      expect(f.properties.tip).toBe(outlines[i]!.tip);
      expect(f.properties.color).toBe(outlines[i]!.style.color);
      expect(f.geometry).toEqual((outlines[i]!.data as { geometry: unknown }).geometry ?? outlines[i]!.data);
    });
  });
});

describe("trailheads (15c)", () => {
  it.each(runs)("%s %s: one dot per trailhead, its name as the tooltip (proto L1129)", (slug, key) => {
    const R = golden(slug, key);
    const ours = trailheadFeatures(fromPrototype(R as never) as ScreenResult).features;
    const want = R.near?.trailheads ?? [];
    expect(ours.map((f) => f.properties.tip)).toEqual(want.map((t) => t.name));
    expect(ours.map((f) => f.geometry.coordinates)).toEqual(want.map((t) => [t.ll[1], t.ll[0]]));
  });
});

describe("driveway (15c, B1) vs the prototype's drawDriveway", () => {
  it.each(runs)(
    "%s %s: routes, culverts, the direct track and the entrances, with their tooltips",
    (slug, key) => {
      const R = golden(slug, key);
      const drawn: Drawn[] = [];
      prototypeFn<(R: unknown) => void>("drawDriveway", {
        L: fakeLeaflet(drawn),
        overlays: { hasLayer: () => true },
        dwLayer: { clearLayers: () => {} },
        fmt: prototypeFn("fmt"),
      })(R);
      const ours = drivewayFeatures(fromPrototype(R as never) as ScreenResult);
      const tips = (kind: string) => drawn.filter((d) => d.kind === kind && d.tip).map((d) => d.tip);
      // Entrances (markers), then per route its line and culverts, then the direct track.
      expect(ours.entrances.map((e) => e.tip)).toEqual(tips("marker"));
      expect(ours.entrances.map((e) => e.text)).toEqual(
        drawn.filter((d) => d.kind === "marker").map((d) => /E\d+/.exec(String(d.style.html))![0]),
      );
      const lines = ours.lines.features
        .filter((f) => f.properties.kind !== "culvert")
        .map((f) => f.properties.tip);
      expect(lines).toEqual(tips("line"));
      const culverts = ours.lines.features.filter((f) => f.properties.kind === "culvert");
      expect(culverts.length).toBe(drawn.filter((d) => d.kind === "circle").length);
      // B1: these runs have a driveway, and it's drawn.
      if (((R as { driveway?: { routes: unknown[] } }).driveway?.routes.length ?? 0) > 0)
        expect(ours.lines.features.some((f) => f.properties.kind === "route")).toBe(true);
    },
  );
});

describe("the least-steep route on the map (owner, after 15c)", () => {
  it("draws it as suspect with its over-limit stretches on top, and the entrances it starts from", async () => {
    const { replayRun } = await import("@/test/support/session");
    const { entranceCandidates, leastSteep } = await import("../screen/driveway");
    const { routeContext } = await import("../screen/index");
    const { length } = await import("@turf/turf");
    const { result, session } = await replayRun("ferney-creek-52-47A");
    const { entrances } = entranceCandidates(session.roads ?? [], session.parcel, session.dFine!);
    const o = leastSteep(routeContext(session), entrances, result.sites![0]!.ll, 2)!;
    const r = { ...result, driveway: { ...result.driveway!, routes: [], direct: undefined, overLimit: o } };
    const { lines, entrances: pins } = drivewayFeatures(r as ScreenResult);
    const kinds = lines.features.map((f) => f.properties.kind);
    expect(kinds.filter((k) => k === "over")).toHaveLength(1);
    expect(kinds.filter((k) => k === "overStretch")).toHaveLength(o.overSpans.length);
    expect(kinds.some((k) => k === "route" || k === "direct")).toBe(false);
    // Each stretch is cut to its span along the route.
    lines.features
      .filter((f) => f.properties.kind === "overStretch")
      .forEach((f, i) => {
        const [a, b] = o.overSpans[i]!;
        expect(length(f as never, { units: "meters" })).toBeCloseTo(b - a, 0);
      });
    expect(lines.features[0]!.properties.tip).toMatch(
      /^over the limit: needs \d+%, about [\d,]+ ft steeper than 2% — ~\$[\d,]+k, suspect$/,
    );
    expect(pins.map((p) => p.text)).toEqual(r.driveway.entrances.map((_, i) => `E${i + 1}`));
  }, 120_000);
});
