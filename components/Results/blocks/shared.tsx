/** Pieces the report blocks share: facts tables, text made of parts, rich lists, and site cards. */
import type { FactRow, RichItem, SiteCard as Card } from "@/lib/report/facts";
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
              {r.strong && <b>{r.strong}</b>}
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

export function RichList({ items }: { items: readonly RichItem[] }) {
  return (
    <ul className="plain mt-1">
      {items.map((it, i) => (
        <li key={i}>
          {it.strong && <b>{it.strong}</b>}
          {it.text}
        </li>
      ))}
    </ul>
  );
}

/** A ranked spot: its marker, title, grade chips, the muted summary, factor points and notes. */
export function SiteCard({ card }: { card: Card }) {
  return (
    <div className="site">
      <div>
        <span className={`n ${card.marker.style}`}>{card.marker.text}</span>
        <b className="font-semibold">{card.title}</b>
        {card.chips.map((c) => (
          <span key={c.text} className={`grade ${c.kind}`} title={c.title}>
            {c.text}
          </span>
        ))}{" "}
        <span className="muted">{card.summary}</span>
      </div>
      {card.factors.length > 0 && (
        <div className="factors">
          {card.factors.map((f) => (
            <span key={f.label}>
              {f.label} <b>{f.value}</b>
            </span>
          ))}
        </div>
      )}
      {card.items.length > 0 && <RichList items={card.items} />}
    </div>
  );
}
