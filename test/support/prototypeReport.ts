/**
 * The prototype's results panel as a test oracle (step 14 plan §8): runs its own `renderResults` (proto
 * L1453–1567) in Node on a recorded result, with a stub `document` that captures the HTML it writes, and
 * splits that HTML into sections by the prototype's own keys (`verdict`, `december-sun`, …). The report
 * blocks are then compared with it section by section, as visible text.
 */
import type { UserConfig } from "@/lib/screen/types";
import type { PrototypeResult } from "./fixtures";
import { prototypeFn } from "./prototypeFns";

export interface PrototypeSection {
  /** The heading's visible text: title, subtitle and the "?" help link. */
  heading: string;
  /** The section's body HTML. */
  body: string;
}

const noop = () => {};

/** The prototype's sections for `R`, keyed by their `ps.open` key. */
export function prototypeSections(
  R: PrototypeResult,
  cfg: UserConfig,
  partial = false,
): Map<string, PrototypeSection> {
  let html = "";
  const element = (id: string) =>
    id === "results"
      ? {
          set innerHTML(v: string) {
            html = v;
          },
          querySelectorAll: () => [],
        }
      : { onclick: null };
  const fmt = prototypeFn("fmt");
  const compass = prototypeFn("compass");
  const esc = prototypeFn("esc");
  const grade = prototypeFn("grade");
  const globals: Record<string, unknown> = {
    CFG: cfg,
    fmt,
    compass,
    esc,
    grade,
    soilRead: prototypeFn("soilRead", { CFG: cfg }),
    compareTable: prototypeFn("compareTable", { fmt, compass, esc, grade, CFG: cfg }),
    defaultName: prototypeFn("defaultName"),
    summaryText: prototypeFn("summaryText", { fmt }),
    // Every section at its default open state; open state is the panel's, not the report's.
    openState: () => true,
    setOpenState: noop,
    saveParcel: noop,
    hint: noop,
    document: { getElementById: element },
    window: { innerWidth: 1280 },
    navigator: {},
    panel: { classList: { contains: () => true }, style: {} },
    map: { invalidateSize: noop },
  };
  const render = prototypeFn<(r: unknown, o: { partial: boolean }) => void>("renderResults", globals);
  // The DEM cell size came from the session (R._ctx), which isn't recorded; the result keeps it as demResM.
  render({ parcel: { props: {} }, ...R, _ctx: { dFine: { res: R.demResM } } }, { partial });

  const out = new Map<string, PrototypeSection>();
  const re =
    /<details class="block" data-key="([^"]+)"[^>]*><summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g;
  for (const m of html.matchAll(re)) out.set(m[1]!, { heading: visibleText(m[2]!), body: m[3]! });
  return out;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", "#x27": "'" };

/**
 * What a reader sees, for comparing markup from two renderers: tags, SVG drawings and every bit of
 * whitespace removed, entities decoded. (Whitespace goes entirely because the prototype's template literals
 * put newlines between elements where React puts none.)
 */
export function visibleText(html: string): string {
  return html
    .replace(/<svg[\s\S]*?<\/svg>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#?\w+);/g, (m, e: string) => ENTITIES[e] ?? m)
    .replace(/\s+/g, "");
}
