"use client";
/**
 * "What's on the map" (polish #18, owner 2026-10-20): the pins' codes and the lines a grade draws, each beside a small
 * copy of how it looks, in Map layers. Folded to its heading; the pins' own tooltips say the rest.
 */
import { POWER_MAP } from "@/lib/uses/words";
import { POWER_CASING, POWER_COLOR } from "./results/PowerLayer";

/** A pin as the map draws it (the .sitepin classes). */
const Pin = ({ cls, text }: { cls: string; text: string }) => (
  <span className={`sitepin mk-pin${cls}`} aria-hidden="true">
    {text}
  </span>
);

/** A line as the map draws it: its colour, and a dash when it has one. */
const Line = ({ color, dash, under }: { color: string; dash?: string; under?: string }) => (
  <svg className="mk-line" width="28" height="12" viewBox="0 0 28 12" aria-hidden="true">
    {under && <line x1="1" y1="6" x2="27" y2="6" stroke={under} strokeWidth="5" strokeOpacity="0.6" />}
    <line x1="1" y1="6" x2="27" y2="6" stroke={color} strokeWidth="3" strokeDasharray={dash} />
  </svg>
);

const ROWS: { key: string; swatch: React.ReactNode; text: string }[] = [
  {
    key: "best",
    swatch: <Pin cls=" top" text="1" />,
    text: "A house site, numbered by the app. Your best is filled in, and the next best are ringed.",
  },
  {
    key: "site",
    swatch: <Pin cls="" text="2" />,
    text: "Another house site. Tap a pin to see the sun and sky there.",
  },
  {
    key: "shelf",
    swatch: <Pin cls=" shelf" text="S1" />,
    text: "A shelf: level ground for a shop or a barn.",
  },
  { key: "garden", swatch: <Pin cls=" garden" text="G1" />, text: "A garden patch." },
  { key: "veto", swatch: <Pin cls=" veto" text="✕" />, text: "A site left out. Its tip says why." },
  {
    key: "entrance",
    swatch: <Pin cls=" entrance" text="E1" />,
    text: "A road entrance a driveway could start from.",
  },
  { key: "route", swatch: <Line color="#e0c43c" under="#0b1410" />, text: "The driveway the app picked." },
  { key: "second", swatch: <Line color="#9aa59d" dash="4 3" />, text: "Its second choice." },
  {
    key: "over",
    swatch: <Line color="#f0a030" dash="6 3" under="#e0553f" />,
    text: "No route fits your grade limit: the least steep one, red where it's over.",
  },
  { key: "direct", swatch: <Line color="#b04a4a" dash="2 4" />, text: "The straight 4×4 track." },
  {
    key: "fan",
    swatch: <Line color="#e0553f" />,
    text: "The horizon fan: a ray toward each ridge, red where it blocks the winter sun.",
  },
  // Step 14: added last, so the rows above keep their order.
  { key: "power", swatch: <Line color={POWER_COLOR} under={POWER_CASING} />, text: POWER_MAP.key },
];

export function MapKey() {
  return (
    <details className="mp-key">
      <summary className="tc-label">What&apos;s on the map</summary>
      <ul className="mk-rows">
        {ROWS.map((r) => (
          <li key={r.key}>
            <span className="mk-swatch">{r.swatch}</span>
            <span>{r.text}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
