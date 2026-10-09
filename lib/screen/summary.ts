/**
 * The plain-text summary ("Copy summary") and the default name for saving a parcel. Ported verbatim
 * (proto summaryText, defaultName). Also used by Phase 5's email digest, which is why it lives in the
 * pipeline and not the UI.
 */
import { fmt } from "../format";
import { splitDrives } from "./driveList";
import type { ScreenResult } from "./types";

/** The parcel number if the county record has one, else the evaluation point, else "Parcel". */
export function defaultName(props: Record<string, unknown>, result: Pick<ScreenResult, "point">): string {
  const id = props.parno || props.PARCELID || props.pin;
  if (id) return String(id);
  const at = result.point?.ll;
  return at ? `${at[0].toFixed(4)}, ${at[1].toFixed(4)}` : "Parcel";
}

export function summaryText(R: ScreenResult): string {
  const t = R.terrain,
    s = R.sun;
  const lines = [
    `PARCEL SCREEN — ${fmt(R.acres, 1)} ac — ${R.verdict.toUpperCase()}`,
    ...R.flags.map((f) => `! ${f.t}`),
  ];
  if (t)
    lines.push(
      `Elev ${fmt(t.elevMinFt)}–${fmt(t.elevMaxFt)} ft, ${fmt(t.acresUnder15, 1)} ac under 15% grade, ${R.benches?.length ?? 0} benches`,
    );
  if (s)
    lines.push(
      `At ${R.focus ? R.focus.label : "best bench"}${R.point ? ` (${fmt(R.point.elevFt)} ft)` : ""}: Dec 21 direct sun ${fmt(s.decDirectH, 1)} h, noon clearance ${fmt(s.noonClearance, 1)}°`,
    );
  if (R.house && !("outside" in R.house))
    lines.push(`Existing house scores ${R.house.score}${R.house.veto ? " — " + R.house.veto : ""}`);
  if (R.sky)
    lines.push(
      `Dark sky ${R.sky.score}/100: ${R.sky.mag.toFixed(2)} mag/arcsec² zone ${R.sky.zone}; core clearance ${R.sky.coreClear.toFixed(0)}°`,
    );
  if (R.sites)
    for (const x of R.sites.slice(0, 2))
      lines.push(
        `Site #${x.rank} (${x.score}): ${x.ll[0].toFixed(5)}, ${x.ll[1].toFixed(5)} — ${x.why.join("; ")}`,
      );
  // The closer non-chain grocery (owner, #81) is report text only; the copied summary stays as it was.
  if (R.drives) for (const d of splitDrives(R.drives).destinations) lines.push(`${d.label}: ${d.min} min`);
  return lines.join("\n");
}
