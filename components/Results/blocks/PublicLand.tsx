/** Public land within a mile (proto L1549): protected areas near the parcel, and whether they adjoin it. */
import { publicLandView } from "@/lib/report/surroundings";
import type { BlockProps } from "./types";

export function PublicLand({ result }: BlockProps) {
  const v = publicLandView(result);
  if (!v) return null;
  return (
    <>
      {v.units.length ? (
        <ul className="plain">
          {v.units.map((u, i) => (
            <li key={i}>
              <b className="font-medium">{u.name}</b> <span className="muted">{u.meta}</span> —{" "}
              {u.where.strong ? <b>{u.where.text}</b> : u.where.text}; access {u.access}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{v.none}</p>
      )}
      <p className="tiny muted">{v.caveat}</p>
    </>
  );
}
