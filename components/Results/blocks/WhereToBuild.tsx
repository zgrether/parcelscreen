/**
 * Where to build (proto L1506–1514): the top three sites, the side-by-side table, shelves for outbuildings,
 * and the benches the soils excluded.
 */
import { buildView, COMPARE_COLUMNS, type CompareRow } from "@/lib/report/build";
import { Note, RichList, SiteCard } from "./shared";
import type { BlockProps } from "./types";

export function WhereToBuild({ result, variant }: BlockProps) {
  const v = buildView(result);
  if (!v) return null;
  return (
    <>
      {v.none && <p>{v.none}</p>}
      {v.sites.map((card) => (
        <SiteCard key={card.marker.text} card={card} />
      ))}
      {v.compare.length > 0 && <CompareTable rows={v.compare} note={v.compareNote} />}
      {v.shelves && (
        <div className="site">
          <b className="font-semibold">Shelves for a shop, barn or garage</b>
          <RichList items={v.shelves.items} />
          <p className="tiny muted">{v.shelves.note}</p>
        </div>
      )}
      {v.excluded.length > 0 && (
        <div className="site">
          <b className="font-semibold">Excluded</b>
          <RichList items={v.excluded} />
        </div>
      )}
      <Note parts={v.footer} variant={variant} />
    </>
  );
}

/** The side-by-side table (proto compareTable, L1568–1575): every ranked site, and the house. */
export function CompareTable({ rows, note }: { rows: readonly CompareRow[]; note: string }) {
  return (
    <div className="site">
      <b className="font-semibold">Side by side</b>
      <div className="cmpwrap">
        <table className="cmp">
          <thead>
            <tr>
              {COMPARE_COLUMNS.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.cells[0]!.text}>
                {r.cells.map((c, i) => (
                  <td key={i}>
                    {c.strong && <b>{c.strong}</b>}
                    {c.text}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tiny muted">{note}</p>
    </div>
  );
}
