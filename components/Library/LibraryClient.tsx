"use client";
// The list reads localStorage and IndexedDB on first render: load it in the browser only.
import dynamic from "next/dynamic";

const Library = dynamic(() => import("./Library").then((m) => m.Library), {
  ssr: false,
  loading: () => <p className="compare muted">Loading your parcels…</p>,
});

export function LibraryClient() {
  return <Library />;
}
