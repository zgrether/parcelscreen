/**
 * The surface image against the prototype's own drawing code (step 15 plan §7): its drawTerrainOverlay runs
 * on the same session arrays, with a stub canvas that hands back the pixels it wrote.
 */
import { describe, expect, it } from "vitest";
import { createHttpClient } from "../http";
import { fwd } from "../geo/utm";
import { DEFAULT_USER_CONFIG } from "../screen/config";
import { screen } from "../screen";
import { sessionView, type SessionView } from "../screen/worker-protocol";
import { loadFixture, type FixtureSlug } from "@/test/support/fixtures";
import { instantClock } from "@/test/support/pipeline";
import { prototypeFn } from "@/test/support/prototypeFns";
import { heat, SURFACE_MODES, surfaceCorners, surfaceImage, type SurfaceMode } from "./surface";

async function viewOf(slug: FixtureSlug): Promise<SessionView> {
  const replay = loadFixture(slug).replayFetch();
  const out = await screen(
    { polygon: loadFixture(slug).input.polygon.geometry, config: DEFAULT_USER_CONFIG },
    undefined,
    {
      http: createHttpClient({
        env: "node",
        fetchImpl: replay as unknown as typeof fetch,
        clock: instantClock(),
      }),
      sleep: async () => {},
    },
  );
  return sessionView(out.session);
}

/** The prototype's three images for a session: drawTerrainOverlay with a canvas that keeps the pixels. */
function prototypeImages(v: SessionView): Record<SurfaceMode, Uint8ClampedArray> {
  const canvas = () => {
    let data: Uint8ClampedArray | null = null;
    return {
      width: 0,
      height: 0,
      getContext: () => ({
        createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: (im: { data: Uint8ClampedArray }) => void (data = im.data),
      }),
      toDataURL: () => data,
    };
  };
  const g = globalThis as { terrainCanvases?: Record<SurfaceMode, Uint8ClampedArray> };
  const draw = prototypeFn<(...a: unknown[]) => void>("drawTerrainOverlay", {
    document: { createElement: canvas },
    heat: prototypeFn("heat"),
    dem: { bounds: () => null },
    applyOverlayMode: () => {},
  });
  // The prototype assigns its canvases to a page global; here that's globalThis.
  draw(
    v.dFine,
    v.slope,
    v.inside,
    {
      label: v.labels!.house,
      shelfLabel: v.labels!.shelf,
      gardenLabel: v.labels!.garden,
      surfaces: v.surfaces,
    },
    v.bestId,
  );
  const images = g.terrainCanvases!;
  delete g.terrainCanvases;
  delete (globalThis as { terrainBounds?: unknown }).terrainBounds;
  return images;
}

describe("surface image (15a) vs the prototype", () => {
  it("heat() is the prototype's, across the whole range", () => {
    const proto = prototypeFn<(v: number, k: string) => number[] | null>("heat");
    for (let v = -10; v <= 110; v += 0.5)
      for (const k of ["house", "garden"] as const) expect(heat(v, k)).toEqual(proto(v, k));
    expect(heat(NaN, "house")).toBeNull();
  });

  it.each(["ferney-creek-52-47A", "macks-mountain-35-3"] as const)(
    "%s: every pixel of every mode equals the prototype's",
    async (slug) => {
      const v = await viewOf(slug);
      const proto = prototypeImages(v);
      for (const mode of SURFACE_MODES) {
        const ours = surfaceImage(v, mode)!;
        expect(ours.width).toBe(v.dFine!.w);
        expect(ours.height).toBe(v.dFine!.h);
        expect(Buffer.from(ours.rgba).equals(Buffer.from(proto[mode]))).toBe(true);
        // Something was drawn: the parcel's cells.
        expect(ours.rgba.some((x) => x > 0)).toBe(true);
      }
    },
    60_000,
  );

  it("places the image by the grid's four UTM corners, to the centimetre", async () => {
    const v = await viewOf("ferney-creek-52-47A");
    const d = v.dFine!;
    const [tl, tr, br, bl] = surfaceCorners(d);
    const want = [
      [d.x0, d.y0],
      [d.x0 + d.w * d.res, d.y0],
      [d.x0 + d.w * d.res, d.y0 - d.h * d.resY],
      [d.x0, d.y0 - d.h * d.resY],
    ];
    [tl, tr, br, bl].forEach(([lon, lat], i) => {
      const [x, y] = fwd(lat, lon);
      expect(Math.abs(x - want[i]![0]!)).toBeLessThan(0.01);
      expect(Math.abs(y - want[i]![1]!)).toBeLessThan(0.01);
    });
  });

  it("is null for a session without surfaces (a run that stopped early)", () => {
    expect(surfaceImage({ parcel: null as never, house: null }, "house")).toBeNull();
  });
});
