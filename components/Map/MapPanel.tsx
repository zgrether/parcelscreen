"use client";
/**
 * The map panel (step 17e; plan phase-0-17e-switching.md §2), opened from the map button at the top of the
 * right column. It replaced the "Map ▾" menu, whose native basemap dropdown let a pick click through to the
 * toggle beneath it. A slide-over: the basemaps as radio rows, the map layers, the results on the map (step 8b: the Info
 * panel's Analysis, merged here with the rest of how the map looks), what the pins and lines mean (polish #18),
 * then the terrain preview. Esc or × closes it.
 */
import { mapShowing } from "@/lib/client/mapShowing";
import { useEffect, useRef } from "react";
import { useExplore } from "@/components/Explore/useExploreController";
import { AnalysisGroup } from "./results/AnalysisGroup";
import { RoadsToggle } from "./RoadsToggle";
import { MapKey } from "./MapKey";
import { BASEMAPS } from "./style";
import { BASEMAPS_NOT_KEPT } from "./offlineLayers";
import { OFFLINE_WORDS } from "@/lib/offline/words";
import { TerrainControls } from "./TerrainControls";
import { LidarControls } from "./LidarControls";
import { PlacesControls } from "./PlacesControls";
import { PublicLandControls } from "./PublicLandControls";
import { MvumControls } from "./MvumControls";
import { setMapLayerPrefs, useMapLayerPrefs } from "./useMapLayerPrefs";
import { AREA_WORDS } from "@/lib/areas/words";
import { POWER_MAP } from "@/lib/uses/words";

/** Step 8b: the one show/hide for the open parcel's lines, marks and house site. */
export const MARKS_LABEL = "Your lines and marks";

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
      if (e.key !== "Escape" || e.defaultPrevented || !mapShowing()) return;
      if (document.querySelector(".menu-panel, .ground-layer, dialog[open]")) return;
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
        <h2 className="mp-title">Map layers</h2>
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
              <span className="mp-radio-text">
                {b.label}
                {/* Step 14e: Esri's terms don't allow keeping its tiles. */}
                {BASEMAPS_NOT_KEPT.has(b.id) && (
                  <span className="tiny muted mp-not-kept">{OFFLINE_WORDS.notKept}</span>
                )}
                {b.hint && <span className="mp-hint">{b.hint}</span>}
              </span>
            </button>
          ))}
        </div>
        <div className="terrain-controls info" role="group" aria-label="On the map">
          <div className="tc-label">On the map</div>
          {toggle("Dim map", p.dim, () => setMapLayerPrefs({ dim: !p.dim }))}
          {toggle("Parcel lines", p.lines, () => setMapLayerPrefs({ lines: !p.lines }))}
          <RoadsToggle variant="row" />
          {toggle("Light pollution", p.lightPollution, () =>
            setMapLayerPrefs({ lightPollution: !p.lightPollution }),
          )}
          {toggle(MARKS_LABEL, p.marks, () => setMapLayerPrefs({ marks: !p.marks }))}
          {toggle(AREA_WORDS.outlines, p.areas, () => setMapLayerPrefs({ areas: !p.areas }))}
          {p.areas && <p className="tiny muted areas-legend">{AREA_WORDS.legend}</p>}
          {/* Step 14: the power lines near the graded parcel, from its result. */}
          {toggle(POWER_MAP.toggle, p.power, () => setMapLayerPrefs({ power: !p.power }))}
          {/* Step 14c: USGS 3DEP lidar, as shaded relief or slope. */}
          <LidarControls />
          {/* Step 14d: the baked places and the lists a grade times, by kind. */}
          <PlacesControls />
          {/* Step 16: PAD-US's public land, by manager and access. */}
          <PublicLandControls />
          {/* Step 16: the Forest Service's motor-vehicle routes. */}
          <MvumControls />
        </div>
        <AnalysisGroup />
        <MapKey />
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
