/**
 * The horizon fan (proto drawHorizon, L1232–1243): from the evaluation point, one ray every 10° from east
 * through west to the ridge that forms the skyline in that direction, red where that ridge (plus the canopy
 * allowance) blocks the December sun when it's there, white where the sun clears it. Pure, from the live
 * session's horizon (the ridge cells are on the wide DEM, which a kept result doesn't have).
 */
import type { Feature, FeatureCollection, LineString } from "geojson";
import { compass } from "../format";
import type { LatLon } from "../geo/types";
import { rcToLL } from "../screen/dem";
import type { SessionView } from "../screen/worker-protocol";

export interface RayProps {
  az: number;
  blocks: boolean;
  /** The prototype's tooltip, verbatim. */
  tip: string;
}

export function fanRays(
  view: SessionView,
  from: LatLon,
  canopyDeg: number,
): FeatureCollection<LineString, RayProps> {
  const features: Feature<LineString, RayProps>[] = [];
  const { horizon, decAltByAz: altByAz, dWide } = view;
  if (horizon && altByAz && dWide)
    for (const hp of horizon) {
      if (!hp.rc || hp.az < 90 || hp.az > 270 || hp.az % 10) continue;
      const sunAlt = altByAz[hp.az / 5];
      if (sunAlt == null) continue;
      const blocks = hp.angle + canopyDeg >= sunAlt;
      const end = rcToLL(dWide, hp.rc[0], hp.rc[1]);
      features.push({
        type: "Feature",
        properties: {
          az: hp.az,
          blocks,
          tip: `${hp.az}° (${compass(hp.az)}): skyline ${hp.angle.toFixed(1)}° up, sun ${sunAlt.toFixed(1)}° — ${blocks ? "blocked" : "clear"}`,
        },
        geometry: {
          type: "LineString",
          coordinates: [
            [from[1], from[0]],
            [end[1], end[0]],
          ],
        },
      });
    }
  return { type: "FeatureCollection", features };
}
