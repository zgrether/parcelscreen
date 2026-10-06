/** Pieces the report blocks share: a facts table, and text made of parts (some pointing at the map). */
import type { FactRow } from "@/lib/report/facts";
import { joinParts, type Part } from "@/lib/report/parts";
import { showsMap, type Variant } from "./types";

export function Facts({ rows }: { rows: readonly FactRow[] }) {
  return (
    <table className="facts">
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td>{r.label}</td>
            <td className="num">
              {r.value}
              {r.note && <div className="tiny muted">{r.note}</div>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A small muted paragraph; parts that point at the map are left out where there's no map. */
export function Note({ parts, variant }: { parts: readonly Part[]; variant: Variant }) {
  const text = joinParts(parts, showsMap(variant));
  return text ? <p className="tiny muted">{text}</p> : null;
}
