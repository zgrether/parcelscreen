/**
 * The pins and the fan against the prototype's own code (step 15 plan §7): finalizeRanking and drawHorizon run
 * with a stub Leaflet that records each marker or line, its tooltip, and (for pins) the label a click
 * evaluates under.
 */
import * as turf from "@turf/turf";
import { describe, expect, it } from "vitest";
import { compass } from "../format";
import { rcToLL } from "../screen/dem";
import { DEFAULT_USER_CONFIG } from "../screen/config";
import type { ScreenResult } from "../screen/types";
import { FIXTURE_SLUGS, loadFixture } from "@/test/support/fixtures";
import { fromPrototype } from "@/test/support/fromPrototype";
import { prototypeFn } from "@/test/support/prototypeFns";
import { replayRun } from "@/test/support/session";
import { fanRays } from "./fan";
import { evaluatedNote, inertTip, pinSpecs } from "./pins";

interface Drawn {
  ll: unknown;
  html?: string;
  tip?: string;
  evalLabel?: string | null;
  style?: Record<string, unknown>;
}

/** A Leaflet stand-in that records what's added to a layer. */
function fakeLeaflet(out: Drawn[], setFocusLabel: { last: string | null }) {
  const item = (d: Drawn) => {
    const self = {
      bindTooltip: (t: string) => ((d.tip = t), self),
      on: (_: string, fn: () => void) => {
        setFocusLabel.last = null;
        fn();
        d.evalLabel = setFocusLabel.last;
        return self;
      },
      addTo: () => (out.push(d), self),
    };
    return self;
  };
  return {
    marker: (ll: unknown, o: { icon: { html: string } }) => item({ ll, html: o.icon.html, evalLabel: null }),
    divIcon: (o: unknown) => o,
    polyline: (ll: unknown, style: Record<string, unknown>) => item({ ll, style }),
    circleMarker: (ll: unknown, style: Record<string, unknown>) => item({ ll, style }),
  };
}

describe("pins (15b) vs the prototype's finalizeRanking", () => {
  it.each(
    FIXTURE_SLUGS.flatMap((slug) => Object.keys(loadFixture(slug).goldens).map((k) => [slug, k] as const)),
  )("%s %s: the same pins, texts, tooltips and evaluation labels, in the same order", (slug, key) => {
    const R = structuredClone(loadFixture(slug).goldens[key as "run"]!);
    const drawn: Drawn[] = [];
    const focus = { last: null as string | null };
    const finalize = prototypeFn<(R: unknown) => void>("finalizeRanking", {
      L: fakeLeaflet(drawn, focus),
      turf,
      overlays: { hasLayer: () => true },
      pinLayer: { clearLayers: () => {} },
      setFocus: (_R: unknown, _ll: unknown, label: string) => void (focus.last = label),
    });
    finalize(R);
    const ours = pinSpecs(fromPrototype(R) as ScreenResult);
    expect(ours.length).toBe(drawn.length);
    ours.forEach((p, i) => {
      const d = drawn[i]!;
      expect(p.ll).toEqual(d.ll);
      expect(d.html).toContain(`>${p.text}</div>`);
      expect(d.html!.includes(" top")).toBe(p.top);
      expect(p.tip).toBe(d.tip);
      expect(p.evalLabel).toBe(d.evalLabel);
    });
  });

  it("says 'Run again to evaluate here.' without a session; gardens keep their tooltip", () => {
    const pins = pinSpecs(fromPrototype(loadFixture("ferney-creek-52-47A").goldens.run) as ScreenResult);
    for (const p of pins) {
      const t = inertTip(p);
      if (p.evalLabel) expect(t.endsWith("Run again to evaluate here.")).toBe(true);
      else expect(t).toBe(p.tip);
      expect(t).not.toContain("Tap to evaluate");
    }
  });

  it("words the unsaved-evaluation note as the owner asked", () => {
    expect(evaluatedNote("site #2")).toBe(
      "Evaluated at site #2 — not saved. Run again or move the house to keep it.",
    );
  });
});

describe("horizon fan (15b) vs the prototype's drawHorizon", () => {
  it.each(FIXTURE_SLUGS)(
    "%s: the same rays, ends, colours and tooltips",
    async (slug) => {
      const { result, view } = await replayRun(slug);
      const from = result.focus!.ll;
      const drawn: Drawn[] = [];
      const draw = prototypeFn<(...a: unknown[]) => void>("drawHorizon", {
        L: fakeLeaflet(drawn, { last: null }),
        fanLayer: {},
        CFG: { canopyDeg: DEFAULT_USER_CONFIG.canopyDeg },
        dem: { rcToLL },
        compass,
      });
      draw(view.dWide, view.horizon, from, view.decAltByAz);
      // The prototype draws a halo and a ray per direction, then the evaluation ring.
      const rays = drawn.filter((d) => d.tip);
      const ours = fanRays(view, from, DEFAULT_USER_CONFIG.canopyDeg).features;
      expect(ours.length).toBe(rays.length);
      expect(ours.length).toBeGreaterThan(5);
      ours.forEach((f, i) => {
        const d = rays[i]!;
        const [a, b] = d.ll as [number, number][];
        expect(f.geometry.coordinates).toEqual([
          [a![1], a![0]],
          [b![1], b![0]],
        ]);
        expect(f.properties.tip).toBe(d.tip);
        expect(f.properties.blocks).toBe(d.style!.color === "#e0553f");
      });
      // Some rays of each kind on these parcels' Decembers, or the test proves little.
      expect(ours.some((f) => f.properties.blocks)).toBe(true);
      expect(ours.some((f) => !f.properties.blocks)).toBe(true);
    },
    60_000,
  );
});
