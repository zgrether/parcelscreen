/**
 * The breakdown bar (value-ranking.md §8; VR7): one parcel's grade, row by row, on the grade's own scale (F 0 to A 4).
 * Each graded row is a segment as wide as the points it earns; what it loses is hatched after them; the grade lines
 * and the verdict's lines are marked across the bar. Under it, each row's weight share, grade, and points.
 */
import { fmt } from "@/lib/format";
import type { Breakdown } from "@/lib/report/breakdown";
import { ADJUSTED_TITLE } from "@/lib/report/adjustWords";

const at = (v: number, max: number) => `${(v / max) * 100}%`;

export function BreakdownBar({ b }: { b: Breakdown }) {
  return (
    <figure className="breakdown">
      <div className="bd-track" role="img" aria-label={`${fmt(b.points, 2)} of ${fmt(b.max)} points`}>
        {b.rows.map((r) => (
          <span
            key={r.key}
            className={`bd-seg g-${r.grade}`}
            style={{ width: at(r.earned, b.max) }}
            title={`${r.label}: ${r.grade}, +${fmt(r.earned, 2)}`}
          />
        ))}
        {b.rows.map((r) => (
          <span
            key={`${r.key}-lost`}
            className="bd-seg bd-lost"
            style={{ width: at(r.lost, b.max) }}
            title={`${r.label}: −${fmt(r.lost, 2)}`}
          />
        ))}
        {b.lines.map((l) => (
          <span key={l.label} className={`bd-line bd-${l.kind}`} style={{ left: at(l.at, b.max) }}>
            <span className="bd-line-label">{l.label}</span>
          </span>
        ))}
        <span className="bd-marker" style={{ left: at(b.points, b.max) }} aria-hidden="true" />
      </div>
      <figcaption>
        <table className="bd-table">
          <thead>
            <tr>
              <th scope="col">Row</th>
              <th scope="col">Grade</th>
              <th scope="col">Weight</th>
              <th scope="col">Earned</th>
              <th scope="col">Lost</th>
            </tr>
          </thead>
          <tbody>
            {b.rows.map((r) => (
              <tr key={r.key}>
                <th scope="row">
                  <span className={`bd-key g-${r.grade}`} aria-hidden="true" /> {r.label}
                </th>
                <td>
                  <span className={`card-grade small g-${r.grade}`}>{r.grade}</span>
                  {r.adjusted && (
                    <span className="adjusted-mark" title={ADJUSTED_TITLE} aria-label={ADJUSTED_TITLE}>
                      ✎
                    </span>
                  )}
                </td>
                <td>{fmt(r.share * 100)}%</td>
                <td>+{fmt(r.earned, 2)}</td>
                <td>{r.lost > 0 ? `−${fmt(r.lost, 2)}` : "0"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td />
              <td />
              <td>{fmt(b.points, 2)}</td>
              <td>−{fmt(b.max - b.points, 2)}</td>
            </tr>
          </tfoot>
        </table>
        {b.ungraded.length > 0 && (
          <p className="tiny muted">
            Not graded, so left out: {b.ungraded.map((u) => u.label.toLowerCase()).join(", ")}.
          </p>
        )}
      </figcaption>
    </figure>
  );
}
