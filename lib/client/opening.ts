import type { ParcelStatus } from "./parcelStore";

/**
 * Where the app opens (owner, #128; #132 review): the list when at least one parcel isn't archived, else the map
 * (a household whose parcels are all archived starts by finding new ones).
 */
export const openingPage = (built: readonly { status: ParcelStatus }[]): "/library" | "/explore" =>
  built.some((p) => p.status !== "archived") ? "/library" : "/explore";
