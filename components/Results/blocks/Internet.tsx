/** Satellite internet (step 11, docs/plans/step-11-new-data.md §2.7): the parcel's best spot for a satellite dish. */
import { NOT_MEASURED } from "@/lib/report/climate";
import { DISH_CAVEAT } from "@/lib/report/internet";
import type { BlockProps } from "./types";

export function Internet({ result }: BlockProps) {
  const d = result.dish;
  if (d === undefined) return <p className="tiny muted">Satellite internet: {NOT_MEASURED}.</p>;
  return (
    <>
      <table className="facts">
        <tbody>
          <tr>
            <td>
              Best spot for a dish
              {d && (
                <div className="tiny muted">
                  {d.ll[0].toFixed(5)}, {d.ll[1].toFixed(5)}
                </div>
              )}
            </td>
            <td className="num">{d ? `${Math.round(d.clearShare * 100)}% open sky` : "none found"}</td>
          </tr>
        </tbody>
      </table>
      <p className="tiny muted">{DISH_CAVEAT}</p>
    </>
  );
}
