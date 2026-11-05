"use client";
/**
 * The map's key line (UX part 2 PR 3b2; the audit's P-2): under the map while a graded parcel is open, naming what it
 * draws, each beside a small copy of how it looks ("1 Best homesite · The app's driveway · Skyline rays"; polish 2 adds Stand here and the driveway's other lines), then "All map
 * marks", which opens Map layers at the full key (MapKey) with its Every pin toggle. Hidden while a tool is open, and on
 * a phone with the sheet raised, as the map's other notes are (B-7).
 */
import { useLayoutEffect, useRef } from "react";
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
  const r = s && !s.stale && !tool ? s.display : null;
  if (!s || !r) return null;
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
    </div>
  );
}
