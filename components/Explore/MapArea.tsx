"use client";
import { MapView } from "@/components/Map/MapView";
import { Hint, MapTools } from "@/components/Map/MapTools";
import type { UserConfig } from "@/lib/screen/types";

/** The map with its tools and hint. Loaded client-side only (MapLibre needs the browser). */
export function MapArea({
  config,
  hint,
  setHint,
  bottomInset,
}: {
  config: UserConfig;
  hint: string;
  setHint: (t: string | ((prev: string) => string)) => void;
  bottomInset: number;
}) {
  return (
    <MapView
      lpAtlasTiles={config.endpoints.lpAtlasTiles}
      lpYear={config.endpoints.lpAtlasYear}
      bottomInset={bottomInset}
    >
      <MapTools parcelServices={config.endpoints.parcels} hint={setHint} />
      <Hint text={hint} />
    </MapView>
  );
}
