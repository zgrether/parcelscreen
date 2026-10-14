/**
 * The web app manifest (step 17c): installable and standalone. It opens at "/", which goes to the household's list
 * when it has parcels, else the map (WF2b). Its id stays the first start URL, so an installed app stays the same app.
 */
import type { MetadataRoute } from "next";

/** The toolbar's ink and the paper token (app/globals.css). */
export const THEME_COLOR = "#1c2620";
export const BACKGROUND_COLOR = "#e7eae3";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Parcel Screen",
    short_name: "Parcel Screen",
    description: "Kill parcels from your desk, before you drive.",
    id: "/explore",
    start_url: "/",
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
