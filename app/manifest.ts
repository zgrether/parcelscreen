/** The web app manifest (step 17c): installable, standalone, opening on the explorer. */
import type { MetadataRoute } from "next";

/** The toolbar's ink and the paper token (app/globals.css). */
export const THEME_COLOR = "#1c2620";
export const BACKGROUND_COLOR = "#e7eae3";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Parcel Screen",
    short_name: "Parcel Screen",
    description: "Kill parcels from your desk, before you drive.",
    start_url: "/explore",
    scope: "/",
    display: "standalone",
    theme_color: THEME_COLOR,
    background_color: BACKGROUND_COLOR,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
