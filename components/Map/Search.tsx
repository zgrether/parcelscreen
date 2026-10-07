"use client";
/**
 * Map search (step 13f plan §4): a search icon at the top left that opens one input, with grouped results:
 * coordinates (parsed here), saved parcels by name, parcel numbers within the counties in view, and places
 * from Photon. Esc, a tap outside, or picking a result closes it. The combobox pattern: arrows move through
 * the options, Enter picks.
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { browserHttp } from "@/lib/client/http";
import { CancelledError } from "@/lib/http";
import { coordinatesIn, idPattern, matchesName } from "@/lib/search/query";
import { searchParcelNumbers, searchPlaces, type ParcelHit, type PlaceHit } from "@/lib/search/sources";
import { parcelName } from "@/components/Explore/History";
import { useExplore } from "@/components/Explore/useExploreController";
import { countiesShown, parcelServiceDown } from "./useParcelLines";

/** Network searches wait this long after the last keystroke. */
const DEBOUNCE_MS = 300;
/** Places are searched from this many characters. */
const MIN_PLACE_CHARS = 3;

type Remote<T> =
  { state: "idle" } | { state: "loading" } | { state: "done"; hits: T[] } | { state: "failed" };

interface Option {
  key: string;
  label: string;
  detail?: string;
  pick(): void;
}

export function Search({ photonUrl }: { photonUrl: string }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button
        className="map-ctl-btn search-btn"
        aria-label="Search"
        title="Search"
        onClick={() => setOpen(true)}
      >
        <SearchIcon />
      </button>
    );
  return <SearchBox photonUrl={photonUrl} close={() => setOpen(false)} />;
}

