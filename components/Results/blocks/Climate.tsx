/** Climate (step 11, docs/plans/step-11-new-data.md §2.2): each site's normals, the stations, and the sources' caveat. */
import {
  CLIMATE_CAVEAT,
  CLIMATE_SOURCES,
  climateView,
  NOT_MEASURED,
  OUTSIDE_AREA,
} from "@/lib/report/climate";
import { fmt } from "@/lib/format";
import type { BlockProps } from "./types";

export function Climate({ result }: BlockProps) {
  const v = climateView(result);
  if (!v) return <p className="tiny muted">Climate: {NOT_MEASURED}.</p>;
  if (v.outside || !v.rows.length) return <p className="tiny muted">Climate: {OUTSIDE_AREA}.</p>;
  return (
    <>
      <table className="facts">
        <tbody>
          {v.rows.map((x) => (
            <tr key={x.label}>
              <td>
                {x.label}
                <div className="tiny muted">{fmt(x.elevFt)} ft</div>
              </td>
              <td className="num">
                January low {fmt(x.janLowF)} °F
                <div>July high {fmt(x.julHighF)} °F</div>
              </td>
            </tr>
          ))}
          {v.stations.map((st) => (
            <tr key={st.name}>
              <td>
                Snow and frost
                <div className="tiny muted">{st.name}</div>
              </td>
              <td className="num">{st.line}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="tiny muted">{CLIMATE_CAVEAT}</p>
      <p className="tiny muted">Sources: {CLIMATE_SOURCES}</p>
    </>
  );
}
