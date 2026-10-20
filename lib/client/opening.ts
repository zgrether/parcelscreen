import type { ParcelStatus } from "./parcelStore";

/**
 * Where the app opens (owner, #128; #132 review): the list when at least one favorite isn't archived, else the map (a
 * household whose favorites are all archived starts by finding new ones). Step 8: a parcel only in someone's History
 * doesn't count; the list opens on Favorites.
 */
export const openingPage = (built: readonly { status: ParcelStatus }[]): "/library" | "/explore" =>
  built.some((p) => p.status === "saved") ? "/library" : "/explore";
