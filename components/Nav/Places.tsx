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

export function Places({ pathname }: { pathname: string }) {
  const here = placeOf(pathname);
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
            </Link>
          </li>
        ))}
        <li className="app-more-item">
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
