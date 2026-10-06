/** Where to garden (proto L1533–1535): the top garden patches, frost position first. */
import { gardenView } from "@/lib/report/garden";
import { SiteCard } from "./shared";
import type { BlockProps } from "./types";

export function WhereToGarden({ result }: BlockProps) {
  const v = gardenView(result);
  if (!v) return null;
  return (
    <>
      {v.patches.map((card) => (
        <SiteCard key={card.marker.text} card={card} />
      ))}
      <p className="tiny muted">{v.note}</p>
    </>
  );
}