function SearchBox({ photonUrl, close }: { photonUrl: string; close(): void }) {
  const ctl = useExplore();
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);
  const [parcels, setParcels] = useState<Remote<ParcelHit>>({ state: "idle" });
  const [places, setPlaces] = useState<Remote<PlaceHit>>({ state: "idle" });
  const [noCounties, setNoCounties] = useState(false);
  /** No counties to search because the view's parcel service isn't answering (owner, after 16b). */
  const [serviceDown, setServiceDown] = useState<string | null>(null);

  // A tap anywhere outside closes it. On the map, that tap only closes it: the click it makes is swallowed,
  // so it doesn't also select the parcel under the finger.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (box.current?.contains(e.target as Node)) return;
      if ((e.target as Element).closest?.(".maplibregl-canvas-container"))
        window.addEventListener("click", (c) => c.stopPropagation(), { capture: true, once: true });
      close();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [close]);

  // Parcel numbers and places, after a pause in typing; a newer query cancels the older requests.
  const searching = useRef<AbortController | null>(null);
  useEffect(() => {
    const q = text.trim();
    const map = ctl.map;
    const timer = setTimeout(() => {
      searching.current?.abort();
      const abort = new AbortController();
      searching.current = abort;
      const counties = map ? countiesShown(map) : new Map();
      // Parcel numbers have digits: "Floyd" is a place, not a parcel number.
      const wantsParcels = idPattern(q) !== null && /\d/.test(q);
      setNoCounties(wantsParcels && counties.size === 0);
      setServiceDown(map ? parcelServiceDown(map) : null);
      if (wantsParcels && counties.size) {
        setParcels({ state: "loading" });
        searchParcelNumbers(browserHttp, counties, q, abort.signal).then(
          (hits) => setParcels({ state: "done", hits }),
          (e) => !(e instanceof CancelledError) && setParcels({ state: "failed" }),
        );
      } else setParcels({ state: "idle" });
      // A coordinates pair is a place already: Photon isn't asked.
      if (q.length >= MIN_PLACE_CHARS && map && !coordinatesIn(q)) {
        const c = map.getCenter();
        setPlaces({ state: "loading" });
        searchPlaces(browserHttp, photonUrl, q, [c.lat, c.lng], abort.signal).then(
          (hits) => setPlaces({ state: "done", hits }),
          (e) => !(e instanceof CancelledError) && setPlaces({ state: "failed" }),
        );
      } else setPlaces({ state: "idle" });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, ctl.map, photonUrl]);
  useEffect(() => () => searching.current?.abort(), []);

  const saved = useMemo(
    () => ctl.state.store.built.map((b) => ({ key: b.key!, ...parcelName(b) })),
    [ctl.state.store.built],
  );

  // The groups, in order; picking anything closes the search.
  const done = (f: () => void) => () => {
    f();
    close();
  };
  const q = text.trim();
  const coords = coordinatesIn(q);
  const groups: { title: string; options: Option[]; note?: string }[] = [];
  if (coords)
    groups.push({
      title: "Coordinates",
      options: [
        {
          key: "coords",
          label: `Go to ${coords[0]}, ${coords[1]}`,
          pick: done(() => ctl.map?.jumpTo({ center: [coords[1], coords[0]], zoom: 16 })),
        },
      ],
    });
  const savedHits = q ? saved.filter((s) => matchesName(s.name, q)).slice(0, 5) : [];
  if (savedHits.length)
    groups.push({
      title: "Saved parcels",
      options: savedHits.map((s) => ({
        key: `saved:${s.key}`,
        label: s.name,
        ...(s.acres !== null ? { detail: `${s.acres.toFixed(2)} ac` } : {}),
        pick: done(() => ctl.openSaved(s.key)),
      })),
    });
  if (noCounties)
    groups.push({
      title: "Parcel numbers",
      options: [],
      note: serviceDown ?? "Zoom in on the county to search its parcel numbers.",
    });
  else if (parcels.state !== "idle")
    groups.push({
      title: "Parcel numbers",
      options:
        parcels.state === "done"
          ? parcels.hits.map((h) => ({
              key: `parcel:${h.source}:${h.id}`,
              label: h.id,
              detail: h.county,
              pick: done(() => {
                ctl.map?.jumpTo({ center: [h.centre[1], h.centre[0]] });
                void ctl.openOutline(h);
              }),
            }))
          : [],
      ...(parcels.state === "loading"
        ? { note: "Searching…" }
        : parcels.state === "failed"
          ? { note: "Parcel search is unavailable right now." }
          : parcels.hits.length === 0
            ? { note: `No parcel numbers start with “${q}” in the counties in view.` }
            : {}),
    });
  if (places.state !== "idle")
    groups.push({
      title: "Places",
      options:
        places.state === "done"
          ? places.hits.map((p, i) => ({
              key: `place:${i}`,
              label: p.label,
              ...(p.detail ? { detail: p.detail } : {}),
              pick: done(() => {
                if (p.extent)
                  ctl.map?.fitBounds(
                    [
                      [p.extent[0], p.extent[3]],
                      [p.extent[2], p.extent[1]],
                    ],
                    { maxZoom: 15 },
                  );
                else ctl.map?.flyTo({ center: [p.ll[1], p.ll[0]], zoom: 14 });
              }),
            }))
          : [],
      ...(places.state === "loading"
        ? { note: "Searching…" }
        : places.state === "failed"
          ? { note: "Places search is unavailable right now." }
          : places.hits.length === 0
            ? { note: "No places found." }
            : {}),
    });

  const options = groups.flatMap((g) => g.options);
  const current = Math.min(active, options.length - 1);
  const optionId = (i: number) => `${id}-opt-${i}`;

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (options.length)
        setActive((current + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
    } else if (e.key === "Enter" && options[current]) {
      e.preventDefault();
      options[current]!.pick();
    }
  };

  let n = -1;
  const listId = `${id}-list`;
  const rows: ReactNode[] = groups.map((g) => (
    <div key={g.title} role="group" aria-labelledby={`${id}-${g.title}`}>
      <div className="sr-head" id={`${id}-${g.title}`}>
        {g.title}
      </div>
      {g.options.map((o) => {
        const i = ++n;
        return (
          <div
            key={o.key}
            id={optionId(i)}
            role="option"
            aria-selected={i === current}
            className="sr-opt"
            onPointerDown={(e) => e.preventDefault()}
            onClick={o.pick}
            onPointerEnter={() => setActive(i)}
          >
            <span>{o.label}</span>
            {o.detail && <span className="muted">{o.detail}</span>}
          </div>
        );
      })}
      {g.note && <div className="sr-note">{g.note}</div>}
    </div>
  ));

  return (
    <div className="search-box" ref={box} role="search">
      <div className="search-field">
        <SearchIcon />
        <input
          autoFocus
          type="text"
          role="combobox"
          aria-label="Search coordinates, saved parcels, parcel numbers or places"
          aria-expanded={groups.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={options.length ? optionId(current) : undefined}
          placeholder="Coordinates, parcel number, place…"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKey}
        />
      </div>
      {groups.length > 0 && (
        <div className="search-results" id={listId} role="listbox" aria-label="Search results">
          {rows}
        </div>
      )}
    </div>
  );
}

const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <circle cx="7.5" cy="7.5" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="M11.3 11.3 16 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
