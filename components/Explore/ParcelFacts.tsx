/** A parcel record's facts table (proto L693–704): the side panel's and the Info panel's. */
import { boundarySourceLabel, parcelFacts, type ParcelRecord } from "@/lib/geo/parcels";

export function ParcelFacts({ parcel }: { parcel: ParcelRecord }) {
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
