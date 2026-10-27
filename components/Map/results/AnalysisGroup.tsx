"use client";
/**
 * Results on the map, in Map layers (step 15 plan §3; step 8b, it was Info › Layers › Analysis): what the map draws from
 * the open parcel's screen.
 * The Shading row (House / Garden / Slope / Off, the same setting as the map's cycle button, 15a; "Surface" until polish
 * 2), and a toggle per overlay: pins and the skyline rays (15b); soil units, trailheads and the driveway (15c). Hidden
 * until the parcel has been screened; after a reload the shading needs a run.
 */
import { useScreenItContext } from "@/components/Results/ScreenItContext";
import { useHasSurface } from "./SurfaceButton";
import { setOverlay, useOverlayPrefs } from "./useOverlayPrefs";
import { setSurfaceMode, SURFACE_CYCLE, useSurfaceMode } from "./useSurfaceMode";
import { KEY_WORDS } from "@/lib/render/keyLine";

const NAME = { house: "House", garden: "Garden", slope: "Slope", off: "Off" } as const;

export function AnalysisGroup() {
  const s = useScreenItContext();
  const mode = useSurfaceMode();
  const live = useHasSurface();
  const shown = useOverlayPrefs();
  if (!s?.shown || s.stale) return null;
  return (
    <div className="analysis-group" role="group" aria-label="Results on the map">
      <div className="ag-label">Results on the map</div>
      <div className="ag-row">
        <span>Shading</span>
        {live ? (
          <div className="tc-seg ag-seg" role="radiogroup" aria-label="Shading">
            {SURFACE_CYCLE.map((m) => (
              <button key={m} role="radio" aria-checked={mode === m} onClick={() => setSurfaceMode(m)}>
                {NAME[m]}
              </button>
            ))}
          </div>
        ) : (
          <span className="ag-note">grade again to show</span>
        )}
      </div>
      <div className="ag-toggles">
        <Eye label="Pins" on={shown.pins} flip={() => setOverlay("pins", !shown.pins)} />
        <Eye
          label={KEY_WORDS.fan}
          on={shown.fan}
          flip={() => setOverlay("fan", !shown.fan)}
          note={s.view ? null : "grade again to show"}
        />
        <Eye label="Soil units" on={shown.soils} flip={() => setOverlay("soils", !shown.soils)} />
        <Eye
          label="Trailheads"
          on={shown.trailheads}
          flip={() => setOverlay("trailheads", !shown.trailheads)}
        />
        <Eye label="Driveway" on={shown.driveway} flip={() => setOverlay("driveway", !shown.driveway)} />
      </div>
    </div>
  );
}

/**
 * A show/hide toggle, as On the map's (polish 2, M1: the ✓ when it's on); its note when there's nothing to draw
 * without a live run.
 */
function Eye({
  label,
  on,
  flip,
  note = null,
}: {
  label: string;
  on: boolean;
  flip(): void;
  note?: string | null;
}) {
  return (
    <div className="ag-toggle-row">
      <button className="tc-toggle" aria-pressed={on} onClick={flip}>
        {label}
      </button>
      {note && <span className="ag-note">{note}</span>}
    </div>
  );
}
