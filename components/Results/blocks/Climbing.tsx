/** Climbing (step 17, docs/plans/step-17-climbing.md §4): the nearest rope and bouldering areas by road. */
import { NOT_MEASURED } from "@/lib/report/climate";
import {
  accessLine,
  boulderLine,
  CLIMB_REACH,
  CLIMB_SOURCES,
  NO_ROPE,
  ROPE_MEANS,
  ropeLine,
  withinLine,
} from "@/lib/report/climbing";
import { fmt } from "@/lib/format";
import type { BlockProps } from "./types";

export function Climbing({ result }: BlockProps) {
  const c = result.climbing;
  if (c === undefined) return <p className="tiny muted">Climbing: {NOT_MEASURED}.</p>;
  const access = c.rope ? accessLine(c.rope.id) : null;
  return (
    <>
      <table className="facts">
        <tbody>
          <tr>
            <td>Nearest rope area</td>
            <td className="num">
              {c.rope ? (
                <>
                  {ropeLine(c.rope)}
                  <div>{fmt(c.rope.mi, 1)} mi drive</div>
                </>
              ) : (
                NO_ROPE
              )}
            </td>
          </tr>
          <tr>
            <td>Nearest bouldering</td>
            <td className="num">{boulderLine(c.boulder)}</td>
          </tr>
          <tr>
            <td>Within the hour</td>
            <td className="num">{withinLine(c.ropeWithin)}</td>
          </tr>
        </tbody>
      </table>
      {access && <p className="tiny">{access}.</p>}
      <p className="tiny muted">
        {ROPE_MEANS}. {CLIMB_REACH}
      </p>
      <p className="tiny muted">Sources: {CLIMB_SOURCES}</p>
    </>
  );
}
