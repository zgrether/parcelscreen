/** The rubric editor's preview parcels (step 3 plan §4): the open one, the rest by last change, then the sample. */
import { describe, expect, it } from "vitest";
import { built } from "@/test/support/parcels";
import { expectedOf } from "@/test/support/expected";
import sample from "@/lib/rubric/sample/mud-creek.json";
import { previewOptions, SAMPLE_KEY, SAMPLE_NAME } from "./previewParcels";
import type { KeptScreen } from "./useKeptScreens";

const ok: KeptScreen = { state: "ok", result: null };

describe("previewOptions", () => {
  it("the open parcel first when it's screened, then the others by last change, then the sample", () => {
    const a = { ...built("a"), name: "A", updatedAt: "2026-10-01T00:00:00.000Z" };
    const b = { ...built("b"), name: "B", updatedAt: "2026-10-05T00:00:00.000Z" };
    const c = { ...built("c"), name: "C", updatedAt: "2026-10-09T00:00:00.000Z" };
    const screens = new Map<string, KeptScreen>([
      ["a", ok],
      ["b", ok],
      ["c", { state: "rescreen", result: null }],
    ]);
    expect(previewOptions([a, b, c], screens, "a").map((o) => o.key)).toEqual(["a", "b", SAMPLE_KEY]);
    expect(previewOptions([a, b, c], screens, "c").map((o) => o.key)).toEqual(["b", "a", SAMPLE_KEY]);
    expect(previewOptions([], new Map(), null)).toEqual([{ key: SAMPLE_KEY, name: SAMPLE_NAME }]);
  });

  it("the sample is Mud Creek's run as the port computes it (`pnpm data:sample` after its expected.json changes)", () => {
    expect(sample).toEqual(JSON.parse(JSON.stringify(expectedOf("grayson-mud-creek-6273", "run"))));
  });
});
