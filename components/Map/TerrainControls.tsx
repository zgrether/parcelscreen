"use client";
/**
 * The terrain preview's controls (step 13g plan §4): 3D terrain with its exaggeration, hillshade and contours,
 * under a label that says what they are. Shown in Info › Layers (dark) and in the Map ▾ menu (light); both
 * edit the same settings.
 */
import { EXAGGERATIONS } from "./terrainStyle";
import { setTerrainPrefs, useTerrainPrefs } from "./useTerrainPrefs";

export const TERRAIN_GROUP_LABEL = "Terrain preview ≈10 m — screen uses 3 m lidar";

export function TerrainControls({ variant }: { variant: "info" | "menu" }) {
  const t = useTerrainPrefs();
  const toggle = (label: string, on: boolean, flip: () => void) => (
    <button className="tc-toggle" aria-pressed={on} onClick={flip}>
      {label}
    </button>
  );
  return (
    <div className={`terrain-controls ${variant}`} role="group" aria-label={TERRAIN_GROUP_LABEL}>
      <div className="tc-label">{TERRAIN_GROUP_LABEL}</div>
      {toggle("3D terrain", t.terrain, () => setTerrainPrefs({ terrain: !t.terrain }))}
      {t.terrain && (
        <div className="tc-seg" role="radiogroup" aria-label="Exaggeration">
          {EXAGGERATIONS.map((x) => (
            <button
              key={x}
              role="radio"
              aria-checked={t.exaggeration === x}
              onClick={() => setTerrainPrefs({ exaggeration: x })}
            >
              {x}×
            </button>
          ))}
        </div>
      )}
      {toggle("Hillshade", t.hillshade, () => setTerrainPrefs({ hillshade: !t.hillshade }))}
      {toggle("Contours", t.contours, () => setTerrainPrefs({ contours: !t.contours }))}
    </div>
  );
}
