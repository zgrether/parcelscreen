import { describe, expect, it } from "vitest";
import { built } from "@/test/support/parcels";
import { DEFAULT_USER_CONFIG } from "@/lib/screen/config";
import { drawnInput } from "./parcelStore";
import { rescreenInput } from "./rescreenInput";
import { runKeys } from "./screenKeys";

describe("a History parcel's run input, for Re-screen all saved parcels (step 1, PR 5b)", () => {
  it("is the explorer's: the recipe's boundary, the house, the lines, and the record's keys", () => {
    const p = built("k", { house: [36.9, -81.35] });
    const made = rescreenInput(p, DEFAULT_USER_CONFIG);
    expect(made).not.toBeNull();
    expect(made!.input.polygon.type).toBe("Polygon");
    expect(made!.input.config).toBe(DEFAULT_USER_CONFIG);
    expect(made!.input.house).toEqual([36.9, -81.35]);
    // One part, no bridged strip, nothing drawn: no own land and no lines.
    expect(made!.input.ownLand).toBeUndefined();
    expect(made!.input.lines).toBeUndefined();
    expect(made!.keys).toEqual(
      runKeys(made!.input.polygon, p.house, DEFAULT_USER_CONFIG, drawnInput(p.markup)),
    );
  });

  it("is null for a parcel whose boundary no longer builds: it can't be screened", () => {
    expect(rescreenInput(built("k", { pieces: [] }), DEFAULT_USER_CONFIG)).toBeNull();
  });
});
