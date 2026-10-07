"use client";
/**
 * The map's tools (proto L250–265, L522–560): basemap, dim, parcel lines and light pollution in a "Map" menu
 * that closes when the map is tapped (a stack on desktop until 13e-4 docked the Info panel on the right). The
 * layers are toggle buttons (13f): filled when on, outlined when off. My location and zoom are in the
 * right-hand column (MapControls).
 * Basemap, dim and parcel lines persist; the light-pollution overlay starts off each visit, as before. The
 * terrain preview's controls (13g) are here too, so they work with no parcel open (and in Info › Layers).
 */
import { useEffect, useState } from "react";
import { getPref, setPref } from "@/lib/client/prefs";
import { useMap } from "./MapView";
import { BASEMAPS, basemapLayerIds, isBasemapId, LAYER, type BasemapId } from "./style";
import { TerrainControls } from "./TerrainControls";
import { useParcelLines } from "./useParcelLines";

type Hint = (text: string | ((prev: string) => string)) => void;

const btn =
  "rounded bg-ink px-2.5 py-1 text-[13px] font-medium text-paper shadow-[0_1px_3px_rgba(0,0,0,.25)] text-left";
/** A layer toggle: filled when on, outlined when off (aria-pressed carries the state; no "on/off" text). */
const toggle = (on: boolean) =>
  `rounded border px-2.5 py-1 text-[13px] font-medium text-left ${
    on ? "border-ink bg-ink text-paper" : "border-rule bg-white text-ink"
  }`;

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
      <button className={toggle(dim)} aria-pressed={dim} onClick={() => setDim(!dim)}>
        Dim map
      </button>
      <button className={toggle(lines)} aria-pressed={lines} onClick={() => setLines(!lines)}>
        Parcel lines
      </button>
      <button className={toggle(lp)} aria-pressed={lp} onClick={() => setLp(!lp)}>
        Light pollution
      </button>
      <TerrainControls variant="menu" />
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
