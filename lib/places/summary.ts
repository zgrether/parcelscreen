/**
 * The monthly refresh's places summary (roadmap step 14d, docs/plans/step-14d-places.md §7): what the new bake added,
 * dropped or moved, by kind and nearest town, in plain lines ("+3 trailheads near Damascus", "−1 grocery near Sparta
 * (Food Lion)", "1 launch moved to river near Elizabethton (Guy Ford access)"), then what kept last month's places.
 * It goes in the refresh PR's body after the areas'. Pure: scripts/places-summary.mts reads the folders.
 */
import type { Place, PlacesIndex } from "../screen/placeData";
import type { LatLon } from "../screen/util";

type Town = NonNullable<PlacesIndex["towns"]>[number];
type Shown = Exclude<Place, { kind: "parking" }>;

/** A kind's word, one and many. */
const WORD: Record<Shown["kind"], [string, string]> = {
  grocer: ["grocery", "groceries"],
  trailhead: ["trailhead", "trailheads"],
  launch: ["launch", "launches"],
  crag: ["climbing area", "climbing areas"],
};
/** Names shown after a line, at most. */
const NAMES = 3;
/** Lines shown, at most; the rest are counted. */
const LINES = 60;

/** Kilometres, flat-earth: enough to say which town is nearest. */
const km = (a: LatLon, b: LatLon) =>
  Math.hypot((b[0] - a[0]) * 111.2, (b[1] - a[1]) * 111.32 * Math.cos((a[0] * Math.PI) / 180));

function nearestTown(ll: LatLon, towns: readonly Town[]): string | null {
  let best: { name: string; d: number } | null = null;
  for (const t of towns) {
    const d = km(ll, t.ll);
    if (!best || d < best.d) best = { name: t.name, d };
  }
  return best?.name ?? null;
}

const shown = (places: readonly Place[]) =>
  new Map(places.filter((p): p is Shown => p.kind !== "parking").map((p) => [p.id, p]));

export interface PlacesSummary {
  /** Anything added, dropped or moved. */
  changed: boolean;
  markdown: string;
}

export function placesSummary(
  before: readonly Place[],
  after: readonly Place[],
  towns: readonly Town[],
  kept: readonly string[] = [],
): PlacesSummary {
  const was = shown(before);
  const now = shown(after);
  // Each line's key: its sign and kind and town; its value, the names under it.
  const groups = new Map<
    string,
    { line: (n: number) => string; names: string[]; n: number; seen: Set<string> }
  >();
  const add = (key: string, line: (n: number) => string, name: string | undefined) => {
    const g = groups.get(key) ?? { line, names: [], n: 0, seen: new Set<string>() };
    g.n++;
    // Names once each: "Boat launch" three times says nothing more.
    if (name && !g.seen.has(name)) {
      g.seen.add(name);
      if (g.names.length < NAMES) g.names.push(name);
    }
    groups.set(key, g);
  };
  const near = (p: Shown) => {
    const t = nearestTown(p.ll, towns);
    return t ? ` near ${t}` : "";
  };
  const word = (k: Shown["kind"], n: number) => WORD[k][n === 1 ? 0 : 1];

  for (const p of now.values())
    if (!was.has(p.id)) add(`+${p.kind}${near(p)}`, (n) => `+${n} ${word(p.kind, n)}${near(p)}`, p.name);
  for (const p of was.values())
    if (!now.has(p.id)) add(`−${p.kind}${near(p)}`, (n) => `−${n} ${word(p.kind, n)}${near(p)}`, p.name);
  for (const p of now.values()) {
    const old = was.get(p.id);
    if (p.kind === "launch" && old?.kind === "launch" && old.water !== p.water) {
      const to = p.water === "flat" ? "flatwater" : "river";
      add(`~${to}${near(p)}`, (n) => `${n} ${word("launch", n)} moved to ${to}${near(p)}`, p.name);
    }
  }

  const lines = [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(
      ([, g]) =>
        `${g.line(g.n)}${g.names.length ? ` (${g.names.join(", ")}${g.seen.size > g.names.length ? ", …" : ""})` : ""}`,
    );
  const md = [
    "### Places",
    "",
    lines.length ? "**What the bake added, dropped or moved:**" : "No place was added, dropped or moved.",
    ...lines.slice(0, LINES).map((l) => `- ${l}`),
    ...(lines.length > LINES ? [`- … and ${lines.length - LINES} more`] : []),
    ...(kept.length ? ["", `**Kept from the last bake** (they didn't answer): ${kept.join(", ")}.`] : []),
  ];
  return { changed: lines.length > 0, markdown: md.join("\n") + "\n" };
}
