/**
 * The facts table: its multi-part note (follow-up 29, owner 2026-10-08), and a Tennessee record's deeded acres,
 * conflict line and County record link (step 2, PR 2).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import type { ParcelRecord } from "@/lib/geo/parcels";
import { county as vaCounty, square } from "@/test/support/parcels";
import { carterReplay, carterSamples } from "@/test/support/tnCarter";
import { BOUNDARY_CONFLICT, ParcelFacts } from "./ParcelFacts";

const record = (over: Partial<ParcelRecord>): ParcelRecord => ({
  geo: square(-81.56),
  props: { PARCELID: "6273" },
  source: "https://vginmaps.vdem.virginia.gov/x",
  multiPart: true,
  ...over,
});
const OLD_NOTE = "Multi-part parcel: only the first part screened";

describe("the multi-part note", () => {
  it("none when every part is screened", () => {
    const html = renderToStaticMarkup(
      <ParcelFacts parcel={record({ parts: [square(-81.56), square(-81.55)] })} />,
    );
    expect(html).not.toContain("Multi-part");
  });

  it("the prototype's note, then the parts left out, when some are too far to bridge", () => {
    const html = renderToStaticMarkup(
      <ParcelFacts
        parcel={record({ parts: [square(-81.56), square(-81.5)] })}
        unscreened={{ acres: 0.8412, parts: 1 }}
      />,
    );
    expect(html).toContain(`${OLD_NOTE}. 0.84 ac in 1 other part not screened.`);
    const two = renderToStaticMarkup(
      <ParcelFacts parcel={record({ parts: [square(-81.56)] })} unscreened={{ acres: 2, parts: 2 }} />,
    );
    expect(two).toContain("2.00 ac in 2 other parts not screened.");
  });

  it("too complex to join (follow-up 51): the largest part, why, then the parts left out", () => {
    const html = renderToStaticMarkup(
      <ParcelFacts
        parcel={record({ parts: [square(-81.56), square(-81.5)] })}
        unscreened={{ acres: 120.5, parts: 60, tooComplex: true }}
      />,
    );
    expect(html).toContain(
      "Multi-part parcel: only the largest part screened (too complex to join). 120.50 ac in 60 other parts not screened.",
    );
    expect(html).not.toContain(OLD_NOTE);
  });

  it("a record kept before every part was recorded keeps the prototype's note, word for word", () => {
    const html = renderToStaticMarkup(<ParcelFacts parcel={record({})} />);
    expect(html).toContain(`<td>${OLD_NOTE}</td>`);
  });

  it("a one-part record has no note", () => {
    expect(renderToStaticMarkup(<ParcelFacts parcel={record({ multiPart: false })} />)).not.toContain(
      "Multi-part",
    );
  });
});

describe("a Tennessee record (step 2, PR 2; replayed from test/support/tnCarter.ts)", () => {
  let got: Awaited<ReturnType<typeof carterSamples>>;
  beforeAll(async () => {
    got = await carterSamples(carterReplay());
  });

  it("shows the deeded acres, the conflict line and the County record link opening in a new tab", () => {
    const html = renderToStaticMarkup(<ParcelFacts parcel={got.conflict} />);
    expect(html).toContain("Deeded acres (county record)");
    expect(html).toContain("67.18");
    expect(html).toContain(BOUNDARY_CONFLICT);
    expect(html).toContain("County record ↗");
    expect(html).toMatch(
      /href="https:\/\/assessment\.cot\.tn\.gov\/[^"]*" target="_blank" rel="noopener noreferrer"/,
    );
    expect(html).toContain("066 037.00");
  });

  it("a Virginia parcel shows none of them", () => {
    const html = renderToStaticMarkup(<ParcelFacts parcel={vaCounty(-81.355, "52-47A")} />);
    expect(html).not.toContain("Deeded acres");
    expect(html).not.toContain(BOUNDARY_CONFLICT);
    expect(html).not.toContain("County record");
  });

  it("a record link anywhere but the Comptroller's site isn't shown", () => {
    const html = renderToStaticMarkup(
      <ParcelFacts
        parcel={{ ...got.twoPiece, props: { ...got.twoPiece.props, LINK_TPAD: "https://example.com/x" } }}
      />,
    );
    expect(html).not.toContain("County record");
  });
});
