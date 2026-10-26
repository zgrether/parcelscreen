/** Paddling (step 14d, docs/plans/step-14d-places.md §4.2): the nearest lake launch by road, river put-ins, a pond. */
import { NOT_MEASURED } from "@/lib/report/climate";
import {
  flatLine,
  NO_FLATWATER,
  PADDLE_REACH,
  PADDLE_SOURCES,
  pondLine,
  riversLine,
} from "@/lib/report/paddling";
import { fmt } from "@/lib/format";
import type { BlockProps } from "./types";

export function Paddling({ result }: BlockProps) {
  const p = result.paddling;
  if (p === undefined) return <p className="tiny muted">Paddling: {NOT_MEASURED}.</p>;
  return (
    <>
      <table className="facts">
        <tbody>
          <tr>
            <td>Nearest lake or reservoir launch</td>
            <td className="num">
              {p.flat ? (
                <>
                  {flatLine(p.flat)}
                  <div>{fmt(p.flat.mi, 1)} mi drive</div>
                </>
              ) : (
                NO_FLATWATER
              )}
            </td>
          </tr>
        </tbody>
      </table>
      {p.rivers.length > 0 && <p className="tiny">{riversLine(p.rivers)}</p>}
      {p.pond && <p className="tiny">{pondLine(p.pond)}</p>}
      <p className="tiny muted">{PADDLE_REACH}</p>
      <p className="tiny muted">Sources: {PADDLE_SOURCES}</p>
    </>
  );
}
