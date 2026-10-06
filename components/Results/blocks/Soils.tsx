/** Soils (proto L1536–1546): each map unit inside the line, each soil in it, in plain language. */
import { soilsView } from "@/lib/report/soils";
import { Note } from "./shared";
import type { BlockProps } from "./types";

export function Soils({ result, variant }: BlockProps) {
  const v = soilsView(result);
  if (!v) return null;
  return (
    <>
      <Note parts={v.intro} variant={variant} />
      {v.units.length === 0 && <p className="muted">{v.none}</p>}
      {v.units.map((u) => (
        <div key={u.name} className="soil-unit">
          <div className="soil-unit-head">
            <i style={{ background: u.color ?? "var(--color-rule)" }} />
            <b className="font-semibold">{u.name}</b>
            {u.acres && <span className="tiny muted">{u.acres}</span>}
          </div>
          {u.components.map((c, i) => (
            <div key={i} className="soil-comp">
              <div>
                <b className="font-medium">{c.name}</b> <span className="tiny muted">{c.share}</span>
              </div>
              <div className="mt-0.5">
                <span className="muted">House &amp; septic</span> — {c.house}
              </div>
              <div>
                <span className="muted">Garden &amp; animals</span> — {c.land}
              </div>
              <div className="tiny muted mt-0.5">{c.ratings}</div>
            </div>
          ))}
        </div>
      ))}
      {/* Q4: in the prototype this was only in the help; the parcel page and its PDF need it here. */}
      <p className="tiny muted">{v.scale}</p>
    </>
  );
}
