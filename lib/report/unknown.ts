/**
 * Still unknown (proto L1557): what no dataset answers, as a checklist. Shown once the run has finished.
 * The ticks are the user's: not kept in Phase 0, as in the prototype (Q6); Phase 1 stores them with the
 * parcel and passes them back in.
 */
import type { PartialScreenResult } from "../screen/types";
import type { Heading } from "./parts";
import { isPartial } from "./verdict";

export const unknownHeading: Heading = {
  title: "Still unknown",
  sub: "not in any dataset",
  slug: "still-unknown",
  help: "h-unknown",
};

export const STILL_UNKNOWN = [
  "Legal access: deeded, recorded, width, maintenance agreement",
  "Deed restrictions / CC&Rs — read the actual recorded document",
  "Severed mineral or timber rights — check the deed chain, not the listing",
  "Utility extension quote from the power co-op, by parcel ID",
  "Neighboring well depths and yields (county health department)",
  "Septic: get a soil scientist's opinion on the bench, not the pin",
  "Whether RV or shop-house occupancy during the build is lawful (zoning office)",
  "Homeowner's insurance quote for the address before you fall in love",
  "Cell service and the Starlink sky view from the bench",
] as const;

/** Null while the run is going (the prototype shows the checklist only on a finished run). */
export const unknownView = (r: PartialScreenResult): readonly string[] | null =>
  isPartial(r) ? null : STILL_UNKNOWN;
