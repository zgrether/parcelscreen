"use client";
import { MapView } from "@/components/Map/MapView";
import { MapControls } from "@/components/Map/MapControls";
import { Hint, MapTools } from "@/components/Map/MapTools";
import { ParcelTools } from "@/components/Map/ParcelTools";
import { Search } from "@/components/Map/Search";
import { TerrainLayers } from "@/components/Map/TerrainLayers";
import { LidarLayer } from "@/components/Map/LidarLayer";
import { PlacesLayer } from "@/components/Map/PlacesLayer";
import { PublicLandLayer } from "@/components/Map/PublicLandLayer";
import { MvumLayer } from "@/components/Map/MvumLayer";
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
import { SwitchToast } from "./SwitchToast";
import { LineUndoToast } from "@/components/Map/LineUndoToast";
import { ScenarioUndoToast } from "@/components/Split/ScenarioUndoToast";
import { RuleOutToast } from "./RuleOutToast";
import { BackChip } from "./BackChip";
import { MapKeyLine } from "@/components/Map/MapKeyLine";
import { FinishPrompt } from "@/components/Map/FinishPrompt";
import { AttachListingChip } from "@/components/Map/AttachListingChip";
import { MapPanel } from "@/components/Map/MapPanel";
import { useExplore, type SetHint } from "./useExploreController";
import { isOwnRecordsHint } from "@/lib/geo/ownRecords";
import { AreaOutlines } from "@/components/Map/AreaOutlines";
import { useMapLayerPrefs } from "@/components/Map/useMapLayerPrefs";
import { ZOOM_HINT } from "@/components/Map/useParcelLines";

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
  const { setMap, panelInset, map, state, docked } = useExplore();
  // Draw, Combine and Split flatten the camera while they're open (13g).
  const { mode, split } = state;
  // Polish 2 (M11): with the areas' outlines on, "Zoom in to see parcel lines" would read as being about them.
  const areas = useMapLayerPrefs().areas;
  const shownHint = areas && hint === ZOOM_HINT ? "" : hint;
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
      <PublicLandLayer hint={setHint} />
      <MvumLayer hint={setHint} />
      <PlacesLayer hint={setHint} anchors={config.anchors} />
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
      <Hint text={shownHint} ownRecords={isOwnRecordsHint(shownHint)} />
      <SwitchToast />
      <ClearedNote />
      <LineUndoToast />
      <ScenarioUndoToast />
      <RuleOutToast />
      <BackChip />
      <MapKeyLine />
      <FinishPrompt />
      <AttachListingChip />
      <Toolbar />
      <MarkPicker />
      <MapPanel />
    </MapView>
  );
}
