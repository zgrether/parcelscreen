import { describe, expect, it } from "vitest";
import { built } from "@/test/support/parcels";
import { withAskingPrice, withListing, withNotes } from "./parcelEdits";

const NOW = "2026-10-14T12:00:00.000Z";

describe("the parcel's own facts edited (the Notes tab and the list's detail alike)", () => {
  it("notes: dated when they say something; the same text changes nothing", () => {
    const p = built("a", { notes: "" });
    expect(withNotes(p, "Ask about the spring.", NOW)).toMatchObject({
      notes: "Ask about the spring.",
      notesAt: NOW,
    });
    expect(withNotes(p, "   ", NOW)).toMatchObject({ notesAt: null });
    expect(withNotes(p, "", NOW)).toBe(p);
  });

  it("the asking price, dated; null clears both", () => {
    const p = built("a");
    const priced = withAskingPrice(p, 185_000, NOW);
    expect(priced).toMatchObject({ askingPrice: 185_000, askingPriceAt: NOW });
    expect(withAskingPrice(priced, 185_000, "later")).toBe(priced);
    expect(withAskingPrice(priced, null, NOW)).toMatchObject({ askingPrice: null, askingPriceAt: null });
  });

  it("the listing's facts: a patch that changes nothing returns the parcel itself", () => {
    const p = built("a", { name: "Ferney" });
    expect(withListing(p, { name: "Ferney" })).toBe(p);
    expect(withListing(p, { agent: "A. Agent" })).toMatchObject({ name: "Ferney", agent: "A. Agent" });
  });
});
