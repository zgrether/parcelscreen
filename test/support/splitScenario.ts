/**
 * Step 14 PR 6's split of Mud Creek (docs/plans/step-14-land-uses.md §5, §11): one fixed line, north to south through
 * the parcel's centre, so its two pieces' screens can be recorded once (`PORT_APPEND=grayson-mud-creek-6273 pnpm
 * record:port`) and replayed by the e2e, which puts the same scenario on the parcel. The parcel is the one the e2e's
 * import makes of the fixture (a prototype export's saved boundary).
 */
import { bbox, centroid } from "@turf/turf";
import { DEFAULT_USER_CONFIG } from "@/lib/screen/config";
import type { ScreenInput } from "@/lib/screen/types";
import type { LatLon } from "@/lib/screen/util";
import type { ParcelRecord } from "@/lib/geo/parcels";
import type { WorkingParcel } from "@/lib/client/parcelStore";
import { rescreenInput } from "@/lib/client/rescreenInput";
import { pieceOf, PIECE_SIDES } from "@/lib/split/scenario";
import { loadFixture } from "./fixtures";

const MUD = "grayson-mud-creek-6273" as const;

/** The line: past the parcel's north and south edges by 8% of its height, along its centroid's longitude. */
export function mudSplitLine(): { a: LatLon; b: LatLon } {
  const geo = loadFixture(MUD).input.polygon;
  const [, minLat, , maxLat] = bbox(geo);
  const [lon] = centroid(geo).geometry.coordinates as [number, number];
  const pad = (maxLat - minLat) * 0.08;
  return { a: [maxLat + pad, lon], b: [minLat - pad, lon] };
}

/** Mud Creek as the e2e's import makes it: one saved piece, nothing drawn. */
export function mudParcel(): WorkingParcel {
  const { input } = loadFixture(MUD);
  const piece: ParcelRecord = {
    geo: input.polygon as ParcelRecord["geo"],
    props: input.props ?? {},
    source: "saved",
    multiPart: false,
  };
  // Only what a piece's screen reads: the parts, the split, the house, the lines and the chosen driveway.
  return {
    pieces: [piece],
    split: null,
    house: null,
    markup: [],
    drivewayLine: null,
    scenarios: [],
  } as unknown as WorkingParcel;
}

/** Each piece's screen input, left then right, as the app's Grade both pieces makes them. */
export function mudPieceInputs(): ScreenInput[] {
  const p = mudParcel();
  const line = mudSplitLine();
  return PIECE_SIDES.map((side) => {
    const piece = pieceOf(p, line, side);
    const made = piece ? rescreenInput(piece.parcel, DEFAULT_USER_CONFIG) : null;
    if (!made) throw new Error(`Mud Creek's ${side} piece didn't derive`);
    return made.input;
  });
}
