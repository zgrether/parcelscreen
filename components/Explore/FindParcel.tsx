"use client";
/**
 * The panel's "Find the parcel" section (proto L209–225): how to find a parcel, and the open parcel's facts.
 * The coordinates search and the tools, with their split and combine readouts, are on the map (13e-2b, 13e-3).
 */
import { ParcelFacts } from "./ParcelFacts";
import { useExplore } from "./useExploreController";

export function FindParcel() {
  const ctl = useExplore();
  const { parcel, derived } = ctl;

  return (
    <section className="block">
      <h2>Find the parcel</h2>
      <p className="tiny muted">
        Pan the imagery to the spot you recognized in Google Earth (or paste its coordinates at the top of the
        map), then tap the lot to select it: zoom in until its outline shows. Tap it again to unselect. With
        no outline there, draw it from the toolbar.
      </p>
      <div className="mt-2">
        {parcel && <ParcelFacts parcel={parcel} />}
        {derived?.ok && derived.splitDropped && (
          <p className="tiny muted">The split no longer crosses the boundary, so it&apos;s left off.</p>
        )}
        {derived && !derived.ok && (
          <p className="tiny muted">
            These pieces don&apos;t make one boundary ({Math.round(derived.gapM)} m apart). Combine them again
            or close the parcel.
          </p>
        )}
      </div>
    </section>
  );
}
