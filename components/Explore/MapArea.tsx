"use client";
import { MapView } from "@/components/Map/MapView";
import { Hint, MapTools } from "@/components/Map/MapTools";
import { ParcelTools } from "@/components/Map/ParcelTools";
import { Search } from "@/components/Map/Search";
import { Toolbar } from "@/components/Map/Toolbar";
import type { UserConfig } from "@/lib/screen/types";
import { useExplore, type SetHint } from "./useExploreController";

/** The map with its tools and hint. Loaded client-side only (MapLibre needs the browser). */
export function MapArea({
  config,
  hint,
  setHint,
  bottomInset,
}: {
  config: UserConfig;
  hint: string;
  setHint: SetHint;
  bottomInset: number;
}) {
  const { setMap } = useExplore();
  return (
    <MapView
      lpAtlasTiles={config.endpoints.lpAtlasTiles}
      lpYear={config.endpoints.lpAtlasYear}
      bottomInset={bottomInset}
      onMap={setMap}
    >
      <MapTools parcelServices={config.endpoints.parcels} hint={setHint} />
      <ParcelTools />
      <Search />
      <Hint text={hint} />
      <Toolbar />
    </MapView>
  );
}
