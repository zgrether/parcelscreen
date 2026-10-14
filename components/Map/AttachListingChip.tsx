"use client";
/**
 * "Attach Redfin listing (0 Ferney Creek Rd)" (owner, #130): after a listing-link search, the next parcel opened is
 * offered the link with one tap, which also names the parcel after the listing's street when it has no name. Nothing
 * is attached without the tap; × dismisses it (lib/client/attachListing.ts has the rules).
 */
import { useExplore } from "@/components/Explore/useExploreController";
import { attachLabel, offersListing } from "@/lib/client/attachListing";

export function AttachListingChip() {
  const ctl = useExplore();
  const s = ctl.searchedListing;
  if (ctl.state.mode || !offersListing(s, ctl.state.store.open, ctl.state.serial)) return null;
  return (
    <div className="switch-toast attach-listing" role="status">
      <button onClick={ctl.attachSearchedListing}>{attachLabel(s)}</button>
      <button className="attach-x" aria-label="Dismiss the listing link" onClick={ctl.dismissSearchedListing}>
        ×
      </button>
    </div>
  );
}
