/** December sun (proto L1474–1490), at the evaluation point: direct sun, the horizon, noon clearance. */
"use client";
import { sunView } from "@/lib/report/sun";
import { useOpenGround } from "@/components/Ground/GroundContext";
import { HorizonChart } from "./HorizonChart";
import { Facts, Note } from "./shared";
import { showsMap, type BlockProps } from "./types";

export function DecemberSun({ result, point, variant }: BlockProps) {
  const v = sunView(result, point);
  // The ground viewer (17a), on screen only: the print variant drops it, as it drops the map's hints.
  const openGround = useOpenGround();
  if (!v) return null;
  return (
    <>
      {v.point && <Facts rows={[v.point]} />}
      <Note parts={v.moveHint} variant={variant} />
      {v.chart && <HorizonChart chart={v.chart} />}
      {openGround && showsMap(variant) && (
        <p className="tiny">
          <button className="link-btn" onClick={openGround}>
            See it from here
          </button>{" "}
          <span className="muted">— the skyline and the sun&apos;s path, standing at this point.</span>
        </p>
      )}
      <Facts rows={v.rows} />
      <Note parts={v.caveat} variant={variant} />
    </>
  );
}
