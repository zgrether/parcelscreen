"use client";
/**
 * "‹ Your list" (Z-2, UX part 2 §9 Q1): a saved parcel opened from Your list, Recent or Compare can go straight back to
 * the view and the scroll it came from. Shown while that parcel is the open one; gone once another opens.
 */
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { backTo } from "@/lib/client/openOnMap";
import { useExplore } from "./useExploreController";

export function BackChip() {
  const ctl = useExplore();
  const router = useRouter();
  const openKey = ctl.state.store.open?.key ?? null;
  // Read when the open parcel changes: openOnMap writes the target before the map opens it.
  const b = useMemo(() => (openKey ? backTo() : null), [openKey]);
  if (!b || b.key !== openKey) return null;
  return (
    <button type="button" className="back-chip" onClick={() => router.push(b.href)}>
      ‹ {b.label}
    </button>
  );
}
