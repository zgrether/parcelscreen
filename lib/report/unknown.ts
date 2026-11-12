/**
 * Still unknown (proto L1557): what no dataset answers, as a checklist. Shown once the run has finished.
 * The ticks are the user's: not kept in Phase 0, as in the prototype (Q6); Phase 1 stores them with the
 * parcel and passes them back in.
 */
import type { PartialScreenResult } from "../screen/types";
import type { Heading } from "./parts";
import { isPartial } from "./verdict";

export const unknownHeading: Heading = {
  title: "Questions for the agent",
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
  // Polish 2 (Z7, owner): "the bench" in plain words, after it.
  "Septic: get a soil scientist's opinion on the bench (the flat ground the site sits on), not the pin",
  "Whether RV or shop-house occupancy during the build is lawful (zoning office)",
  "Homeowner's insurance quote for the address before you fall in love",
  "Cell service and the Starlink sky view from the bench",
] as const;

/** Null while the run is going (the prototype shows the checklist only on a finished run). */
/** The raw-land items a house already here leaves out (existing-house plan §1d): the bench's septic, the build's occupancy. */
const RAW_LAND_ONLY = new Set<string>([STILL_UNKNOWN[5], STILL_UNKNOWN[6]]);

export const unknownView = (r: PartialScreenResult, existingHouse = false): readonly string[] | null =>
  isPartial(r) ? null : existingHouse ? STILL_UNKNOWN.filter((x) => !RAW_LAND_ONLY.has(x)) : STILL_UNKNOWN;
