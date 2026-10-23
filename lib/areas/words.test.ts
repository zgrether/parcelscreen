/**
 * A card's words (step 13 plan §4.2–§4.3, §8): why is the two heaviest A or B factors, with their medians; the
 * trade-off is the costliest factor below a B; the Must share is the brief's sentence.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultRubric } from "../rubric/default";
import { MINE, type NamedRubric, type Rubric } from "../rubric/types";
import { areaCard } from "./score";
import { AreaFileSchema, type AreaFile } from "./types";
import { MUSTS_PARCEL_SCALE, mustShareLine, NOTHING_BELOW_B, tradeOffLine, whyLine } from "./words";

const file = (id: string): AreaFile =>
  AreaFileSchema.parse(
    JSON.parse(readFileSync(join(process.cwd(), "public", "areas", "v1", `${id}.json`), "utf8")),
  );
const nr = (rubric: Rubric = defaultRubric()): NamedRubric => ({ id: MINE, name: "Mine", rubric });

describe("a card's words", () => {
  const a = file("grayson-highlands");

  it("why: the heaviest factors graded A or B, with their medians", () => {
    const c = areaCard(a, nr());
    const line = whyLine(c, a)!;
    expect(line).toMatch(/^[A-Z0-9].*\.$/);
    const ab = c.rows.filter((r) => r.grade === "A" || r.grade === "B");
    expect(ab.length > 0 ? line : null).not.toBeNull();
  });

  it("the trade-off: the costliest factor below a B, or nothing", () => {
    const c = areaCard(a, nr());
    const line = tradeOffLine(c, a);
    if (c.rows.every((r) => r.grade === null || r.grade === "A" || r.grade === "B"))
      expect(line).toBe(NOTHING_BELOW_B);
    else expect(line).toMatch(/^[A-Z0-9].*\.$/);
  });

  it("the Must share: the brief's sentence, or parcel by parcel", () => {
    const R = {
      ...defaultRubric(),
      musts: [
        { factor: "elevation", threshold: 3000 },
        { factor: "hospital", threshold: 30 },
      ],
    };
    const c = areaCard(a, nr(R as Rubric));
    expect(mustShareLine(c, a)).toMatch(
      /^\d+% of rural land here is at least 3,000 ft up and within 30 minutes of an ER\.$/,
    );
    const none = areaCard(a, nr({ ...defaultRubric(), musts: [] }));
    expect(mustShareLine(none, a)).toBe(MUSTS_PARCEL_SCALE);
  });
});
