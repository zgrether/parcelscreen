// Small parcels for client tests: squares about 180 m on a side near Grayson Co., VA.
import { polygon } from "@turf/turf";
import { plainParcel, type WorkingParcel } from "@/lib/client/parcelStore";
import type { ParcelRecord } from "@/lib/geo/parcels";

export const T0 = "2026-10-05T12:00:00.000Z";

export const square = (x0: number) =>
  polygon([
    [
      [x0, 36.628],
      [x0 + 0.002, 36.628],
      [x0 + 0.002, 36.63],
      [x0, 36.63],
      [x0, 36.628],
    ],
  ]);

/** A VA county record (FIPS 51077, Grayson). */
export const county = (x0: number, id: string): ParcelRecord => ({
  geo: square(x0),
  props: { PARCELID: id, FIPS: "51077" },
  source: "https://vginmaps.vdem.virginia.gov/x",
  multiPart: false,
});

/** A built History entry. */
export const built = (key: string, over: Partial<WorkingParcel> = {}): WorkingParcel => ({
  ...plainParcel(county(-81.355, "52-47A"), T0),
  key,
  notes: "kept",
  ...over,
});
