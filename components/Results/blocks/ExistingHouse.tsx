/** The existing house (proto L1500–1505): the house scored like a site, and how it compares to the best. */
import { houseView } from "@/lib/report/house";
import { SiteCard } from "./shared";
import type { BlockProps } from "./types";

export function ExistingHouse({ result }: BlockProps) {
  const v = houseView(result);
  if (!v) return null;
  if (v.outside) return <p>The bulls-eye is outside the elevation window — move it onto the parcel.</p>;
  return (
    <>
      <SiteCard card={v.card} />
      <p className="mt-1.5">{v.comparison}</p>
    </>
  );
}
