"use client";
// The rulebook reads the Settings, History and its kept screens on first render: load it in the browser only.
import dynamic from "next/dynamic";

const Rulebook = dynamic(() => import("./Rulebook").then((m) => m.Rulebook), {
  ssr: false,
  loading: () => <p className="compare muted">Loading…</p>,
});

export function RulebookClient() {
  return <Rulebook />;
}
