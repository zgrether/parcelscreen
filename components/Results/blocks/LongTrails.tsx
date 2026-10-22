/** Long trails (step 11, docs/plans/step-11-new-data.md §2.6): the nearest long rail-trail by road, and the list. */
import { NOT_MEASURED } from "@/lib/report/climate";
import { LONG_TRAIL_REACH, LONG_TRAIL_SOURCES, TRAILS_LISTED } from "@/lib/report/longTrail";
import { fmt } from "@/lib/format";
import type { BlockProps } from "./types";

export function LongTrails({ result }: BlockProps) {
  const t = result.longTrail;
  if (t === undefined) return <p className="tiny muted">Bike to a long trail: {NOT_MEASURED}.</p>;
  return (
    <>
      <table className="facts">
        <tbody>
          <tr>
            <td>
              Nearest long trail
              {t && <div className="tiny muted">{t.trail}</div>}
            </td>
            <td className="num">
              {t ? (
                <>
                  {fmt(t.min)} min drive, {fmt(t.mi, 1)} mi
                  <div>at {t.point}</div>
                </>
              ) : (
                "none within reach"
              )}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="tiny muted">
        The trails looked for: {TRAILS_LISTED}. {LONG_TRAIL_REACH}
      </p>
      <p className="tiny muted">Sources: {LONG_TRAIL_SOURCES}</p>
    </>
  );
}
