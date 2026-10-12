/** Getting there and getting out (proto L1551–1555): drive times, groceries, trailheads. */
import { gettingThereView, NO_GROCER_CAVEAT } from "@/lib/report/surroundings";
import { Note } from "./shared";
import { showsMap, type BlockProps } from "./types";
import { joinParts } from "@/lib/report/parts";
import { fmt } from "@/lib/format";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";

const KM_PER_MI = 1.609344;

export function GettingThere({ result, variant }: BlockProps) {
  const v = gettingThereView(result);
  if (!v) return null;
  return (
    <>
      <table className="facts">
        <tbody>
          {v.drives.map((d) => (
            <tr key={d.label}>
              <td>
                {d.label}
                {d.name && <div className="tiny muted">{d.name}</div>}
              </td>
              <td className="num">
                {d.value}
                {d.closer && <div>{d.closer}</div>}
              </td>
            </tr>
          ))}
          {v.grocers && (
            <tr>
              <td>Groceries within 28 mi (straight line)</td>
              <td>
                {v.grocers.length ? (
                  v.grocers.map((g, i) => (
                    <div key={i}>
                      {g.name} <span className="tiny muted">{g.mi}</span>
                    </div>
                  ))
                ) : (
                  <>
                    none in OSM
                    <div className="tiny muted">{NO_GROCER_CAVEAT}</div>
                  </>
                )}
              </td>
            </tr>
          )}
          {v.trailheads && (
            <tr>
              {/* The search's own radius (#118 review: since it reaches the Trails row's last cutoff, 22 mi; was 12). */}
              <td>Trailheads within {fmt(SCREEN_CONSTANTS.near.trailheadKm / KM_PER_MI)} mi</td>
              <td className="num">
                {v.trailheads.count}
                {v.trailheads.more.length > 0 && (
                  <span className="tiny muted">{joinParts(v.trailheads.more, showsMap(variant))}</span>
                )}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {v.notes.map((n) => (
        <Note key={n} parts={[{ text: n }]} variant={variant} />
      ))}
      <p className="tiny muted">{v.caveat}</p>
    </>
  );
}
