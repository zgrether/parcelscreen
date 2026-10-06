/** Floodplain (proto L1547): FEMA's flood zones on the parcel, or that there's no mapping here. */
import { floodView } from "@/lib/report/surroundings";
import type { BlockProps } from "./types";

export function Floodplain({ result }: BlockProps) {
  const v = floodView(result);
  if (!v) return null;
  return (
    <p>
      {v.strong && <b>{v.strong}</b>}
      {v.text}
    </p>
  );
}
