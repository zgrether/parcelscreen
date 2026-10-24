/**
 * The driveway the household chose is the one the card grades and quotes (owner, #308): the Driveway row grades the
 * route from the chosen line whenever there is one, and the row, Best homesite's line and the cost to enjoy all read
 * that same driveway. Mud Creek with the red gate's easement carried on to the boundary and chosen, as recorded.
 */
import { describe, expect, it } from "vitest";
import { redGate, toTheBoundary } from "@/test/support/redGate";
import { runFixture } from "@/test/support/scenarios";
import { DEFAULT_RATES } from "../config/costs";
import { fmt } from "../format";
import { defaultRubric } from "../rubric/default";
import { withDriveway } from "../rubric/drivewayAdd";
import { MINE } from "../rubric/types";
import { SCREEN_CONSTANTS } from "../screen/config";
import type { ScreenResult } from "../screen/types";
import { COST_ITEMS } from "./cost";
import { reportCard, siteRows } from "./card";
import { chosenDrive } from "./lines";
import type { Drawn } from "./marks";
import { siteMeasures, yourDrive } from "./siteMeasures";

const LINE = toTheBoundary(redGate);
const drawn = (driveway: string | null): Drawn => ({
  names: new Map([[LINE.id, "Red gate"]]),
  marks: [],
  driveway,
  cost: {
    lines: [{ id: LINE.id, kind: "easement", condition: "improved", line: LINE.line, recordedIn: "" }],
    askingPrice: null,
    rates: DEFAULT_RATES,
  },
});
/** The starting list on rank-sum weights, with Driveway ranked (question 10 answered "Long and gentle"). */
const start = defaultRubric();
const ranked = withDriveway(
  { ...start, weights: { mode: "rankSum" }, wonts: start.wonts.filter((k) => k !== "driveway") },
  "gentle",
)!;
const nr = { id: MINE, name: "Mine", rubric: ranked };

describe("the chosen driveway, read the same everywhere (owner, #308)", { timeout: 120_000 }, () => {
  let result: ScreenResult;
  it("runs Mud Creek with the red gate chosen", async () => {
    result = (await runFixture("grayson-mud-creek-6273", { lines: [LINE], drivewayLine: LINE.id })).result;
    expect(chosenDrive(result, LINE.id)).not.toBeNull();
  });

  it("the Driveway row, Best homesite and the cost quote the same route", () => {
    const chosen = chosenDrive(result, LINE.id)!;
    const card = reportCard(result, nr, drawn(LINE.id));
    expect(card.drivewayLine).toBe(LINE.id);

    // The row: graded on the chosen route's steepest, its length and grade in the line.
    const row = card.rows.find((x) => x.key === "driveway")!;
    expect(
      row.detail.startsWith(`${fmt(chosen.lengthFt)} ft, ${fmt(chosen.gradePct)}% at its steepest`),
    ).toBe(true);
    expect(row.measure).toEqual({ value: chosen.gradePct, unit: "%" });

    // Best homesite's line (the card's build site).
    const line = siteMeasures(result, card.at, undefined, yourDrive(result, card.drivewayLine));
    expect(line).toContain(`${fmt(chosen.lengthFt)} ft drive at ${fmt(chosen.gradePct)}%`);

    // The cost: the finished driveway along the route, and the existing drive it starts from, come to the same length.
    expect(card.cost?.kind).toBe("priced");
    const build = card.cost!.kind === "priced" ? card.cost!.build.items : [];
    const along = build
      .filter((i) => i.label === COST_ITEMS.driveway || i.label === COST_ITEMS.newDriveway)
      .flatMap((i) => i.parts)
      .filter((p) => p.unit === "ft")
      .reduce((s, p) => s + p.qty.low, 0);
    const drive = build.find((i) => i.label.startsWith("Upgrade the existing drive, "));
    const driveFt = drive ? Number(/, ([\d,]+) ft/.exec(drive.label)![1]!.replace(/,/g, "")) : 0;
    expect(Math.round(along + driveFt)).toBeCloseTo(Math.round(chosen.lengthFt), -1);
  });

  it("with no line chosen, the app's route, as before", () => {
    const card = reportCard(result, nr, drawn(null));
    const app = siteRows(
      result,
      { ...SCREEN_CONSTANTS.card, rows: nr.rubric.bands },
      SCREEN_CONSTANTS.build,
      card.at,
    );
    expect(card.rows.find((x) => x.key === "driveway")).toEqual(app.find((x) => x.key === "driveway"));
  });
});
