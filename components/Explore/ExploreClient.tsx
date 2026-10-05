"use client";
// The explorer is a full-screen map app that reads localStorage on first render: load it in the browser only.
import dynamic from "next/dynamic";
import type { ReactNode } from "react";

const ExploreShell = dynamic(() => import("./ExploreShell").then((m) => m.ExploreShell), { ssr: false });

export function ExploreClient({ children }: { children?: ReactNode }) {
  return <ExploreShell>{children}</ExploreShell>;
}
