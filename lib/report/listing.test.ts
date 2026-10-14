import { describe, expect, it } from "vitest";
import { SCREEN_CONSTANTS } from "../screen/config";
import { listingAcresNote } from "./listing";

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
