/** A parcel record's facts table (proto L693–704): the side panel's and the Info panel's. */
import { boundarySourceLabel, parcelFacts, type ParcelRecord } from "@/lib/geo/parcels";

/**
 * `unscreened`: parts of a multi-part record too far from the rest to bridge (follow-up 29). A record with all
 * its parts kept (`parts`) is screened whole and needs no note; one kept before then (no `parts`) screened its
 * first part only, as the prototype did.
 */
export function ParcelFacts({
  parcel,
  unscreened,
}: {
  parcel: ParcelRecord;
  unscreened?: { acres: number; parts: number } | undefined;
}) {
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
        {parcel.multiPart && (!parcel.parts || unscreened) && (
          <tr>
            <td>Note</td>
            <td>
              Multi-part parcel: only the first part screened
              {unscreened &&
                `. ${unscreened.acres.toFixed(2)} ac in ${unscreened.parts} other part${unscreened.parts === 1 ? "" : "s"} not screened.`}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
