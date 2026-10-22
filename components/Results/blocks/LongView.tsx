/** Long view (step 11, docs/plans/step-11-new-data.md §2.4): each site's view, and how it's traced. */
import { NOT_MEASURED } from "@/lib/report/climate";
import { openPct, VIEW_CAVEAT, VIEW_TABLE_NOTE, viewShort, viewView } from "@/lib/report/view";
import { compass } from "@/lib/format";
import type { BlockProps } from "./types";

export function LongView({ result }: BlockProps) {
  const v = viewView(result);
  if (!v) return <p className="tiny muted">Long view: {NOT_MEASURED}.</p>;
  return (
    <>
      <table className="facts">
        <tbody>
          {v.rows.map((x) => (
            <tr key={x.label}>
              <td>{x.label}</td>
              <td className="num">
                {viewShort(x.view)}
                {x.view.dirDeg !== null && openPct(x.view) < 100 && (
                  <div>toward the {compass(x.view.dirDeg)}</div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="tiny muted">{VIEW_TABLE_NOTE}</p>
      <p className="tiny muted">{VIEW_CAVEAT}</p>
    </>
  );
}
