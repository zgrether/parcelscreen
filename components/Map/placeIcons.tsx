/**
 * The Places layer's icons (step 14d plan §5): a white glyph on a disc of the kind's colour, on a white ring for
 * contrast over aerials and dark basemaps. Drawn once per map into its images (map.addImage), at twice their size for
 * sharp edges on high-density screens.
 */
import type { Map as MlMap } from "maplibre-gl";
import type { PlaceKind } from "@/lib/places/layer";

export type PlaceIcon = Exclude<PlaceKind, "launch"> | "launchFlat" | "launchRiver";

/** Each icon's disc, and the kind's ring on its clusters. */
export const PLACE_COLOR: Record<PlaceIcon, string> = {
  er: "#b3261e",
  airport: "#3d4f86",
  trailhead: "#7a4f2a",
  grocery: "#2f7a46",
  longTrail: "#7b4b94",
  launchFlat: "#1f6fb2",
  launchRiver: "#2e8540",
};

/** Glyphs on a 24-unit grid (SVG path data). */
const PADDLE =
  "M17.6 2.2c1.5-1.5 4.7 1.7 3.2 3.2l-3.4 3.4-3.2-3.2zM13.3 6.5l3.2 3.2-8.4 8.4.9.9-2.2 2.2-3.2-3.2 2.2-2.2.9.9z";
const GLYPH: Record<PlaceIcon, string> = {
  er: "M9.5 4h5v5.5H20v5h-5.5V20h-5v-5.5H4v-5h5.5z",
  airport:
    "M21 15.5v-2l-7.5-4.7V3.8a1.5 1.5 0 0 0-3 0v5L3 13.5v2l7.5-2.4v5.1l-2 1.5V21l3.5-1 3.5 1v-1.3l-2-1.5v-5.1z",
  trailhead: "M7 3h5.5v7.5l5.8 2.6c1.4.6 1.9 1.6 1.9 2.9V18H4v-3.4l3-1.4z",
  grocery:
    "M2 3h3l2.6 10.2c.2.5.6.8 1.1.8h9.1c.5 0 .9-.3 1-.8L21 6H6.4L5.9 4H2zM9 17.5a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5zm8 0a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5z",
  longTrail:
    "M6 11.5a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5zm0 1.6a2.15 2.15 0 1 1 0 4.3 2.15 2.15 0 0 1 0-4.3zM18 11.5a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5zm0 1.6a2.15 2.15 0 1 1 0 4.3 2.15 2.15 0 0 1 0-4.3zM11 6h4v1.6h-1.5l3.4 5.6-1.4.8-1.1-1.8-3 3.6h-4l.5-1.6h2.7l2.6-3.1-.9-1.5-2.8 3.4-1.2-1z",
  launchFlat: PADDLE,
  launchRiver: PADDLE,
};

/** An icon as the Map layers panel shows it beside its toggle (PlacesControls): the map's disc, in SVG. */
export function PlaceIconSvg({ icon }: { icon: PlaceIcon }) {
  return (
    <svg className="place-key" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill={PLACE_COLOR[icon]} />
      <path d={GLYPH[icon]} fill="#ffffff" fillRule="evenodd" transform="translate(4.5 4.5) scale(0.625)" />
    </svg>
  );
}

const SIZE = 48; // canvas pixels; shown at 24 px (pixelRatio 2)

export const iconId = (icon: PlaceIcon): string => `place-${icon}`;

function draw(icon: PlaceIcon): ImageData | null {
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const g = c.getContext("2d");
  if (!g) return null;
  const r = SIZE / 2;
  g.beginPath();
  g.arc(r, r, r - 1, 0, Math.PI * 2);
  g.fillStyle = "#ffffff";
  g.fill();
  g.beginPath();
  g.arc(r, r, r - 5, 0, Math.PI * 2);
  g.fillStyle = PLACE_COLOR[icon];
  g.fill();
  // The glyph fills the inner disc's middle 26 px.
  g.translate(11, 11);
  g.scale(26 / 24, 26 / 24);
  g.fillStyle = "#ffffff";
  g.fill(new Path2D(GLYPH[icon]), "evenodd");
  return g.getImageData(0, 0, SIZE, SIZE);
}

/** Every icon in the map's images, once (a style that already has one keeps it). */
export function addPlaceIcons(map: MlMap): void {
  for (const icon of Object.keys(GLYPH) as PlaceIcon[]) {
    if (map.hasImage(iconId(icon))) continue;
    const img = draw(icon);
    if (img) map.addImage(iconId(icon), img, { pixelRatio: 2 });
  }
}
