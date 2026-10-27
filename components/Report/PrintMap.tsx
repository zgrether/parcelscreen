"use client";
/**
 * The report card's map (step 9 plan §4): the aerial imagery's tiles as plain images in a clipped box, and one SVG over
 * them with the boundary, the best site and the alternatives, your lines and a marked house; a north arrow and a scale
 * bar; the imagery's credit under it. Images and inline SVG print in every browser, Android Chrome's Save as PDF
 * included, which a WebGL canvas doesn't. It tells the page once every tile has loaded or failed, so Print can wait.
 *
 * Black and white: the boundary is a white line on a dark edge; the best site is a filled numbered disc, the others
 * ringed; each line kind has its own dash. Nothing rests on colour.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { LatLon } from "@/lib/geo/types";
import type { LineKind } from "@/lib/client/parcelStore";
import {
  boundsOf,
  DENSITY,
  IMAGERY,
  mapView,
  scaleBar,
  TILE,
  tileUrl,
  type ImagerySource,
} from "@/lib/print/staticMap";

export interface PrintSite {
  /** Its pin number, as on the map. */
  rank: number;
  ll: LatLon;
  best: boolean;
}

export interface PrintLine {
  kind: LineKind;
  line: LatLon[];
}

export const MAP_WORDS = {
  loading: "Map loading…",
  failed: "The map couldn't load. The rest of the report card is complete.",
  best: "Filled: the best site",
  others: "ringed: other sites",
  house: "the bulls-eye: your house site",
  line: { drive: "solid: a drive", track: "dashed: a track", easement: "dotted: an easement" },
} as const;

/** The key's copy of a site pin: filled for the best, white for the others, a dot inside for the house. */
const KeyDot = ({ fill, ring = false }: { fill: string; ring?: boolean }) => (
  <svg className="rp-key-swatch" width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
    <circle cx="5.5" cy="5.5" r="4.5" fill={fill} stroke="#111" strokeWidth="1.3" />
    {ring && <circle cx="5.5" cy="5.5" r="1.6" fill="#111" />}
  </svg>
);
/** The key's copy of a line, with its dash. */
const KeyLine = ({ dash }: { dash: string | undefined }) => (
  <svg className="rp-key-swatch" width="18" height="11" viewBox="0 0 18 11" aria-hidden="true">
    <line x1="1" y1="5.5" x2="17" y2="5.5" stroke="#111" strokeWidth="2" strokeDasharray={dash} />
  </svg>
);

/** Each line kind's dash (none for a drive). */
const DASH: Record<LineKind, string | undefined> = { drive: undefined, track: "7 4", easement: "1.5 3.5" };

type TileState = { source: ImagerySource; settled: boolean; failed: boolean };

