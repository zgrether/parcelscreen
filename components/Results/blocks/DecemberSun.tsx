/** December sun (proto L1474–1490), at the evaluation point: direct sun, the horizon, noon clearance. */
import { sunView } from "@/lib/report/sun";
import { HorizonChart } from "./HorizonChart";
import { Facts, Note } from "./shared";
import type { BlockProps } from "./types";

export function DecemberSun({ result, point, variant }: BlockProps) {
  const v = sunView(result, point);
  if (!v) return null;
  return (
    <>
      {v.point && <Facts rows={[v.point]} />}
      <Note parts={v.moveHint} variant={variant} />
      {v.chart && <HorizonChart chart={v.chart} />}
      <Facts rows={v.rows} />
      <Note parts={v.caveat} variant={variant} />
    </>
  );
}
