"use client";
/**
 * The surface's legend in the right-hand column (owner, after 15c), styled like the zoom slider and shown
 * under the surface button while a surface is on:
 *   - Slope: the four bands, gentle (green) at the bottom to steep (red) at the top, their grades at the
 *     boundaries (degrees in the tooltip);
 *   - House / Garden: the score ramp, low at the bottom to high at the top, and swatches for the solid
 *     colours drawn over it (house sites and shelves; garden patches).
 * Every colour is the image's own (lib/render/surface.ts), so the legend can't drift from the map.
 */
import { heat, SLOPE_BANDS, SURFACE_SOLIDS } from "@/lib/render/surface";
import { useHasSurface } from "./SurfaceButton";
import { useSurfaceMode } from "./useSurfaceMode";

type Rgb = readonly [number, number, number, ...number[]];
const rgb = (c: Rgb) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

/** Grade → degrees, for the tooltip: 15% is 8.5°. */
const deg = (g: number) => ((Math.atan(g) * 180) / Math.PI).toFixed(1);
const pct = (g: number) => `${Math.round(g * 100)}%`;

export function SurfaceLegend() {
  const mode = useSurfaceMode();
  if (!useHasSurface() || mode === "off") return null;
  return mode === "slope" ? <SlopeLegend /> : <ScoreLegend kind={mode} />;
}

function SlopeLegend() {
  const bounds = SLOPE_BANDS.slice(0, -1).map((b) => b.upTo);
  const title = `Slope, as grade (rise over run): ${[
    `green up to ${pct(bounds[0]!)} (${deg(bounds[0]!)}°)`,
    `yellow to ${pct(bounds[1]!)} (${deg(bounds[1]!)}°)`,
    `orange to ${pct(bounds[2]!)} (${deg(bounds[2]!)}°)`,
    `red steeper`,
  ].join(" · ")}`;
  return (
    <div className="surface-legend" role="img" aria-label={title} title={title}>
      <span className="sl-title">Slope</span>
      <div className="sl-bar">
        {[...SLOPE_BANDS].reverse().map((b) => (
          <span key={b.upTo} className="sl-band" style={{ background: rgb(b.rgba) }} />
        ))}
        {bounds.map((g, i) => (
          <span key={g} className="sl-tick" style={{ bottom: `${((i + 1) / SLOPE_BANDS.length) * 100}%` }}>
            {pct(g)}
          </span>
        ))}
      </div>
    </div>
  );
}

const SCORE = {
  house: {
    title: "House",
    about: "House suitability, 0–100: low (red) at the bottom to high (green) at the top",
    solids: [
      { label: "site", rgba: SURFACE_SOLIDS.site, about: "house site (the best one darker)" },
      { label: "shelf", rgba: SURFACE_SOLIDS.shelf, about: "shelf" },
    ],
  },
  garden: {
    title: "Garden",
    about: "Garden suitability, 0–100: low at the bottom to high at the top",
    solids: [{ label: "patch", rgba: SURFACE_SOLIDS.gardenPatch, about: "garden patch" }],
  },
} as const;

function ScoreLegend({ kind }: { kind: "house" | "garden" }) {
  const s = SCORE[kind];
  // The image's own ramp, sampled every 10 points (heat), drawn bottom (0) to top (100).
  const stops = Array.from({ length: 11 }, (_, i) => `${rgb(heat(i * 10, kind)!)} ${i * 10}%`).join(", ");
  const title = `${s.about}; ${s.solids.map((x) => x.about).join(", ")} drawn solid over it.`;
  return (
    <div className="surface-legend" role="img" aria-label={title} title={title}>
      <span className="sl-title">{s.title}</span>
      <div className="sl-bar ramp" style={{ background: `linear-gradient(to top, ${stops})` }}>
        <span className="sl-tick" style={{ bottom: "100%" }}>
          high
        </span>
        <span className="sl-tick" style={{ bottom: "0%" }}>
          low
        </span>
      </div>
      {s.solids.map((x) => (
        <span key={x.label} className="sl-solid">
          <span className="sl-swatch" style={{ background: rgb(x.rgba) }} />
          {x.label}
        </span>
      ))}
    </div>
  );
}
