"use client";
/**
 * The map's key line (UX part 2 PR 3b2; the audit's P-2): under the map while a graded parcel is open, naming what it
 * draws, each beside a small copy of how it looks ("1 Best homesite · The app's driveway · Skyline rays"; polish 2 adds Stand here and the driveway's other lines), then "All map
 * marks", which opens Map layers at the full key (MapKey) with its Every pin toggle. Hidden while a tool is open, and on
 * a phone with the sheet raised, as the map's other notes are (B-7).
 *
 * Map room (plan §2): it folds to a small "Key" chip. A tap opens it as before, with a Hide; it folds again by itself when
 * the person moves the map (a camera move with an `originalEvent`: the app's own moves don't count) or starts a tool.
 * Each parcel opens with it folded; nothing is remembered. On a phone the shading's legend folds into it (under the
 * overlays, as a short horizontal bar); a desktop keeps the legend in the right-hand column.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useExplore } from "@/components/Explore/useExploreController";
import { useOpenGround } from "@/components/Ground/GroundContext";
import { useScreenItContext } from "@/components/Results/ScreenItContext";
import {
  ALL_MARKS,
  KEY_WORDS,
  keyEntries,
  keyOverlays,
  OVERLAY_WORDS,
  type KeyEntry,
  type OverlayKey,
} from "@/lib/render/keyLine";
import { ROUTE_COLOR } from "@/lib/mvum/card";
import { requestKeyOpen } from "./MapKey";
import { AREA_COLOR } from "./AreaOutlines";
import { useMapLayerPrefs } from "./useMapLayerPrefs";
import { BOULDER_COLOR } from "./results/BouldersLayer";
import { POWER_COLOR } from "./results/PowerLayer";
import { WATER_COLOR } from "./results/WaterLayer";
import { useOverlayPrefs } from "./results/useOverlayPrefs";
import { SurfaceLegend } from "./results/SurfaceLegend";
import { useMap } from "./MapView";
import { fullMap, HIDE_CONTROLS } from "@/components/Explore/fullMap";

const SWATCH: Record<KeyEntry, React.ReactNode> = {
  best: (
    <span className="sitepin top mk-pin" aria-hidden="true">
      1
    </span>
  ),
  standHere: (
    <span className="mkl-stand" aria-hidden="true">
      Stand here
    </span>
  ),
  driveway: <span className="mkl-line route" aria-hidden="true" />,
  yourRoute: <span className="mkl-line route" aria-hidden="true" />,
  second: <span className="mkl-line second" aria-hidden="true" />,
  over: <span className="mkl-line over" aria-hidden="true" />,
  direct: <span className="mkl-line direct" aria-hidden="true" />,
  fan: <span className="mkl-line fan" aria-hidden="true" />,
  allPins: (
    <span className="sitepin shelf mk-pin" aria-hidden="true">
      S
    </span>
  ),
};

/** Each overlay's swatch: a short line or a small fill in its map colour (a neutral chip where it has many colours). */
const chip = (style: React.CSSProperties, cls = "mkl-chip") => (
  <span className={cls} style={style} aria-hidden="true" />
);
const OVERLAY_SWATCH: Record<OverlayKey, React.ReactNode> = {
  soils: chip({ borderTopColor: "#8a5ea8" }, "mkl-line dashed"),
  trailheads: chip({ background: "#7a5a3a", borderRadius: "50%" }),
  power: chip({ background: POWER_COLOR }, "mkl-line solid"),
  boulders: chip({ background: BOULDER_COLOR, opacity: 0.6 }),
  water: chip({ background: WATER_COLOR }, "mkl-line solid"),
  lidar: chip({ background: "linear-gradient(135deg, #ddd, #777)" }),
  places: chip({ background: "#fff", border: "2px solid #555", borderRadius: "50%" }),
  publicLand: chip({ background: "#5a9a4a", opacity: 0.6 }),
  mvum: chip({ background: ROUTE_COLOR.all }, "mkl-line solid"),
  areas: chip({ borderColor: AREA_COLOR }, "mkl-chip outline"),
};

/** The folded key's chip, and the open key's control that folds it (map-room plan §8). */
const KEY_CHIP = "Key";
const HIDE = "Hide";

/** The driveway's lesser lines: named on a desktop; a phone's line keeps to the main marks (All map marks has these). */
const MINOR: ReadonlySet<KeyEntry> = new Set(["second", "direct"]);

