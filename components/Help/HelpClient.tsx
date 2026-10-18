"use client";
// Help's second section, the rulebook, reads the Settings, the list and its kept screens on first render: load it in
// the browser only.
import dynamic from "next/dynamic";

const HelpPage = dynamic(() => import("./HelpPage").then((m) => m.HelpPage), {
  ssr: false,
  loading: () => <p className="compare muted">Loading…</p>,
});

export function HelpClient() {
  return <HelpPage />;
}