export function PrintMap({
  rings,
  sites,
  lines,
  house,
  height,
  onSettled,
}: {
  /** The boundary's rings, each [lat, lon] points. */
  rings: LatLon[][];
  sites: PrintSite[];
  lines: PrintLine[];
  house: LatLon | null;
  /** The box's height in CSS px; its width is the print area's. */
  height: number;
  onSettled(): void;
}) {
  const width = 720;
  const view = useMemo(
    () =>
      mapView(
        boundsOf([...rings.flat(), ...sites.map((s) => s.ll), ...(house ? [house] : [])]),
        width,
        height,
      ),
    [rings, sites, house, height],
  );
  const viewKey = `${view.z}:${view.tiles.length}:${height}`;
  const [tiles, setTiles] = useState<{ key: string; states: TileState[] }>({ key: "", states: [] });
  // A new view (the fit made the map smaller): every tile starts again from USGS.
  const states =
    tiles.key === viewKey
      ? tiles.states
      : view.tiles.map((): TileState => ({ source: "usgs", settled: false, failed: false }));
  const update = (i: number, s: TileState) =>
    setTiles((t) => {
      const base = t.key === viewKey ? t.states : states;
      const next = base.slice();
      next[i] = s;
      return { key: viewKey, states: next };
    });
  const told = useRef(false);
  const settled = states.length > 0 && states.every((s) => s.settled);
  const failed = settled && states.every((s) => s.failed);
  useEffect(() => {
    if (settled && !told.current) {
      told.current = true;
      onSettled();
    }
  }, [settled, onSettled]);

  const usedEsri = states.some((s) => s.source === "esri" && !s.failed);
  const bar = scaleBar(view.metresPerPx);
  const path = (pts: LatLon[], close: boolean) =>
    pts
      .map(
        (ll, i) =>
          `${i ? "L" : "M"}${view
            .at(ll)
            .map((v) => v.toFixed(1))
            .join(" ")}`,
      )
      .join("") + (close ? "Z" : "");

  return (
    <figure className="rp-map">
      <div className="rp-map-box" style={{ height }} aria-label="Map of the parcel" role="img">
        {view.tiles.map((t, i) => {
          const s = states[i]!;
          return s.failed ? null : (
            // A plain image on purpose: the tile prints as itself, with no optimiser or proxy between it and the server.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${viewKey}:${i}:${s.source}`}
              className="rp-tile"
              src={tileUrl(s.source, view.z, t.x, t.y)}
              alt=""
              width={TILE / DENSITY}
              height={TILE / DENSITY}
              style={{ left: t.left, top: t.top }}
              referrerPolicy="no-referrer"
              onLoad={() => update(i, { ...s, settled: true })}
              onError={() =>
                update(
                  i,
                  s.source === "usgs"
                    ? { source: "esri", settled: false, failed: false }
                    : { ...s, settled: true, failed: true },
                )
              }
            />
          );
        })}
        <svg
          className="rp-overlay"
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          aria-hidden="true"
        >
          {rings.map((r, i) => (
            <g key={i}>
              <path d={path(r, true)} fill="none" stroke="#111" strokeWidth={5} strokeLinejoin="round" />
              <path d={path(r, true)} fill="none" stroke="#fff" strokeWidth={2.2} strokeLinejoin="round" />
            </g>
          ))}
          {lines.map((l, i) => (
            <g key={i}>
              <path
                d={path(l.line, false)}
                fill="none"
                stroke="#111"
                strokeWidth={4.5}
                strokeLinecap="round"
              />
              <path
                d={path(l.line, false)}
                fill="none"
                stroke="#fff"
                strokeWidth={2}
                strokeDasharray={DASH[l.kind]}
                strokeLinecap="round"
              />
            </g>
          ))}
          {house &&
            (() => {
              const [x, y] = view.at(house);
              return (
                <g>
                  <circle cx={x} cy={y} r={9} fill="#fff" stroke="#111" strokeWidth={1.5} />
                  <circle cx={x} cy={y} r={5} fill="none" stroke="#111" strokeWidth={1.5} />
                  <circle cx={x} cy={y} r={1.8} fill="#111" />
                </g>
              );
            })()}
          {sites.map((s) => {
            const [x, y] = view.at(s.ll);
            return (
              <g key={s.rank}>
                {!s.best && <circle cx={x} cy={y} r={11.5} fill="none" stroke="#fff" strokeWidth={2} />}
                <circle cx={x} cy={y} r={9} fill={s.best ? "#111" : "#fff"} stroke="#111" strokeWidth={1.5} />
                <text
                  x={x}
                  y={y + 3.6}
                  textAnchor="middle"
                  fontSize={10.5}
                  fontWeight={700}
                  fill={s.best ? "#fff" : "#111"}
                >
                  {s.rank}
                </text>
              </g>
            );
          })}
          <g transform={`translate(${width - 26} 12)`}>
            <rect x={-10} y={-2} width={20} height={30} rx={3} fill="#fff" opacity={0.9} />
            <path d="M0 2 L6 14 L0 11 L-6 14 Z" fill="#111" />
            <text x={0} y={25} textAnchor="middle" fontSize={9} fontWeight={700} fill="#111">
              N
            </text>
          </g>
          <g transform={`translate(10 ${height - 22})`}>
            <rect x={-4} y={-4} width={bar.px + 8} height={18} rx={3} fill="#fff" opacity={0.9} />
            <rect x={0} y={8} width={bar.px} height={3} fill="#111" />
            <text x={0} y={5} fontSize={8.5} fill="#111">
              {bar.label}
            </text>
          </g>
        </svg>
        {!settled && <p className="rp-map-note">{MAP_WORDS.loading}</p>}
        {failed && <p className="rp-map-note">{MAP_WORDS.failed}</p>}
      </div>
      <figcaption className="rp-map-credit">
        {/* Polish 2 (R2): each key word after a small copy of its mark, so "Filled" shows what's filled. */}
        {[
          ...(sites.some((s) => s.best)
            ? [{ k: "best", swatch: <KeyDot fill="#111" />, text: MAP_WORDS.best }]
            : []),
          ...(sites.some((s) => !s.best)
            ? [{ k: "others", swatch: <KeyDot fill="#fff" />, text: MAP_WORDS.others }]
            : []),
          ...(house ? [{ k: "house", swatch: <KeyDot fill="#fff" ring />, text: MAP_WORDS.house }] : []),
          ...(["drive", "track", "easement"] as const)
            .filter((k) => lines.some((l) => l.kind === k))
            .map((k) => ({ k, swatch: <KeyLine dash={DASH[k]} />, text: MAP_WORDS.line[k] })),
        ].map((e) => (
          <span key={e.k} className="rp-key">
            {e.swatch}
            {e.text} ·{" "}
          </span>
        ))}
        {IMAGERY.usgs.credit}
        {usedEsri ? ` · ${IMAGERY.esri.credit}` : ""}
      </figcaption>
    </figure>
  );
}
