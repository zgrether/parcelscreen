import { area } from "@turf/turf";
import { describe, expect, it } from "vitest";
import { loadFixture } from "../../test/support/fixtures";
import { squareAround } from "./parcels";
import { fitSplit, sideName, splitFromLabel, splitPieces } from "./split";
import { M2_PER_ACRE, type LatLon } from "./types";

const C: LatLon = [36.9, -80.5];
const square = squareAround(C, 10);
const total = area(square) / M2_PER_ACRE;
const south: LatLon = [C[0] - 0.01, C[1]],
  north: LatLon = [C[0] + 0.01, C[1]];

describe("splitPieces", () => {
  it("cuts a square down the middle into two halves that add back up", () => {
    const P = splitPieces(square, south, north);
    expect(P.leftAc).toBeCloseTo(total / 2, 2);
    expect(P.rightAc).toBeCloseTo(total / 2, 2);
    expect(P.leftAc + P.rightAc).toBeCloseTo(total, 6);
  });

  it("returns an empty side when the line misses the parcel", () => {
    const east: LatLon[] = [
      [C[0] - 0.01, C[1] + 0.05],
      [C[0] + 0.01, C[1] + 0.05],
    ];
    const P = splitPieces(square, east[0]!, east[1]!);
    expect(P.right).toBeNull();
    expect(P.leftAc).toBeCloseTo(total, 6);
  });
});

describe("sideName", () => {
  it("names the sides of a northbound line: right is east, left is west", () => {
    expect(sideName(south, north, 1)).toBe("E");
    expect(sideName(south, north, -1)).toBe("W");
  });
});

describe("fitSplit", () => {
  it("slides the line until the chosen side hits the target acreage", () => {
    const moved = fitSplit(square, south, north, 3, 1);
    expect(moved).not.toBeNull();
    expect(splitPieces(square, moved!.a, moved!.b).rightAc).toBeCloseTo(3, 2);
  });

  it("fits a real parcel: Ferney Creek to 20 acres on its west side", () => {
    const { input } = loadFixture("ferney-creek-52-47A");
    const [lat, lon] = [input.point.lat, input.point.lon];
    const moved = fitSplit(input.polygon, [lat - 0.01, lon], [lat + 0.01, lon], 20, -1);
    expect(splitPieces(input.polygon, moved!.a, moved!.b).leftAc).toBeCloseTo(20, 2);
  });

  it("gives up (null) when sliding can't reach the target, or the target isn't positive", () => {
    expect(fitSplit(square, south, north, total + 5, 1)).toBeNull();
    expect(fitSplit(square, south, north, 0, 1)).toBeNull();
  });
});

describe("splitFromLabel", () => {
  it("uses the parent's parcel number, else 'parent parcel'", () => {
    expect(splitFromLabel({ PARCELID: "52-47A" })).toBe("52-47A");
    expect(splitFromLabel({ parno: "9876", PARCELID: "x" })).toBe("9876");
    expect(splitFromLabel({})).toBe("parent parcel");
  });
});
