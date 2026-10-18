"use client";
// The interview reads the profile's answers and rubric on first render: load it in the browser only.
import dynamic from "next/dynamic";

const Interview = dynamic(() => import("./Interview").then((m) => m.Interview), {
  ssr: false,
  loading: () => <p className="iv muted">Loading…</p>,
});

export function InterviewClient() {
  return <Interview />;
}
