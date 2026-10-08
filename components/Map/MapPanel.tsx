"use client";
/**
 * The map panel (step 17e; plan phase-0-17e-switching.md §2), opened from the map button at the top of the
 * right column. It replaced the "Map ▾" menu, whose native basemap dropdown let a pick click through to the
 * toggle beneath it. A slide-over like Info (one panel at a time): the basemaps as radio rows, the map layers,
 * then the terrain preview. Esc or × closes it.
 */
import { useEffect, useRef } from "react";
import { useExplore } from "@/components/Explore/useExploreController";
import { RoadsToggle } from "./RoadsToggle";
import { BASEMAPS } from "./style";
import { TerrainControls } from "./TerrainControls";
import { setMapLayerPrefs, useMapLayerPrefs } from "./useMapLayerPrefs";

export function MapPanel() {
  const ctl = useExplore();
  const open = ctl.state.mapPanel;
  const close = useRef(() => ctl.setMapPanel(false));
  useEffect(() => {
    close.current = () => ctl.setMapPanel(false);
  });
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector(".menu-layer, .ground-layer, dialog[open]")) return;
      e.preventDefault();
      close.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  if (!open) return null;
  return <Panel onClose={() => ctl.setMapPanel(false)} />;
}

function Panel({ onClose }: { onClose: () => void }) {
  const p = useMapLayerPrefs();
  const toggle = (label: string, on: boolean, flip: () => void) => (
    <button className="tc-toggle" aria-pressed={on} onClick={flip}>
      {label}
    </button>
  );
  return (
    <section className="info-panel map-panel" aria-label="Map layers">
      <header className="ip-head">
        <h2 className="mp-title">Map</h2>
        <button className="ip-x" aria-label="Close the map panel" onClick={onClose}>
          ×
        </button>
      </header>
      <div className="mp-body">
        <div className="mp-group" role="radiogroup" aria-label="Basemap">
          <div className="tc-label">Basemap</div>
          {BASEMAPS.map((b) => (
            <button
              key={b.id}
              className="mp-radio"
              role="radio"
              aria-checked={p.base === b.id}
              onClick={() => setMapLayerPrefs({ base: b.id })}
            >
              <span className="mp-dot" aria-hidden="true" />
              {b.label}
            </button>
          ))}
        </div>
        <div className="terrain-controls info" role="group" aria-label="Map layers">
          <div className="tc-label">Map layers</div>
          {toggle("Dim map", p.dim, () => setMapLayerPrefs({ dim: !p.dim }))}
          {toggle("Parcel lines", p.lines, () => setMapLayerPrefs({ lines: !p.lines }))}
          <RoadsToggle variant="row" />
          {toggle("Light pollution", p.lightPollution, () =>
            setMapLayerPrefs({ lightPollution: !p.lightPollution }),
          )}
        </div>
        <TerrainControls variant="info" />
      </div>
    </section>
  );
}

/** The right column's map button (17e): a folded map, distinct from the surface button's stacked layers. */
export function MapPanelButton() {
  const ctl = useExplore();
  const open = ctl.state.mapPanel;
  return (
    <button
      className="map-ctl-btn"
      aria-label="Map layers"
      aria-expanded={open}
      title="Basemap and map layers"
      onClick={() => ctl.setMapPanel(!open)}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <path
          d="M2.5 5 7 3l6 2 4.5-2v12L13 17l-6-2-4.5 2z M7 3v12 M13 5v12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
