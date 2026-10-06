/**
 * Still unknown (proto L1557): the checklist no dataset answers. The boxes are plain (uncontrolled) inputs:
 * ticking them isn't kept in Phase 0 (Q6). The Phase 1 parcel page passes the user's ticks in `checked`.
 */
import { unknownView } from "@/lib/report/unknown";
import type { BlockProps } from "./types";

export function StillUnknown({ result, checked }: BlockProps & { checked?: readonly boolean[] }) {
  const items = unknownView(result);
  if (!items) return null;
  return (
    <ul className="check">
      {items.map((u, i) => (
        <li key={i}>
          <input type="checkbox" id={`unknown-${i}`} defaultChecked={checked?.[i] ?? false} />
          <label htmlFor={`unknown-${i}`}>{u}</label>
        </li>
      ))}
    </ul>
  );
}
