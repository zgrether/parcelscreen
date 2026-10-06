/** Dark skies (proto L1492–1499), at the evaluation point: zenith brightness, the Milky Way core, domes. */
import { skyView } from "@/lib/report/sky";
import { Facts, Note } from "./shared";
import type { BlockProps } from "./types";

export function DarkSkies({ result, variant }: BlockProps) {
  const v = skyView(result);
  if (!v) return null;
  return (
    <>
      <Facts rows={v.rows} />
      <ul className="plain">
        {v.notes.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
      <Note parts={v.caveat} variant={variant} />
    </>
  );
}
