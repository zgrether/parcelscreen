"use client";
// The comparison table reads localStorage and IndexedDB on first render: load it in the browser only.
import dynamic from "next/dynamic";

const Compare = dynamic(() => import("./Compare").then((m) => m.Compare), {
  ssr: false,
  loading: () => <p className="compare muted">Loading your parcels…</p>,
});

export function CompareClient() {
  return <Compare />;
}
