/** Getting there: the additions of Batch A A2b, appended (rule 7; follow-ups 24 and 25, the owner's #81 review). */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NO_GROCER_CAVEAT } from "@/lib/report/surroundings";
import { CLOSER_GROCERY, REAL_GROCERY, type PartialScreenResult } from "@/lib/screen/types";
import { GettingThere } from "./GettingThere";

const near = (
  grocers: { name: string; ll: [number, number]; km: number; big: boolean }[],
): PartialScreenResult =>
  ({
    near: { hospitals: [], grocers, trailheads: [], trailheadCount: 0 },
    drives: [],
  }) as unknown as PartialScreenResult;
const html = (r: PartialScreenResult) =>
  renderToStaticMarkup(<GettingThere result={r} point={null} variant="panel" />);

describe("Getting there (Batch A A2b)", () => {
  it("no grocer: 'none in OSM', then the owner's sentence on its own line", () => {
    const h = html(near([]));
    expect(NO_GROCER_CAVEAT).toBe(
      "OpenStreetMap is incomplete in rural areas, so this isn't proof there are none.",
    );
    expect(h).toMatch(
      new RegExp(`none in OSM<div class="tiny muted">${NO_GROCER_CAVEAT.replace(/'/g, "&#x27;")}</div>`),
    );
  });

  it("a grocer found: no such line", () => {
    expect(html(near([{ name: "Lansing Foods", ll: [36.5, -81.5], km: 10.8, big: false }]))).not.toContain(
      "incomplete in rural",
    );
  });

  it("a closer non-chain grocery: appended to the grocery row, never a row of its own (owner, #81)", () => {
    const drives = [
      { label: "Nearest hospital", name: "Twin County", min: 40, mi: 25.1 },
      { label: REAL_GROCERY, name: "Food Lion", min: 38, mi: 24.0 },
      { label: "Airport", name: "", min: 90, mi: 70.2 },
      { label: CLOSER_GROCERY, name: "Lansing Foods", min: 21, mi: 9.9 },
    ];
    const h = html({ ...near([]), drives } as PartialScreenResult);
    expect(h).toContain(
      `${REAL_GROCERY}<div class="tiny muted">Food Lion</div></td><td class="num">38 min, 24 mi<div>Closer: Lansing Foods, 21 min.</div></td>`,
    );
    expect(h).not.toContain(CLOSER_GROCERY);
    expect(h.match(/<tr>/g)?.length).toBe(3 + 2); // three drives, groceries, trailheads
    // Without one, the row is the prototype's.
    expect(html({ ...near([]), drives: drives.slice(0, 3) } as PartialScreenResult)).toContain(
      `<td class="num">38 min, 24 mi</td>`,
    );
  });

  it("the caveat keeps the prototype's words, then the trailhead sources", () => {
    expect(html(near([]))).toContain(
      "trailhead counts undercount national forest access. Roads from the Census Bureau&#x27;s TIGER lines. Forest Service trailheads and state parks are included too.",
    );
  });
});
