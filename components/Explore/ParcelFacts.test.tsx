/** The facts table's multi-part note (follow-up 29, owner 2026-10-08). */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ParcelRecord } from "@/lib/geo/parcels";
import { square } from "@/test/support/parcels";
import { ParcelFacts } from "./ParcelFacts";

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
