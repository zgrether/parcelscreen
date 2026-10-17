/**
 * VR7 (value-ranking.md §8): the rulebook renders, and every number on it comes from config. Each number on the page is
 * matched against the screen's constants and the default Settings, and their derived forms (percent, a share of 100,
 * metres in feet, kilometres or metres in miles, rounded as the page rounds them). And a changed cutoff or weight
 * changes the page.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PERSONS, personsFrom } from "@/test/support/rubrics";
import { footprintFt2 } from "@/lib/report/card";
import { PANEL_KEYS, ruleAnchor, rulebookHref } from "@/lib/report/cardPanels";
import { rulebook } from "@/lib/report/rulebook";
import { DEFAULT_USER_CONFIG, SCREEN_CONSTANTS } from "@/lib/screen/config";
import { M2FT } from "@/lib/screen/util";
import { RulebookRules } from "./RulebookRules";

const KM_PER_MI = 1.609344;

/** The page's text: tags out, entities decoded, whitespace collapsed. */
function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ");
}

/** Every number in a config object (strings and the service endpoints left out). */
function numbersIn(v: unknown, out: number[] = []): number[] {
  if (typeof v === "number") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => numbersIn(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => numbersIn(x, out));
  return out;
}

/** Config's numbers and their derived forms, as the page can print them (rounded to 0, 1 or 2 places). */
function allowed(): Set<string> {
  const { endpoints: _e, anchors: _a, ...settings } = DEFAULT_USER_CONFIG;
  // And what's computed from config alone: the build footprint (house, garage, turnaround and septic field).
  const base = [...numbersIn(SCREEN_CONSTANTS), ...numbersIn(settings), footprintFt2(SCREEN_CONSTANTS.build)];
  const RAD = Math.PI / 180;
  const forms = base.flatMap((v) => [
    v,
    v * 100,
    v / 100,
    v * M2FT,
    v / KM_PER_MI,
    v / 1000 / KM_PER_MI,
    // Slopes in the other unit (#118 review): degrees as a grade, a grade in degrees.
    Math.tan(v * RAD) * 100,
    Math.atan(v / 100) / RAD,
    // Depths in cm as inches and feet.
    v / 2.54,
    v / 30.48,
  ]);
  const out = new Set<string>();
  for (const f of forms) for (const d of [0, 1, 2]) out.add(String(Number(f.toFixed(d))));
  return out;
}

// The two weight sets the app shipped with, as the rulebook's columns (test/support/rubrics.ts).
const render = (rb = rulebook(SCREEN_CONSTANTS, DEFAULT_USER_CONFIG, PERSONS)) =>
  textOf(renderToStaticMarkup(<RulebookRules rb={rb} current="zach" />));

describe("the rulebook (VR7)", () => {
  it("every number on the page comes from config", () => {
    const text = render();
    expect(text).not.toMatch(/NaN|undefined|Infinity/);
    const ok = allowed();
    const found = [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => m[0].replace(/,/g, ""));
    expect(found.length).toBeGreaterThan(100); // the page is mostly numbers: cutoffs, bands, weights, points
    const stray = [...new Set(found.filter((n) => !ok.has(String(Number(n)))))];
    expect(stray, "numbers on the page that aren't in config").toEqual([]);
  });

  it("covers both grades: the card's verdict, weights, every gate and row with every band; the homesite's parts", () => {
    const text = render();
    for (const t of [
      "Grade and verdict",
      "Floodplain",
      "Legal road access",
      "Easement needed",
      "Septic",
      "Elevation at the build site",
      "Best homesite",
      "Night sky",
      "Room to build",
      "Trails and public land",
      "Town and hospital",
      "Garden ground",
      // Bands, with their edges from config, and what they mean.
      "Shaded under",
      "Engineered piers",
      "Town glow",
      "Doesn't fit",
      "Small farm",
      "What it means",
      // The homesite grade.
      "December sun (40%)",
      "Facing (15%)",
      "Build cost tiers",
      // #118 review: where C starts on the Elevation scale, build cost's points explained.
      "C 2,000",
      "Build cost is counted in points: higher means more expensive.",
      "bedrock within about 20 in (50 cm)",
      "has no real facing",
    ])
      expect(text).toContain(t);
  });

  it("follows config: a changed cutoff or weight changes the page", () => {
    const C = structuredClone(SCREEN_CONSTANTS) as typeof SCREEN_CONSTANTS;
    (C.card.rows.elevationFt as number[])[0] = 3_100;
    (C.card.weights.default as Record<string, number>).elevation = 30;
    (C.score.weights as Record<string, number>).sun = 0.45;
    const text = render(rulebook(C, DEFAULT_USER_CONFIG, personsFrom(C.card)));
    expect(text).toContain("A at 3,100 ft");
    expect(text).not.toContain("A at 3,000 ft");
    expect(text).toContain("December sun (45%)");
    expect(text).toMatch(/Elevation at the build site 30 10/); // the weights table: both columns
    // The default alone (a fresh profile): one column, the first with "Mine".
    expect(render(rulebook(C))).toMatch(/Mine.*Elevation at the build site 30 Best homesite/);
  });

  it("reads the Settings: the frost belt's start and the grade limit", () => {
    const text = textOf(
      renderToStaticMarkup(
        <RulebookRules
          rb={rulebook(SCREEN_CONSTANTS, { ...DEFAULT_USER_CONFIG, thermalMinFt: 120, roadMaxGradePct: 12 })}
          current="zach"
        />,
      ),
    );
    expect(text).toContain("rising to 100 at 120 ft above it (Settings)");
    expect(text).toContain("the grade limit (Settings: 12% (6.8°))");
  });

  it('has a section for every report panel, where its "How it\'s scored" link goes (follow-up 52)', () => {
    const html = renderToStaticMarkup(<RulebookRules rb={rulebook()} current="zach" />);
    const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
    const missing = PANEL_KEYS.filter((k) => !ids.has(ruleAnchor(k)));
    expect(missing, "panels with no section on the rulebook").toEqual([]);
    expect(PANEL_KEYS).toContain("cost");
    expect(rulebookHref("trails")).toBe("/rulebook#rule-trails");
  });
});
