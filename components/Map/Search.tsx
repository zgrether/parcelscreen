"use client";
/**
 * Map search (step 13f plan §4): on a phone, a search icon at the top left that opens one input; on a desktop, the
 * docked panel's first row, always open (step 4c, plan §1). Grouped results:
 * coordinates (parsed here), saved parcels by name, parcel numbers within the counties in view, and places
 * from Photon. Esc, a tap outside, or picking a result closes it. The combobox pattern: arrows move through
 * the options, Enter picks.
 *
 * A pasted listing link (WF1, parcel-workflow.md §2) offers "Go to {its address}": the address is read from the
 * link's path, and only that is geocoded, when it's picked. The link itself never reaches Photon or a parcel service.
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { browserHttp } from "@/lib/client/http";
import { CancelledError } from "@/lib/http";
import { coordinatesIn, idPattern } from "@/lib/search/query";
import { searchParcelNumbers, searchPlaces, type ParcelHit, type PlaceHit } from "@/lib/search/sources";
import { historyRows } from "@/lib/client/historyRows";
import { favoritesOf, historyOf, isFavorite, matchesSaved, parcelNumbers } from "@/lib/client/favorites";
import { useHistoryLog } from "@/lib/client/favoritesStore";
import { currentProfileId } from "@/lib/client/profiles";
import { flash, useExplore, type SetHint } from "@/components/Explore/useExploreController";
import { PRECISION_ZOOM, readListingUrl, type ListingRead } from "@/lib/client/listingUrl";
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

export function Search({
  photonUrl,
  hint,
  docked = false,
}: {
  photonUrl: string;
  hint: SetHint;
  /** The desktop panel's first row: always there; closing it clears it (a new box, empty). */
  docked?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  if (docked)
    return (
      <SearchBox key={round} photonUrl={photonUrl} hint={hint} docked close={() => setRound((r) => r + 1)} />
    );
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
  return <SearchBox photonUrl={photonUrl} hint={hint} close={() => setOpen(false)} />;
}

