"use client";
/**
 * Sample parcels (step 13, docs/plans/step-13-area-catalog.md §5): "Show me a parcel here" opens one of an area's two
 * pre-screened parcels on the map, graded under the person's rubric like any parcel, labelled "Sample parcel". It
 * comes in as a parcel of its own with its shipped screen (as Recent's are: on the list once starred), so nothing is
 * screened while the person waits; a sample's piece names where it came from (`sample:<area>-<n>`), which is how the
 * app knows to offer Add to list and hold back the editing tools until it's on the list.
 */
import { lastRank, rankBetween } from "./myOrder";
import { addImportedParcels, currentParcels } from "./liveParcels";
import { openOnMap } from "./openOnMap";
import { plainParcel, type WorkingParcel } from "./parcelStore";
import { currentProfileId } from "./profiles";
import { runKeys } from "./screenKeys";
import { addScreen } from "./screenStore";
import { loadUserConfig } from "./userConfig";
import { bbox } from "@turf/turf";
import type { Polygon } from "geojson";
import { SampleFileSchema, samplePath } from "@/lib/areas/types";
import { focusArea, type Box } from "./areas";

const PREFIX = "sample:";

/** Whether a parcel is one of the catalog's samples, and which. */
export function sampleOf(p: WorkingParcel | null): { area: string; n: number } | null {
  const src = p?.pieces[0]?.source ?? "";
  const m = src.startsWith(PREFIX) ? /^sample:(.+)-(\d+)$/.exec(src) : null;
  return m ? { area: m[1]!, n: Number(m[2]) } : null;
}

/** A sample not yet on the person's list: shown read-only, with Add to list. */
export const isPreview = (p: WorkingParcel | null): boolean => !!sampleOf(p) && p!.status === "inProgress";

/**
 * Opens an area's n-th sample: the one already brought in, or a new parcel with the shipped screen. The caller goes
 * to the map when it isn't there. Throws when the file doesn't load.
 */
export async function openSample(area: string, n: number): Promise<void> {
  const source = `${PREFIX}${area}-${n}`;
  const had = currentParcels().built.find((p) => p.pieces[0]?.source === source);
  if (had) {
    openOnMap(had);
    return focusParcel(had.pieces[0]!.geo.geometry);
  }
  const r = await fetch(samplePath(area, n));
  if (!r.ok) throw new Error(`${samplePath(area, n)}: ${r.status}`);
  const file = SampleFileSchema.parse(await r.json());
  const now = new Date().toISOString();
  const screenId = crypto.randomUUID();
  await addScreen({
    id: screenId,
    keys: runKeys(file.boundary, null, loadUserConfig(), []),
    result: file.result,
    engine: file.result.engine,
  });
  const p: WorkingParcel = {
    ...plainParcel(
      {
        geo: { type: "Feature", properties: {}, geometry: file.boundary },
        props: {},
        source,
        multiPart: false,
      },
      now,
    ),
    key: crypto.randomUUID(),
    name: file.name,
    screenIds: [screenId],
    addedBy: currentProfileId(),
    rank: rankBetween(lastRank(currentParcels().built), null),
  };
  addImportedParcels([p]);
  openOnMap(p);
  focusParcel(file.boundary);
}

/** The map on the parcel: a parcel opened from the list keeps the view it had, and a sample may be anywhere. */
const focusParcel = (g: Polygon) => focusArea(bbox(g) as Box);
