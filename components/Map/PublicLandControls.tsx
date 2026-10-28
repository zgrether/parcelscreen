"use client";
/**
 * Map layers › Public land (roadmap step 16, docs/plans/step-16-public-lands.md §6): the toggle, then (while it's on)
 * the key: a swatch for each manager's colour and for easements, then the three ways access is drawn, then the line
 * saying what it is and whose. Remembered per device (ps.publicLand).
 */
import { CATEGORIES, CATEGORY_COLOR, type AccessStyle, type Category } from "@/lib/publicLand/classify";
import { PUBLIC_LAND_WORDS as W } from "@/lib/publicLand/card";
import { setMapLayerPrefs, useMapLayerPrefs } from "./useMapLayerPrefs";

const NEUTRAL = "#5d6f8c";

/** A small square as the map draws the land: filled, hatched, outlined, or an easement's dashed line. */
function Swatch({ color, style }: { color: string; style: AccessStyle | "easement" }) {
  return (
    <svg className="pl-swatch" width="22" height="16" viewBox="0 0 22 16" aria-hidden="true">
      <defs>
        <pattern
          id={`pl-h-${color.slice(1)}`}
          width="5"
          height="5"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="5" stroke={color} strokeWidth="2" />
        </pattern>
      </defs>
      <rect
        x="1.5"
        y="1.5"
        width="19"
        height="13"
        fill={style === "solid" ? color : style === "hatched" ? `url(#pl-h-${color.slice(1)})` : "none"}
        fillOpacity={style === "solid" ? 0.35 : 1}
        stroke={color}
        strokeWidth={style === "easement" ? 2 : 1.5}
        strokeDasharray={style === "outline" ? "3 2" : style === "easement" ? "4 2" : undefined}
      />
    </svg>
  );
}

export function PublicLandControls() {
  const { publicLand } = useMapLayerPrefs();
  return (
    <>
      <button
        className="tc-toggle"
        aria-pressed={publicLand}
        onClick={() => setMapLayerPrefs({ publicLand: !publicLand })}
      >
        {W.toggle}
      </button>
      {publicLand && (
        <div className="lidar-controls public-land-controls">
          <ul className="lidar-bands pl-key" aria-label="Public land, by manager">
            {CATEGORIES.map((c: Category) => (
              <li key={c}>
                <Swatch color={CATEGORY_COLOR[c]} style={c === "easement" ? "easement" : "solid"} />
                {W.legend[c]}
              </li>
            ))}
          </ul>
          <ul className="lidar-bands pl-key" aria-label="Public access">
            {(["solid", "hatched", "outline"] as const).map((s) => (
              <li key={s}>
                <Swatch color={NEUTRAL} style={s} />
                {W.access[s]}
              </li>
            ))}
          </ul>
          <p className="tiny muted lidar-info">{W.info}</p>
        </div>
      )}
    </>
  );
}
