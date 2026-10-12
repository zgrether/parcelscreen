"use client";
/**
 * The latest kept screen of each History parcel (VR6, VR7): what it says, by History key, once IndexedDB answers. "ok"
 * with its result; "rescreen" when it's from earlier rules or gone (it re-screens when opened); "none" when the parcel
 * was never screened. The comparison table and the rulebook's breakdown read it.
 */
import { useEffect, useState } from "react";
import type { ScreenResult } from "@/lib/screen/types";
import type { WorkingParcel } from "./parcelStore";
import { needsRescreen, readScreen } from "./screenStore";

export interface KeptScreen {
  state: "ok" | "rescreen" | "none";
  result: ScreenResult | null;
}

export function useKeptScreens(parcels: readonly WorkingParcel[]): ReadonlyMap<string, KeptScreen> {
  const [found, setFound] = useState<ReadonlyMap<string, KeptScreen>>(new Map());
  const sig = parcels.map((p) => `${p.key}:${p.screenIds.at(-1) ?? ""}`).join(",");
  useEffect(() => {
    let alive = true;
    void Promise.all(
      parcels.map(async (p): Promise<[string, KeptScreen]> => {
        const id = p.screenIds.at(-1);
        if (!id) return [p.key!, { state: "none", result: null }];
        const r = await readScreen(id);
        return [
          p.key!,
          r.kind === "ok" && !needsRescreen(r)
            ? { state: "ok", result: r.record.result }
            : { state: "rescreen", result: null },
        ];
      }),
    ).then((entries) => alive && setFound(new Map(entries)));
    return () => {
      alive = false;
    };
    // `sig` stands for `parcels`: re-read only when a parcel or its latest screen changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  return found;
}
