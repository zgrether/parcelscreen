"use client";
/**
 * The Analysis group in Info › Layers (step 15 plan §3): what the map draws from the open parcel's screen.
 * The Surface row (House / Garden / Slope / Off, the same setting as the map's cycle button, 15a), and an
 * eye per overlay: pins and the horizon fan (15b); soils, trailheads and the driveway come with 15c. Hidden until the parcel
 * has been screened; after a reload the surface needs a run.
 */
import { useScreenItContext } from "@/components/Results/ScreenItContext";
import { useHasSurface } from "./SurfaceButton";
import { setOverlay, useOverlayPrefs } from "./useOverlayPrefs";
import { setSurfaceMode, SURFACE_CYCLE, useSurfaceMode } from "./useSurfaceMode";

const NAME = { house: "House", garden: "Garden", slope: "Slope", off: "Off" } as const;

export function AnalysisGroup() {
  const s = useScreenItContext();
  const mode = useSurfaceMode();
  const live = useHasSurface();
  const shown = useOverlayPrefs();
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
      <Eye label="Pins" on={shown.pins} flip={() => setOverlay("pins", !shown.pins)} />
      <Eye
        label="Horizon fan"
        on={shown.fan}
        flip={() => setOverlay("fan", !shown.fan)}
        note={s.view ? null : "run again to show"}
      />
    </div>
  );
}

/** A row with a show/hide toggle; its note when there's nothing to draw without a live run. */
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
    <div className="ag-row">
      <span>{label}</span>
      <span className="ag-eye-row">
        <button
          className="ag-eye"
          aria-pressed={on}
          aria-label={`${on ? "Hide" : "Show"} ${label.toLowerCase()}`}
          onClick={flip}
        >
          {on ? "Shown" : "Hidden"}
        </button>
        {note && <span className="ag-note">{note}</span>}
      </span>
    </div>
  );
}
