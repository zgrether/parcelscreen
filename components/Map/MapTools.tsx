"use client";
/**
 * The map's tools (proto L250–265, L522–560): basemap, dim, parcel lines and light pollution in a "Map" menu
 * that closes when the map is tapped (a stack on desktop until 13e-4 docked the Info panel on the right), and
 * "My location" as the usual GPS button under the zoom buttons (owner, 13e-5 review).
 * Basemap, dim and parcel lines persist; the light-pollution overlay starts off each visit, as before.
 */
import { GeolocateControl } from "maplibre-gl";
import { useEffect, useState } from "react";
import { getPref, setPref } from "@/lib/client/prefs";
import { useMap } from "./MapView";
import { BASEMAPS, basemapLayerIds, isBasemapId, LAYER, type BasemapId } from "./style";
import { useParcelLines } from "./useParcelLines";

type Hint = (text: string | ((prev: string) => string)) => void;

const btn =
  "rounded bg-ink px-2.5 py-1 text-[13px] font-medium text-paper shadow-[0_1px_3px_rgba(0,0,0,.25)] text-left";

export function MapTools({ parcelServices, hint }: { parcelServices: readonly string[]; hint: Hint }) {
  const map = useMap();
  const [base, setBase] = useState<BasemapId>(() => {
    const b = getPref("ps.base");
    return isBasemapId(b) ? b : "state";
  });
  const [dim, setDim] = useState(() => getPref("ps.dim"));
  const [lines, setLines] = useState(() => getPref("ps.lines"));
  const [lp, setLp] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!map) return;
    for (const b of BASEMAPS)
      for (const id of basemapLayerIds(b.id))
        map.setLayoutProperty(id, "visibility", b.id === base ? "visible" : "none");
    setPref("ps.base", base);
  }, [map, base]);

  useEffect(() => {
    if (!map) return;
    map.setLayoutProperty(LAYER.scrim, "visibility", dim ? "visible" : "none");
    setPref("ps.dim", dim);
  }, [map, dim]);

  useEffect(() => {
    map?.setLayoutProperty(LAYER.lightPollution, "visibility", lp ? "visible" : "none");
  }, [map, lp]);

  useEffect(() => setPref("ps.lines", lines), [lines]);
  useParcelLines(map, lines, parcelServices, hint);

  useEffect(() => {
    if (!map) return;
    const close = () => setMenuOpen(false);
    map.on("click", close);
    return () => {
      map.off("click", close);
    };
  }, [map]);

  // My location: MapLibre's GPS button, which shows where you are and goes there (no closer than zoom 15,
  // as the prototype's button did).
  useEffect(() => {
    if (!map) return;
    const gps = new GeolocateControl({ fitBoundsOptions: { maxZoom: 15 } });
    const failed = () => {
      hint("Couldn't get your location");
      setTimeout(() => hint((h) => (h === "Couldn't get your location" ? "" : h)), 2500);
    };
    gps.on("error", failed);
    map.addControl(gps, "top-left");
    return () => {
      gps.off("error", failed);
      map.removeControl(gps);
    };
  }, [map, hint]);

  const tools = (
    <>
      <select
        aria-label="Basemap"
        className="border-rule w-auto rounded border bg-white px-2 py-1 text-[13px] shadow-[0_1px_3px_rgba(0,0,0,.25)]"
        value={base}
        onChange={(e) => setBase(e.target.value as BasemapId)}
      >
        {BASEMAPS.map((b) => (
          <option key={b.id} value={b.id}>
            {b.label}
          </option>
        ))}
      </select>
      <button className={btn} aria-pressed={dim} onClick={() => setDim(!dim)}>
        Dim map: {dim ? "on" : "off"}
      </button>
      <button className={btn} aria-pressed={lines} onClick={() => setLines(!lines)}>
        Parcel lines: {lines ? "on" : "off"}
      </button>
      <button className={btn} aria-pressed={lp} onClick={() => setLp(!lp)}>
        Light pollution: {lp ? "on" : "off"}
      </button>
    </>
  );

  return (
    <div className="absolute top-2.5 right-2.5 z-20 flex flex-col items-end gap-1.5">
      {/* One button that opens the tools as a menu, at every width (13e-4: the Info panel docks on the right). */}
      <div className="relative">
        <button className={btn} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
          Map {menuOpen ? "▴" : "▾"}
        </button>
        {menuOpen && (
          <div className="bg-paper border-rule absolute top-10 right-0 flex min-w-[210px] flex-col gap-1.5 rounded-md border p-2 shadow-[0_4px_16px_rgba(0,0,0,.25)] [&>*]:w-full">
            {tools}
          </div>
        )}
      </div>
    </div>
  );
}

export function Hint({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="map-hint absolute left-2.5 z-10 max-w-[70%] rounded bg-[rgba(28,38,32,.86)] px-2.5 py-1.5 text-[13px] text-white">
      {text}
    </div>
  );
}
