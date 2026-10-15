/**
 * One icon per kind marked on a parcel (owner, after #136): a white glyph on a dark disc, drawn with round 2 px strokes
 * on a 24 px grid so it reads at 20 px on the aerials. The same drawing serves the Mark picker, the map's pins (DOM
 * markers, built as a string) and the Layers tree's rows.
 */
import type { MarkChoice } from "@/lib/client/markChoices";

interface Stroke {
  d: string;
  /** Dashed, for a track's ruts or a clearing's edge. */
  dash?: string;
  /** Filled white instead of stroked (the spring's drop, the power bolt). */
  fill?: boolean;
}

const GLYPH: Record<MarkChoice, readonly Stroke[]> = {
  house: [{ d: "M4.5 11.5 12 5l7.5 6.5M7 10v9h10v-9" }, { d: "M10.5 19v-4.5h3V19" }],
  track: [{ d: "M6 20c2-4 3-6 6-8s4-4 6-8", dash: "3 2.6" }],
  drive: [{ d: "M8 20 10.5 4M16 20 13.5 4" }, { d: "M12 18.5v-2M12 13v-2M12 7.5v-2" }],
  easement: [{ d: "M4.5 5v14M19.5 5v14" }, { d: "M8 12h8M13 9l3 3-3 3" }],
  spring: [{ d: "M12 4c3.2 4.4 5 7.2 5 9.8a5 5 0 0 1-10 0C7 11.2 8.8 8.4 12 4z", fill: true }],
  well: [{ d: "M5 9.5h14l-1.4 9.5H6.4zM12 9.5V4.5M9 4.5h6" }],
  septic: [{ d: "M4 10h16v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM8 10V6.5h3.5V10M14 14.5h3" }],
  power: [{ d: "M13.2 3 6.5 13h4.8L10.5 21l7-10.5h-4.8z", fill: true }],
  building: [{ d: "M4.5 20V9.5L12 5l7.5 4.5V20zM9 20v-6.5h6V20M9 13.5l6 6.5M15 13.5 9 20" }],
  campsite: [{ d: "M3.5 19.5 12 5l8.5 14.5zM12 19.5l-2.5-4.5h5z" }],
  clearing: [{ d: "M5 6.5h14v11H5z", dash: "3 2.4" }, { d: "M9.5 14.5v-3M12 14.5v-4M14.5 14.5v-3" }],
  gate: [{ d: "M4.5 5.5v14M19.5 5.5v14M4.5 9h15M4.5 15h15M7.5 9l6 6" }],
  note: [{ d: "M7 20.5V4M7 4.5h10l-2.4 3.7L17 12H7" }],
};

const attrs = (s: Stroke) =>
  s.fill
    ? `fill="#fff" stroke="#fff" stroke-width="1" stroke-linejoin="round"`
    : `fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${
        s.dash ? ` stroke-dasharray="${s.dash}"` : ""
      }`;

/** The icon as SVG markup, for a DOM marker: the disc and its glyph, `px` across. */
export function markIconSvg(kind: MarkChoice, px: number): string {
  const paths = GLYPH[kind].map((s) => `<path d="${s.d}" ${attrs(s)}/>`).join("");
  return `<svg width="${px}" height="${px}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#1c2620"/><g transform="translate(3.6 3.6) scale(0.7)">${paths}</g></svg>`;
}

/** The icon as a React element, `px` across (20 in a tree row, 40 in the picker). */
export function MarkIcon({ kind, px = 20 }: { kind: MarkChoice; px?: number }) {
  return (
    <svg width={px} height={px} viewBox="0 0 24 24" aria-hidden="true" className="mark-icon">
      <circle cx="12" cy="12" r="12" fill="#1c2620" />
      <g transform="translate(3.6 3.6) scale(0.7)">
        {GLYPH[kind].map((s, i) =>
          s.fill ? (
            <path key={i} d={s.d} fill="#fff" stroke="#fff" strokeWidth={1} strokeLinejoin="round" />
          ) : (
            <path
              key={i}
              d={s.d}
              fill="none"
              stroke="#fff"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={s.dash}
            />
          ),
        )}
      </g>
    </svg>
  );
}
