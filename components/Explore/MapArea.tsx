"use client";
import { MapView } from "@/components/Map/MapView";
import { InfoPanel } from "@/components/Map/InfoPanel";
import { MapControls } from "@/components/Map/MapControls";
import { Hint, MapTools } from "@/components/Map/MapTools";
import { ParcelTools } from "@/components/Map/ParcelTools";
import { Search } from "@/components/Map/Search";
import { Toolbar } from "@/components/Map/Toolbar";
import type { UserConfig } from "@/lib/screen/types";
import { Menu } from "./Menu";
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
  const { setMap, panelInset } = useExplore();
  return (
    <MapView
      lpAtlasTiles={config.endpoints.lpAtlasTiles}
      lpYear={config.endpoints.lpAtlasYear}
      bottomInset={bottomInset}
      rightInset={panelInset}
      onMap={setMap}
    >
      <MapTools parcelServices={config.endpoints.parcels} hint={setHint} />
      <MapControls hint={setHint} />
      <ParcelTools />
      <Menu />
      <Search photonUrl={config.endpoints.photon} />
      <Hint text={hint} />
      <Toolbar />
      <InfoPanel />
    </MapView>
  );
}
