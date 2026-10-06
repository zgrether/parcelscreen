/** Terrain (proto L1461–1472): elevation, slope, the house sites found, and the suitability legend. */
import { TERRAIN_LEGEND, terrainView } from "@/lib/report/terrain";
import { Facts, Note } from "./shared";
import type { BlockProps } from "./types";

export function Terrain({ result, variant }: BlockProps) {
  const v = terrainView(result);
  if (!v) return null;
  return (
    <>
      <Facts rows={v.rows} />
      <div className="legend">
        {TERRAIN_LEGEND.map((l) => (
          <span key={l.label}>
            <i style={{ background: l.swatch }} />
            {l.label}
          </span>
        ))}
      </div>
      <Note parts={v.diag} variant={variant} />
    </>
  );
}