function SearchBox({
  photonUrl,
  hint,
  close,
  docked = false,
}: {
  photonUrl: string;
  hint: SetHint;
  close(): void;
  docked?: boolean;
}) {
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
  // Docked, an empty box has nothing to close: a tap elsewhere is just a tap.
  const idle = docked && !text;
  useEffect(() => {
    if (idle) return;
    const onDown = (e: PointerEvent) => {
      if (box.current?.contains(e.target as Node)) return;
      if ((e.target as Element).closest?.(".maplibregl-canvas-container"))
        window.addEventListener("click", (c) => c.stopPropagation(), { capture: true, once: true });
      close();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [close, idle]);

  // Parcel numbers and places, after a pause in typing; a newer query cancels the older requests.
  const searching = useRef<AbortController | null>(null);
  useEffect(() => {
    const q = text.trim();
    const map = ctl.map;
    // A listing link is read here, not searched: it must not leave the device (WF1).
    const isLink = readListingUrl(q).kind !== "notUrl";
    if (isLink) searching.current?.abort();
    const timer = setTimeout(() => {
      searching.current?.abort();
      if (isLink) {
        setParcels({ state: "idle" });
        setPlaces({ state: "idle" });
        setNoCounties(false);
        return;
      }
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

  // Step 8 (plan §5): the household's Favorites and this person's History, each with its parcel numbers; never another
  // member's History.
  const log = useHistoryLog();
  const me = currentProfileId();
  const saved = useMemo(() => {
    const built = ctl.state.store.built;
    const rows = (list: typeof built) => {
      const numbers = new Map(list.map((p) => [p.key!, parcelNumbers(p)]));
      return historyRows(list).map((r) => ({ ...r, numbers: numbers.get(r.key) ?? [] }));
    };
    const favorites = favoritesOf(built);
    const history = me ? historyOf(built, me, log).filter((p) => !isFavorite(p)) : [];
    return { favorites: rows(favorites), history: rows(history) };
  }, [ctl.state.store.built, me, log]);

  // The groups, in order; picking anything closes the search.
  const done = (f: () => void) => () => {
    f();
    close();
  };
  const q = text.trim();
  const coords = coordinatesIn(q);
  const groups: { title: string; options: Option[]; note?: string }[] = [];
  const listing = readListingUrl(q);
  if (listing.kind === "address")
    groups.push({
      title: "Listing link",
      options: [
        {
          key: "listing",
          label: `Go to ${listing.query}`,
          detail: listing.site,
          pick: done(() => void goToListing(listing)),
        },
      ],
    });
  else if (listing.kind === "unreadable")
    groups.push({ title: "Listing link", options: [], note: "Couldn't read an address from this link." });
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
  // Your saved parcels, by name or parcel number, above the place results (step 8, plan §5): up to five of each.
  for (const [title, list] of [
    ["Favorites", saved.favorites],
    ["Your history", saved.history],
  ] as const) {
    const hits = q ? list.filter((s) => matchesSaved(s.name, s.numbers, q)).slice(0, 5) : [];
    if (hits.length)
      groups.push({
        title,
        options: hits.map((s) => ({
          key: `saved:${s.key}`,
          label: s.name,
          ...(s.tellApart
            ? { detail: s.tellApart }
            : s.acres !== null
              ? { detail: `${s.acres.toFixed(1)} ac` } // one decimal, as Your list shows it (polish)
              : {}),
          pick: done(() => ctl.openSaved(s.key)),
        })),
      });
  }
  // Until the debounce clears them, results from before a link was pasted aren't shown with it.
  const searched = listing.kind === "notUrl";
  if (searched && noCounties)
    groups.push({
      title: "Parcel numbers",
      options: [],
      note: serviceDown ?? "Zoom in on the county to search its parcel numbers.",
    });
  else if (searched && parcels.state !== "idle")
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
  if (searched && places.state !== "idle")
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

  /**
   * Centres the map on a listing's address, at a zoom that matches what the link told (a street number, a road, a
   * county), and says to tap the parcel: nothing is selected for you, since a vacant lot's "0 Ferney Creek Rd" is
   * somewhere on a road that may run for miles.
   */
  async function goToListing(l: Extract<ListingRead, { kind: "address" }>) {
    const map = ctl.map;
    if (!map) return;
    // Offered to the next parcel opened, to attach with one tap (owner, #130).
    ctl.listingSearched({ url: l.url, site: l.site, street: l.street, query: l.query });
    try {
      const c = map.getCenter();
      const [hit] = await searchPlaces(
        browserHttp,
        photonUrl,
        l.query,
        [c.lat, c.lng],
        new AbortController().signal,
      );
      if (!hit) return flash(hint, `Couldn't find ${l.query} on the map.`, 4000);
      map.jumpTo({ center: [hit.ll[1], hit.ll[0]], zoom: PRECISION_ZOOM[l.precision] });
      flash(
        hint,
        l.precision === "county"
          ? `Centred on ${l.query}: the link names only the county. Zoom in and tap the parcel.`
          : `Centred on ${l.query}: tap the parcel.`,
        6000,
      );
    } catch (e) {
      if (!(e instanceof CancelledError)) flash(hint, "Places search is unavailable right now.", 4000);
    }
  }

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
  // A group's heading id has no spaces: aria-labelledby reads a space as a list of ids ("Your history" was unnamed).
  const headId = (title: string) => `${id}-${title.replace(/\s+/g, "-")}`;
  const rows: ReactNode[] = groups.map((g) => (
    <div key={g.title} role="group" aria-labelledby={headId(g.title)}>
      <div className="sr-head" id={headId(g.title)}>
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
    <div className={docked ? "search-box docked" : "search-box"} ref={box} role="search">
      <div className="search-field">
        <SearchIcon />
        <input
          autoFocus={!docked}
          type="text"
          role="combobox"
          aria-label="Search coordinates, saved parcels, parcel numbers, places or a listing link"
          aria-expanded={groups.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={options.length ? optionId(current) : undefined}
          placeholder="Coordinates, parcel number, place, listing link…"
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
