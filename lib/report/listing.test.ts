import { describe, expect, it } from "vitest";
import { SCREEN_CONSTANTS } from "../screen/config";
import { listingAcresNote, listingFolds, listingSummary } from "./listing";

describe("the listing's acres on the card (WF1)", () => {
  it("says so when they differ from the boundary's by more than 10%", () => {
    expect(SCREEN_CONSTANTS.card.listingAcresPct).toBe(10);
    expect(listingAcresNote(52, 43.88)).toBe("The listing says 52 ac; this boundary is 43.9 ac.");
    expect(listingAcresNote(39.4, 43.88)).toBe("The listing says 39.4 ac; this boundary is 43.9 ac.");
  });

  it("is silent within 10%, or when either is unknown", () => {
    expect(listingAcresNote(48, 43.88)).toBeNull(); // 9.4% over
    expect(listingAcresNote(40, 43.88)).toBeNull();
    expect(listingAcresNote(null, 43.88)).toBeNull();
    expect(listingAcresNote(52, null)).toBeNull();
  });
});

describe("the Listing section folded on a phone (owner, #130)", () => {
  const none = { name: "", askingPrice: null, listingAcres: null, listingUrl: "" };
  it("folds once it has a name or a price; stays open while empty", () => {
    expect(listingFolds(none)).toBe(false);
    const linked = { ...none, listingAcres: 52, listingUrl: "https://x.test" };
    expect(listingFolds(linked)).toBe(false); // acres and a link alone don't fold it
    expect(listingFolds({ ...none, name: "Ferney Creek 43 ac" })).toBe(true);
    expect(listingFolds({ ...none, askingPrice: 185_000 })).toBe(true);
  });

  it("one line: the name, the price and its $/ac, the listed acres, and whether there's a link", () => {
    expect(
      listingSummary(
        { name: "Ferney Creek 43 ac", askingPrice: 185_000, listingAcres: 52, listingUrl: "https://x.test" },
        "52-47A",
      ),
    ).toBe("Ferney Creek 43 ac · $185k · $3,560/ac · 52 ac listed · link");
    // No acres either way: no $/ac.
    expect(listingSummary({ ...none, askingPrice: 185_000 }, "52-47A")).toBe("52-47A · $185k");
    // Step 10b: the boundary's acres when the listing gives none; marked when the two differ by more than 5%.
    expect(listingSummary({ ...none, askingPrice: 185_000 }, "52-47A", 43.9)).toBe(
      "52-47A · $185k · $4,210/ac",
    );
    expect(listingSummary({ ...none, askingPrice: 185_000, listingAcres: 52 }, "52-47A", 43.9)).toBe(
      "52-47A · $185k · $3,560/ac ≠ · 52 ac listed",
    );
  });
});
