"use client";
// The editor reads the profile's rubric and its kept screens on first render: load it in the browser only.
import dynamic from "next/dynamic";

const RubricEditor = dynamic(() => import("./RubricEditor").then((m) => m.RubricEditor), {
  ssr: false,
  loading: () => <p className="compare muted">Loading…</p>,
});

export function RubricClient() {
  return <RubricEditor />;
}
