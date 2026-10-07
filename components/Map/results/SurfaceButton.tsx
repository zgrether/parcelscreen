"use client";
/**
 * The one-tap surface cycle in the right-hand column (proto #btn-omode, L264, L540; owner, 15 plan Q2): House →
 * Garden → Slope → Off. Shown only while a live result has a surface to draw. Its label is the prototype's
 * ("Overlay: house suitability").
 */
import { SURFACE_LABEL } from "@/lib/render/surface";
import { useScreenItContext } from "@/components/Results/ScreenItContext";
import { nextSurface, setSurfaceMode, useSurfaceMode, type SurfaceChoice } from "./useSurfaceMode";

const SHORT: Record<SurfaceChoice, string> = { house: "House", garden: "Garden", slope: "Slope", off: "Off" };

/** Whether the shown screen has a live surface to draw (and so the controls do something). */
export function useHasSurface(): boolean {
  const view = useScreenItContext()?.view;
  return !!(view?.dFine && view.surfaces && view.labels);
}

export function SurfaceButton() {
  const mode = useSurfaceMode();
  if (!useHasSurface()) return null;
  const label = `Overlay: ${SURFACE_LABEL[mode]}`;
  return (
    <button
      className="map-ctl-btn surface-btn"
      data-mode={mode}
      aria-label={label}
      title={`${label} — tap to cycle`}
      onClick={() => setSurfaceMode(nextSurface(mode))}
    >
      <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true">
        <path d="M9 1 17 5 9 9 1 5z" fill="currentColor" opacity={mode === "off" ? 0.35 : 1} />
        <path d="M1 9 9 13 17 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      <span className="surface-caption">{SHORT[mode]}</span>
    </button>
  );
}
