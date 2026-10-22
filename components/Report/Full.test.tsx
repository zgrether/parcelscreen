/** Full (step 9 plan §3), rendered with react-dom/server from the fixtures' results. */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { ZACH } from "@/test/support/rubrics";
import { built } from "@/test/support/parcels";
import { reportCard } from "@/lib/report/card";
import type { LineMarkup } from "@/lib/client/parcelStore";
import { drawnOf } from "@/lib/report/marks";
import { DEFAULT_RATES } from "@/lib/config/costs";
import { COST_WORDS } from "@/lib/report/cost";
import { Full, FULL_WORDS } from "./Full";
import { CLIMATE_SOURCES } from "@/lib/report/climate";

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

const ROAN = { ...expectedOf("roan-hwy-143-099-046-02", "run"), runAt: "2026-10-20T15:00:00.000Z" };

const TRACK: LineMarkup = {
  id: "t1",
  name: "Logging road",
  shape: "line",
  kind: "track",
  condition: "pioneer",
  line: [
    [36.185, -82.074],
    [36.186, -82.073],
  ],
  widthFt: 10,
  note: "Gate at the road",
  recordedIn: "",
  at: "2026-10-20T15:00:00.000Z",
};

const render = (over: Parameters<typeof built>[1] = {}) =>
  text(
    renderToStaticMarkup(
      <Full result={ROAN} card={reportCard(ROAN, ZACH)} parcel={built("k1", over)} acres={13.29} />,
    ),
  );

describe("Full (plan §3)", () => {
  it("Cost to enjoy after Access and driveway when the card is priced (step 10)", () => {
    const card = reportCard(ROAN, ZACH, drawnOf([], null, { askingPrice: 90_000, rates: DEFAULT_RATES }));
    const html = renderToStaticMarkup(<Full result={ROAN} card={card} parcel={built("k1")} acres={13.29} />);
    const headings = [...html.matchAll(/<section class="rp-full-section"><h2>([^<]+)<\/h2>/g)].map(
      (m) => m[1],
    );
    expect(headings.indexOf(FULL_WORDS.cost)).toBe(headings.indexOf(FULL_WORDS.access) + 1);
    expect(html).toContain("A legal way in (easement)");
    expect(html).toContain(COST_WORDS.notAQuote);
    // In print a source is plain text, not a link.
    expect(html).not.toContain("gradinglands.com/driveway");
  });

  it("the brief's sections in order, each from the saved screen, and the closing line", () => {
    const t = render();
    const html = renderToStaticMarkup(
      <Full result={ROAN} card={reportCard(ROAN, ZACH)} parcel={built("k1")} acres={13.29} />,
    );
    // The sections' own headings, in the brief's order.
    const headings = [...html.matchAll(/<section class="rp-full-section"><h2>([^<]+)<\/h2>/g)].map(
      (m) => m[1],
    );
    expect(headings).toEqual([
      FULL_WORDS.priorities,
      FULL_WORDS.sites,
      FULL_WORDS.access,
      FULL_WORDS.sun,
      FULL_WORDS.sky,
      FULL_WORDS.soils,
      FULL_WORDS.drives,
      FULL_WORDS.climate, // step 11
      FULL_WORDS.privacy,
      FULL_WORDS.listing,
      FULL_WORDS.lines,
      FULL_WORDS.sources,
    ]);
    expect(t.trim().endsWith(FULL_WORDS.closing)).toBe(true);
    expect(t).toContain("1st · Site #1");
    expect(t).toContain("Legal road access: Frontage on an unnamed road");
    expect(t).toContain("Light pollution atlas (D. Lorenz, 2025)");
    expect(t).toContain("OSRM drive times: as of Oct 20, 2026");
    // Step 11: the climate snapshots carry their own dates.
    expect(t).toContain(`Climate: ${CLIMATE_SOURCES}`);
    expect(t).not.toContain(`${CLIMATE_SOURCES}: as of`);
    expect(t).toContain(FULL_WORDS.engine(ROAN.engine));
    expect(t).not.toMatch(/cost to enjoy|raise the grade/i);
  });

  it("listing facts and notes, and lines and marks, from the parcel", () => {
    expect(render()).toContain(FULL_WORDS.noneDrawn);
    const t = render({
      askingPrice: 185000,
      askingPriceAt: "2026-10-11T12:00:00.000Z",
      agent: "A. Agent",
      notes: "Gate code 1234.",
      markup: [TRACK],
    });
    expect(t).toContain("asking $185,000 as of Oct 11, 2026");
    expect(t).toContain("A. Agent");
    expect(t).toContain("Gate code 1234.");
    expect(t).toMatch(/Logging road \(Track, pioneer, [\d,]+ ft, 10 ft wide\)\. Gate at the road/);
  });
});
