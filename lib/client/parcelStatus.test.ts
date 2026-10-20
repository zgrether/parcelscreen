import { describe, expect, it } from "vitest";
import { dayWord, localDay, milestonesLine, statusLine } from "./parcelStatus";

describe("a parcel's standing in words (WF2)", () => {
  it("the status, and an archive's date and reason", () => {
    // Step 8: no word for a favorite or a History parcel.
    expect(statusLine({ status: "inProgress", archived: null })).toBe("");
    expect(statusLine({ status: "saved", archived: null })).toBe("");
    const at = new Date(2026, 9, 14, 15, 30).toISOString();
    expect(statusLine({ status: "archived", archived: { reason: "Sold", at, from: "saved" } })).toBe(
      "Archived Oct 14: Sold",
    );
  });

  it("the milestones, by their calendar dates", () => {
    expect(milestonesLine({ milestones: { walked: null, offered: null } })).toBe("");
    expect(milestonesLine({ milestones: { walked: "2026-10-20", offered: "2026-11-02" } })).toBe(
      "Walked Oct 20 · Offered Nov 2",
    );
    expect(milestonesLine({ milestones: { walked: null, offered: "2026-11-02" } })).toBe("Offered Nov 2");
    // A calendar date isn't moved by the time zone.
    expect(dayWord("2026-01-01")).toBe("Jan 1");
    expect(localDay(new Date(2026, 0, 1, 23, 59))).toBe("2026-01-01");
  });
});
