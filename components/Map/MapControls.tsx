"use client";
/**
 * The map's right-hand column (step 13f plan §2–3): the GPS button and a vertical zoom slider, under the Map
 * menu; above them, while the map is rotated or tilted, a compass that resets it to north and flat (13g), and
 * while a live result has one, the surface cycle button (15a). The slider replaces MapLibre's + / − buttons; its track is amber where parcel lines show. While the
 * Info panel is docked on the right, the column moves left of it (the map itself doesn't move). The track is
 * light amber from zoom 14 (parcel lines, but dense places wait) and amber from 15 (all of them).
 */
import { GeolocateControl, type Map as MlMap } from "maplibre-gl";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useExplore } from "@/components/Explore/useExploreController";
import { useMap } from "./MapView";
import { SurfaceLegend } from "./results/SurfaceLegend";
import { SurfaceButton } from "./results/SurfaceButton";
import { noteViewReset } from "./useFlatForTools";
import { DENSE_BELOW_ZOOM, LINES_MIN_ZOOM } from "@/lib/geo/parcelTiles";

type Hint = (text: string | ((prev: string) => string)) => void;

/** The slider's range (owner, 13f): the band where the map is useful for finding parcels. */
const MIN_ZOOM = 5;
const MAX_ZOOM = 20;
const NO_LOCATION = "Couldn't get your location";

export function MapControls({ hint }: { hint: Hint }) {
  const map = useMap();
  const { panelInset } = useExplore();
  return (
    // 24 px in from the edge, clear of the phone's back-swipe zone; beside the Info panel when it's docked.
    <div className="map-col" style={{ right: panelInset ? panelInset + 10 : 24 }}>
      {map && <Compass map={map} />}
      <SurfaceButton />
      <SurfaceLegend />
      {map && <LocateButton map={map} hint={hint} />}
      {map && <ZoomSlider map={map} />}
    </div>
  );
}

/**
 * The compass (13g): its needle turns with the bearing and leans with the pitch. Tapping it eases to north
 * and flat. Hidden while the map is already north-up and flat, like MapLibre's own.
 */
function Compass({ map }: { map: MlMap }) {
  const [view, setView] = useState(() => ({ bearing: map.getBearing(), pitch: map.getPitch() }));
  useEffect(() => {
    let frame = 0;
    const follow = () => {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          setView({ bearing: map.getBearing(), pitch: map.getPitch() });
        });
    };
    map.on("rotate", follow);
    map.on("pitch", follow);
    return () => {
      map.off("rotate", follow);
      map.off("pitch", follow);
      cancelAnimationFrame(frame);
    };
  }, [map]);
  if (Math.abs(view.bearing) <= 0.5 && view.pitch <= 0.5) return null;
  return (
    <button
      className="map-ctl-btn compass"
      aria-label="Reset to north and flat"
      title="Reset to north and flat"
      onClick={() => {
        noteViewReset(map);
        map.easeTo({ bearing: 0, pitch: 0, duration: 300 });
      }}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 22 22"
        aria-hidden="true"
        style={{ transform: `rotateX(${view.pitch * 0.6}deg) rotate(${-view.bearing}deg)` }}
      >
        <path d="M11 2 15 11H7z" fill="#e0553f" />
        <path d="M11 20 7 11h8z" fill="currentColor" />
      </svg>
    </button>
  );
}

/**
 * My location: MapLibre's GeolocateControl still finds the position and draws the dot (its own button is
 * hidden in globals.css); this button, styled like the toolbar's, triggers it. It goes no closer than zoom
 * 15, as the prototype's button did.
 */
function LocateButton({ map, hint }: { map: MlMap; hint: Hint }) {
  const gps = useRef<GeolocateControl | null>(null);
  useEffect(() => {
    const control = new GeolocateControl({ fitBoundsOptions: { maxZoom: 15 } });
    const failed = () => {
      hint(NO_LOCATION);
      setTimeout(() => hint((h) => (h === NO_LOCATION ? "" : h)), 2500);
    };
    control.on("error", failed);
    map.addControl(control, "top-left");
    gps.current = control;
    return () => {
      control.off("error", failed);
      map.removeControl(control);
      gps.current = null;
    };
  }, [map, hint]);
  return (
    <button
      className="map-ctl-btn"
      aria-label="Show my location"
      title="My location"
      onClick={() => gps.current?.trigger()}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="9" cy="9" r="2" fill="currentColor" />
        <path d="M9 1v3M9 14v3M1 9h3M14 9h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </button>
  );
}

const clamp = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));

/**
 * A vertical range input: the thumb follows the map's zoom however it changed (pinch, scroll, a fit), and
 * dragging the thumb or tapping the track zooms there, around the view's centre. Arrow keys step a whole
 * zoom level.
 */
function ZoomSlider({ map }: { map: MlMap }) {
  const [zoom, setZoom] = useState(() => map.getZoom());
  useEffect(() => {
    let frame = 0;
    const follow = () => {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          setZoom(map.getZoom());
        });
    };
    map.on("zoom", follow);
    return () => {
      map.off("zoom", follow);
      cancelAnimationFrame(frame);
    };
  }, [map]);

  const zoomTo = (z: number) => map.jumpTo({ zoom: clamp(z) });
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const step = { ArrowUp: 1, ArrowRight: 1, PageUp: 1, ArrowDown: -1, ArrowLeft: -1, PageDown: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    // To the next whole level up or down, from the map's own zoom (the slider's state lags a frame).
    const now = map.getZoom();
    zoomTo(step > 0 ? Math.floor(now) + 1 : Math.ceil(now) - 1);
  };
  // Where the track's shading changes, from the bottom: lines from 14 (dense tiles wait), all lines from 15.
  const at = (z: number) => `${((z - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100}%`;
  return (
    <div className="zoom-box" title={`Zoom ${zoom.toFixed(1)}`}>
      <input
        type="range"
        className="zoom-slider"
        min={MIN_ZOOM}
        max={MAX_ZOOM}
        step={0.1}
        value={clamp(zoom)}
        aria-label="Zoom"
        aria-orientation="vertical"
        aria-valuetext={`Zoom ${zoom.toFixed(1)}`}
        style={{ "--b14": at(LINES_MIN_ZOOM), "--b15": at(DENSE_BELOW_ZOOM) } as CSSProperties}
        onChange={(e) => zoomTo(Number(e.target.value))}
        onKeyDown={onKey}
      />
    </div>
  );
}
