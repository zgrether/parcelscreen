"use client";
import { MapView } from "@/components/Map/MapView";
import { MapControls } from "@/components/Map/MapControls";
import { Hint, MapTools } from "@/components/Map/MapTools";
import { ParcelTools } from "@/components/Map/ParcelTools";
import { Search } from "@/components/Map/Search";
import { TerrainLayers } from "@/components/Map/TerrainLayers";
import { LidarLayer } from "@/components/Map/LidarLayer";
import { FanLayer } from "@/components/Map/results/FanLayer";
import { ResultLayers } from "@/components/Map/results/ResultLayers";
import { PowerLayer } from "@/components/Map/results/PowerLayer";
import { ResultPins } from "@/components/Map/results/ResultPins";
import { StandHere } from "@/components/Map/results/StandHere";
import { ResultTips } from "@/components/Map/results/ResultTips";
import { SurfaceLayer } from "@/components/Map/results/SurfaceLayer";
import { useFlatForTools } from "@/components/Map/useFlatForTools";
import { DRAWING } from "./exploreState";
import { Toolbar } from "@/components/Map/Toolbar";
import { MarkPicker } from "@/components/Map/MarkPicker";
import type { UserConfig } from "@/lib/screen/types";
import { ClearedNote } from "./ClearedNote";
import { DismissToast } from "./DismissToast";
import { SwitchToast } from "./SwitchToast";
import { LineUndoToast } from "@/components/Map/LineUndoToast";
import { ScenarioUndoToast } from "@/components/Split/ScenarioUndoToast";
import { AttachListingChip } from "@/components/Map/AttachListingChip";
import { MapPanel } from "@/components/Map/MapPanel";
import { useExplore, type SetHint } from "./useExploreController";
import { OWN_RECORDS_HINT } from "@/lib/geo/ownRecords";
import { AreaOutlines } from "@/components/Map/AreaOutlines";

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
  const { setMap, panelInset, map, state, startDraw, docked } = useExplore();
  // Draw, Combine and Split flatten the camera while they're open (13g).
  const { mode, split } = state;
  useFlatForTools(map, DRAWING.includes(mode) || mode === "split" || mode === "combine" || split !== null);
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
      <LidarLayer hint={setHint} />
      <SurfaceLayer />
      <ResultLayers />
      <PowerLayer />
      <FanLayer />
      <ResultPins />
      <StandHere />
      <ResultTips />
      <MapTools parcelServices={config.endpoints.parcels} hint={setHint} />
      <MapControls hint={setHint} />
      <ParcelTools />
      <AreaOutlines />
      {/* On a desktop Search is the docked panel's first row (step 4c). */}
      {!docked && <Search photonUrl={config.endpoints.photon} hint={setHint} />}
      <Hint text={hint} action={hint === OWN_RECORDS_HINT ? { label: "Draw", onClick: startDraw } : null} />
      <SwitchToast />
      <DismissToast />
      <ClearedNote />
      <LineUndoToast />
      <ScenarioUndoToast />
      <AttachListingChip />
      <Toolbar />
      <MarkPicker />
      <MapPanel />
    </MapView>
  );
}
