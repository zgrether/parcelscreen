"use client";
/**
 * Map layers › Lidar terrain (roadmap step 14c): the toggle, then (while it's on) Shaded relief or Slope, the opacity,
 * the slope bands when Slope shows, and the line saying what it is and whose. Every target is 44 px on a phone (the
 * toggle rows' style, the Exaggeration control's segments, a native range input).
 */
import { SLOPE_BANDS } from "@/lib/render/surface";
import { LIDAR_INFO, LIDAR_OPACITY, LIDAR_STYLES } from "./lidarStyle";
import { setMapLayerPrefs, useMapLayerPrefs } from "./useMapLayerPrefs";

export const LIDAR_LABEL = "Lidar terrain";

const rgb = (c: readonly number[]) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
const pct = (g: number) => `${Math.round(g * 100)}%`;

/** The slope bands in words with their colours: "up to 15%", "15–25%", "25–40%", "over 40%". */
export function slopeBandLabels(): string[] {
  const edges = SLOPE_BANDS.map((b) => b.upTo);
  return edges.map((e, i) =>
    i === 0
      ? `up to ${pct(e)}`
      : Number.isFinite(e)
        ? `${Math.round(edges[i - 1]! * 100)}–${pct(e)}`
        : `over ${pct(edges[i - 1]!)}`,
  );
}

export function LidarControls() {
  const { lidar } = useMapLayerPrefs();
  const set = (patch: Partial<typeof lidar>) => setMapLayerPrefs({ lidar: { ...lidar, ...patch } });
  return (
    <>
      <button className="tc-toggle" aria-pressed={lidar.on} onClick={() => set({ on: !lidar.on })}>
        {LIDAR_LABEL}
      </button>
      {lidar.on && (
        <div className="lidar-controls">
          <div className="tc-seg" role="radiogroup" aria-label="Lidar terrain style">
            {LIDAR_STYLES.map((s) => (
              <button
                key={s.id}
                role="radio"
                aria-checked={lidar.style === s.id}
                onClick={() => set({ style: s.id })}
              >
                {s.label}
              </button>
            ))}
          </div>
          <label className="lidar-opacity">
            <span>Opacity {Math.round(lidar.opacity * 100)}%</span>
            <input
              type="range"
              min={LIDAR_OPACITY.min * 100}
              max={LIDAR_OPACITY.max * 100}
              step={5}
              value={Math.round(lidar.opacity * 100)}
              onChange={(e) => set({ opacity: Number(e.target.value) / 100 })}
            />
          </label>
          {lidar.style === "slope" && (
            <ul className="lidar-bands" aria-label="Slope, as grade">
              {slopeBandLabels().map((label, i) => (
                <li key={label}>
                  <span
                    className="lidar-swatch"
                    style={{ background: rgb(SLOPE_BANDS[i]!.rgba) }}
                    aria-hidden="true"
                  />
                  {label}
                </li>
              ))}
            </ul>
          )}
          <p className="tiny muted lidar-info">{LIDAR_INFO[lidar.style]}</p>
        </div>
      )}
    </>
  );
}
