"use client";
/**
 * The Analysis group in Info › Layers (step 15 plan §3): what the map draws from the open parcel's screen.
 * 15a has the Surface row (House / Garden / Slope / Off, the same setting as the map's cycle button); the
 * pins, fan, soils, trailheads and driveway rows come with their overlays in 15b–c. Hidden until the parcel
 * has been screened; after a reload the surface needs a run.
 */
import { useScreenItContext } from "@/components/Results/ScreenItContext";
import { useHasSurface } from "./SurfaceButton";
import { setSurfaceMode, SURFACE_CYCLE, useSurfaceMode } from "./useSurfaceMode";

const NAME = { house: "House", garden: "Garden", slope: "Slope", off: "Off" } as const;

export function AnalysisGroup() {
  const s = useScreenItContext();
  const mode = useSurfaceMode();
  const live = useHasSurface();
  if (!s?.shown || s.stale) return null;
  return (
    <div className="analysis-group" role="group" aria-label="Analysis">
      <div className="ag-label">Analysis</div>
      <div className="ag-row">
        <span>Surface</span>
        {live ? (
          <div className="tc-seg ag-seg" role="radiogroup" aria-label="Surface">
            {SURFACE_CYCLE.map((m) => (
              <button key={m} role="radio" aria-checked={mode === m} onClick={() => setSurfaceMode(m)}>
                {NAME[m]}
              </button>
            ))}
          </div>
        ) : (
          <span className="ag-note">run again to show</span>
        )}
      </div>
    </div>
  );
}