export function MapKeyLine() {
  const s = useScreenItContext();
  const ctl = useExplore();
  const on = useOverlayPrefs();
  const layers = useMapLayerPrefs();
  const box = useRef<HTMLDivElement>(null);
  // Its height, so a phone's shading legend sits above it (CSS: --kl-h on the explorer; owner, 2026-11-05).
  useLayoutEffect(() => {
    const el = box.current;
    const root = el?.closest<HTMLElement>(".explore");
    if (!el || !root) return;
    const set = () => root.style.setProperty("--kl-h", `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.setProperty("--kl-h", "0px");
    };
  });
  const ground = useOpenGround();
  const tool = ctl.state.mode !== null || ctl.state.split !== null;
  // Open for this parcel only: another parcel opens with it folded.
  const parcel = ctl.state.store.open?.key ?? null;
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [wasTool, setWasTool] = useState(tool);
  if (tool !== wasTool) {
    setWasTool(tool);
    if (tool) setOpenFor(null);
  }
  const open = parcel !== null && openFor === parcel;
  // The person's own camera moves fold it (pan, zoom, rotate, tilt); the app's flights don't.
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const fold = (e: { originalEvent?: unknown }) => {
      if (e.originalEvent) setOpenFor(null);
    };
    // A tap on the map folds it too (Zach, #427: such a tap only closes it; the map's tap checks for an open Key).
    const close = () => setOpenFor(null);
    map.on("movestart", fold);
    map.on("click", close);
    return () => {
      map.off("movestart", fold);
      map.off("click", close);
    };
  }, [map]);
  const r = s && !s.stale && !tool ? s.display : null;
  if (!s || !r) return null;
  if (!open)
    return (
      <div ref={box} className="map-key-line folded">
        <button
          className="mkl-key"
          aria-expanded={false}
          aria-label="Show the map's key"
          onClick={() => setOpenFor(parcel)}
        >
          {KEY_CHIP}
        </button>
        {/* A desktop's way into full-map mode (Zach, #427); a phone swipes the sheet's line down instead. */}
        <button
          className="mkl-key mkl-hide-controls"
          aria-label={HIDE_CONTROLS}
          title={HIDE_CONTROLS}
          onClick={() => fullMap({ type: "hide" })}
        >
          Hide controls
        </button>
      </div>
    );
  const h = r.house;
  const house = !!h && !("outside" in h);
  const d = r.driveway;
  const drive = on.driveway && !!d;
  const entries = keyEntries({
    bestPin: on.pins && !house && !!s.card?.sites.length,
    standHere: !!ground,
    route: drive && (d.routes.length > 0 || !!d.overLimit),
    // As resultGeo draws them: a route past the first, or a route beside the over-limit one, is dashed grey.
    second: drive && (d.routes.length > 1 || (!!d.overLimit && d.routes.length > 0)),
    over: drive && !!d.overLimit,
    direct: drive && !!d.direct,
    yourRoute: !!ctl.state.store.open?.drivewayLine,
    fan: on.fan && !!s.view,
    allPins: on.pins && on.allPins,
  });
  // Every overlay that's on (owner, 2026-11-05); the graded ones only when the parcel has something to draw.
  const overlays = keyOverlays({
    soils: on.soils && (r.soilUnits?.length ?? 0) > 0,
    trailheads: on.trailheads && (r.near?.trailheads?.length ?? 0) > 0,
    power: layers.power && !!r.power,
    boulders: layers.boulders && !!r.boulders && r.boulders.acres > 0,
    water: layers.water && !!r.water,
    lidar: layers.lidar.on,
    places: layers.places.on,
    publicLand: layers.publicLand,
    mvum: layers.mvum,
    areas: layers.areas,
  });
  return (
    <div ref={box} className="map-key-line" role="note" aria-label="What the map shows">
      {entries.map((e) => (
        <span key={e} className={MINOR.has(e) ? "mkl-entry mkl-minor" : "mkl-entry"}>
          {SWATCH[e]}
          {KEY_WORDS[e]}
        </span>
      ))}
      {overlays.map((o) => (
        <span key={o} className="mkl-entry mkl-overlay">
          {OVERLAY_SWATCH[o]}
          {OVERLAY_WORDS[o]}
        </span>
      ))}
      <button
        className="link-btn mkl-all"
        onClick={() => {
          requestKeyOpen();
          ctl.setMapPanel(true);
        }}
      >
        {ALL_MARKS}
      </button>
      <button className="link-btn mkl-hide" aria-expanded={true} onClick={() => setOpenFor(null)}>
        {HIDE}
      </button>
      {/* A phone's shading legend, folded in here (CSS shows it only on a phone; the column's is hidden there). */}
      <SurfaceLegend where="key" />
    </div>
  );
}
