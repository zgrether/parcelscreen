"use client";
/**
 * The panel's "Find the parcel" section (proto L209–225): how to find a parcel, and the open parcel's facts.
 * The coordinates search and the tools, with their split and combine readouts, are on the map (13e-2b, 13e-3).
 */
import { boundarySourceLabel, parcelFacts, type ParcelRecord } from "@/lib/geo/parcels";
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

/** The loaded parcel's facts (proto L693–704). */
function ParcelFacts({ parcel }: { parcel: ParcelRecord }) {
  const f = parcelFacts(parcel.geo, parcel.props);
  return (
    <table className="facts">
      <tbody>
        <tr>
          <td>Acres (from boundary)</td>
          <td className="num">{f.acres.toFixed(2)}</td>
        </tr>
        {f.owner && (
          <tr>
            <td>Owner of record</td>
            <td>{f.owner}</td>
          </tr>
        )}
        {f.parcelId && (
          <tr>
            <td>Parcel ID</td>
            <td>{f.parcelId}</td>
          </tr>
        )}
        {f.address && (
          <tr>
            <td>Site address</td>
            <td>{f.address}</td>
          </tr>
        )}
        {f.county && (
          <tr>
            <td>County</td>
            <td>{f.county}</td>
          </tr>
        )}
        <tr>
          <td>Boundary source</td>
          <td>{boundarySourceLabel(parcel.source, parcel.props)}</td>
        </tr>
        {parcel.multiPart && (
          <tr>
            <td>Note</td>
            <td>Multi-part parcel: only the first part screened</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
