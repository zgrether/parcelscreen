"use client";
/**
 * Where the app opens (owner, #128, #132; docs/plans/parcel-workflow.md §5): the household's list when at least one
 * parcel isn't archived, otherwise the map. The parcels are in this browser's store, so the choice is made here, not
 * on the server.
 */
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { openingPage } from "@/lib/client/opening";
import { getPref } from "@/lib/client/prefs";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace(openingPage(getPref("ps.parcels")?.built ?? []));
  }, [router]);
  return <p className="compare muted">Opening Parcel Screen…</p>;
}
