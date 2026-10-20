"use client";
/**
 * The places' bar (step 4b, plan §1–§3): Map, Your list and What matters, and the menu. One <nav>, laid out by CSS: a
 * bottom tab bar on a phone (each item a quarter of the width, an icon over its label, the menu as "More"), a 44 px top
 * bar on a desktop ("Parcel Screen", the places as text, ☰ at the right). The place you're in is marked with a 3 px bar
 * and aria-current.
 */
import Link from "next/link";
import { PLACES, placeOf, type PlaceId } from "@/lib/client/places";
import { Menu } from "./Menu";
import { useHousehold, useNewTakes } from "@/lib/client/householdDoc";
import { currentProfileId } from "@/lib/client/profiles";
import { waitingFor } from "@/lib/client/takes";
import { favoritesOf } from "@/lib/client/favorites";
import { getPref } from "@/lib/client/prefs";
import { SyncIndicator } from "@/components/Sync/SyncStatus";

export function Places({ pathname }: { pathname: string }) {
  const here = placeOf(pathname);
  const household = useHousehold();
  const me = currentProfileId();
  // Step 8 (plan §11 Q7): asks and takes count on the household's favorites only; a parcel in someone's History keeps
  // its asks and takes, unseen.
  const favorites = new Set(favoritesOf(getPref("ps.parcels")?.built ?? []).map((p) => p.key));
  const waiting = me ? [...waitingFor(household, me)].filter((k) => favorites.has(k)).length : 0;
  const fresh = useNewTakes().filter((t) => favorites.has(t.parcel)).length;
  const count = waiting + fresh;
  // The badge sums the parcels waiting for my take and the other members' takes I haven't seen (step 6b).
  const said = [
    waiting ? `${waiting} waiting for your take` : null,
    fresh ? `${fresh} new take${fresh === 1 ? "" : "s"}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <nav className="app-nav" aria-label="Places">
      <Link className="app-brand" href="/">
        Parcel Screen
      </Link>
      <ul className="app-tabs">
        {PLACES.map((p) => (
          <li key={p.id}>
            <Link className="app-tab" href={p.href} aria-current={here === p.id ? "page" : undefined}>
              <PlaceIcon id={p.id} />
              <span>{p.label}</span>
              {/* Step 6: parcels waiting for my take; 6b: and new takes. */}
              {p.id === "list" && count > 0 && (
                <span className="app-badge" aria-label={said} title={said}>
                  {count}
                </span>
              )}
            </Link>
          </li>
        ))}
        <li className="app-more-item">
          {/* Step 5: Synced / Not saved, beside ☰ on a desktop (on a phone it's in More's sheet). */}
          <SyncIndicator where="bar" />
          <Menu />
        </li>
      </ul>
    </nav>
  );
}

/** The phone's icons: a map pin, a list, a slider (plan §1). */
function PlaceIcon({ id }: { id: PlaceId }) {
  const d: Record<PlaceId, string> = {
    map: "M10 18s-5.5-5.2-5.5-9.2a5.5 5.5 0 0 1 11 0C15.5 12.8 10 18 10 18Zm0-7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
    list: "M7 5h10M7 10h10M7 15h10M3.5 5h.01M3.5 10h.01M3.5 15h.01",
    matters: "M3 6h8M15 6h2M3 14h2M9 14h8M13 4v4M7 12v4",
  };
  return (
    <svg className="app-tab-icon" width="22" height="22" viewBox="0 0 20 20" aria-hidden="true">
      <path
        d={d[id]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
