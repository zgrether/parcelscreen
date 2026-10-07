"use client";
import { MapView } from "@/components/Map/MapView";
import { InfoPanel } from "@/components/Map/InfoPanel";
import { MapControls } from "@/components/Map/MapControls";
import { Hint, MapTools } from "@/components/Map/MapTools";
import { ParcelTools } from "@/components/Map/ParcelTools";
import { Search } from "@/components/Map/Search";
import { TerrainLayers } from "@/components/Map/TerrainLayers";
import { FanLayer } from "@/components/Map/results/FanLayer";
import { ResultLayers } from "@/components/Map/results/ResultLayers";
import { ResultPins } from "@/components/Map/results/ResultPins";
import { ResultTips } from "@/components/Map/results/ResultTips";
import { SurfaceLayer } from "@/components/Map/results/SurfaceLayer";
import { useFlatForTools } from "@/components/Map/useFlatForTools";
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
  leftInset,
}: {
  config: UserConfig;
  hint: string;
  setHint: SetHint;
  bottomInset: number;
  leftInset: number;
}) {
  const { setMap, panelInset, map, state } = useExplore();
  // Draw, Combine and Split flatten the camera while they're open (13g).
  const { mode, split } = state;
  useFlatForTools(map, mode === "draw" || mode === "split" || mode === "combine" || split !== null);
  return (
    <MapView
      lpAtlasTiles={config.endpoints.lpAtlasTiles}
      lpYear={config.endpoints.lpAtlasYear}
      bottomInset={bottomInset}
      rightInset={panelInset}
      leftInset={leftInset}
      onMap={setMap}
    >
      <TerrainLayers hint={setHint} />
      <SurfaceLayer />
      <ResultLayers />
      <FanLayer />
      <ResultPins />
      <ResultTips />
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
