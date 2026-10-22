/** Privacy (step 11, docs/plans/step-11-new-data.md §2.3): each site's houses around it, and the sources' caveat. */
import { NOT_MEASURED, OUTSIDE_AREA } from "@/lib/report/climate";
import { nearestWords, PRIVACY_CAVEAT, PRIVACY_SOURCES, privacyView } from "@/lib/report/privacy";
import { fmt } from "@/lib/format";
import type { BlockProps } from "./types";

export function Privacy({ result }: BlockProps) {
  const v = privacyView(result);
  if (!v) return <p className="tiny muted">Privacy: {NOT_MEASURED}.</p>;
  if (v.outside || !v.rows.length) return <p className="tiny muted">Privacy: {OUTSIDE_AREA}.</p>;
  return (
    <>
      <table className="facts">
        <tbody>
          {v.rows.map((x) => (
            <tr key={x.label}>
              <td>
                {x.label}
                <div className="tiny muted">nearest house {nearestWords(x.nearestFt)}</div>
              </td>
              <td className="num">
                {fmt(x.near)} within a quarter mile
                <div>{fmt(x.inSight)} in sight within a mile</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="tiny muted">{PRIVACY_CAVEAT}</p>
      <p className="tiny muted">Sources: {PRIVACY_SOURCES}</p>
    </>
  );
}
