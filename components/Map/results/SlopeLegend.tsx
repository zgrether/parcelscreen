"use client";
/**
 * The slope map's legend (owner, after 15c): a vertical bar in the right-hand column, styled like the zoom
 * slider, with the slope bands bottom (gentle) to top (steep) and their grades at the boundaries. Shown while
 * the Slope surface is on. The bands are the image's own (SLOPE_BANDS).
 */
import { SLOPE_BANDS } from "@/lib/render/surface";
import { useHasSurface } from "./SurfaceButton";
import { useSurfaceMode } from "./useSurfaceMode";

/** Grade → degrees, for the tooltip: 15% is 8.5°. */
const deg = (g: number) => ((Math.atan(g) * 180) / Math.PI).toFixed(1);
const pct = (g: number) => `${Math.round(g * 100)}%`;

export function SlopeLegend() {
  const mode = useSurfaceMode();
  if (!useHasSurface() || mode !== "slope") return null;
  const bounds = SLOPE_BANDS.slice(0, -1).map((b) => b.upTo);
  const title = `Slope, as grade (rise over run): ${[
    `green up to ${pct(bounds[0]!)} (${deg(bounds[0]!)}°)`,
    `yellow to ${pct(bounds[1]!)} (${deg(bounds[1]!)}°)`,
    `orange to ${pct(bounds[2]!)} (${deg(bounds[2]!)}°)`,
    `red steeper`,
  ].join(" · ")}`;
  return (
    <div className="slope-legend" role="img" aria-label={title} title={title}>
      <span className="sl-title">Slope</span>
      <div className="sl-bar">
        {[...SLOPE_BANDS].reverse().map((b) => (
          <span key={b.upTo} style={{ background: `rgb(${b.rgba[0]}, ${b.rgba[1]}, ${b.rgba[2]})` }} />
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
