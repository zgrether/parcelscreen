import { describe, expect, it } from "vitest";
import { DEFAULT_ENDPOINTS } from "@/lib/screen/config";
import { isServiceDownMessage, serviceDownMessage } from "./serviceStatus";

describe("the parcel service message (owner, after 16b)", () => {
  it("names the state, in the owner's words", () => {
    const [nc, va, tn] = DEFAULT_ENDPOINTS.parcels;
    expect(serviceDownMessage(va!)).toBe(
      "Virginia parcel service isn't responding — try again shortly, or draw the boundary",
    );
    expect(serviceDownMessage(nc!)).toMatch(/^North Carolina parcel service isn't responding/);
    expect(serviceDownMessage(tn!)).toMatch(/^Tennessee parcel service isn't responding/);
    expect(serviceDownMessage("https://example.org/parcels/0")).toMatch(
      /^The parcel service isn't responding/,
    );
    expect(serviceDownMessage("not a url")).toMatch(/^The parcel service/);
    expect(isServiceDownMessage(serviceDownMessage(va!))).toBe(true);
    expect(isServiceDownMessage("Zoom in to see parcel lines")).toBe(false);
  });
});
