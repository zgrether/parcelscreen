/** The Dark skies section (proto L1492–1499). */
import { compass, fmt } from "../format";
import type { PartialScreenResult } from "../screen/types";
import type { FactRow } from "./facts";
import { onMap, said, type Heading, type Part } from "./parts";
import type { EvaluationPoint } from "./point";

export function skyHeading(r: PartialScreenResult, p: EvaluationPoint | null): Heading {
  return {
    title: "Dark skies",
    ...(r.sky ? { sub: `score ${r.sky.score}/100 at ${p?.label ?? "the largest house site"}` } : {}),
    slug: "dark-skies",
    help: "h-sky",
  };
}

export interface SkyView {
  rows: FactRow[];
  notes: string[];
  caveat: Part[];
}

/** Null until the sky step has run. */
export function skyView(r: PartialScreenResult): SkyView | null {
  const k = r.sky;
  if (!k) return null;
  const rows: FactRow[] = [
    { label: "Sky at zenith", value: `${fmt(k.mag, 2)} mag/arcsec² — zone ${k.zone}, ${k.zoneWord}` },
    {
      label: "Artificial vs natural light",
      value: `${k.ratio < 0.1 ? k.ratio.toFixed(3) : k.ratio.toFixed(2)}× (1.0 = half the sky's light is man-made)`,
    },
    { label: "Milky Way core, peak altitude", value: `${fmt(k.coreAlt, 1)}° above due south` },
    {
      label: "Southern ridge / clearance",
      value: `${fmt(k.ridgeS, 1)}° / ${fmt(k.coreClear, 1)}° (after ${r.params.canopyDeg}° canopy)`,
    },
  ];
  if (k.dome)
    rows.push({
      label: "Brightest patch to the south",
      value: `${k.dome.ratio.toFixed(2)}× at ${Math.round(k.dome.km * 0.621)} mi, bearing ${k.dome.az}° (${compass(k.dome.az)})`,
    });
  return {
    rows,
    notes: k.notes,
    caveat: [
      said(
        `Zenith brightness from the Light Pollution Atlas ${k.year} (Lorenz, after Falchi/Cinzano), 1/120° grid. The atlas is zenith-only, so the southern-dome line samples the ground map toward the core as a proxy. The core is up in the evening from June to September`,
      ),
      onMap("; toggle the light-pollution overlay on the map to see the county-scale picture"),
      said("."),
    ],
  };
}
