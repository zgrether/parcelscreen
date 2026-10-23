/**
 * One override, one letter everywhere (owner, 2026-10-22): Mud Creek with Room to build overridden from the app's B to
 * an A. The grid and the phone strip, Compare, One page, the suggestions, the household section and the rulebook's
 * breakdown all read adjust.ts shownLetter, so each shows the A marked ✎; Best homesite shows no letter at all.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { expectedOf } from "@/test/support/expected";
import { defaultRubric } from "@/lib/rubric/default";
import { MINE, type NamedRubric } from "@/lib/rubric/types";
import { adjustKey, gradedSite, letterText, shownLetter, type Adjustment } from "@/lib/report/adjust";
import { APPLIES_AT } from "@/lib/report/adjustWords";
import { breakdown } from "@/lib/report/breakdown";
import { reportCard } from "@/lib/report/card";
import { compareTable } from "@/lib/report/compare";
import { factorCells } from "@/lib/report/factorCells";
import { differences } from "@/lib/report/household";
import { drawnOf } from "@/lib/report/marks";
import { effectWords } from "@/lib/report/raise";
import { cardTiers } from "@/lib/print/report";
import { BestHomesite } from "./BestHomesite";

const MUD = expectedOf("grayson-mud-creek-6273", "run");
const mine: NamedRubric = { id: MINE, name: "Mine", rubric: defaultRubric() };
const julie: NamedRubric = { id: "julie", name: "Julie", rubric: defaultRubric() };
const room: Adjustment = {
  key: adjustKey("mud", "zach", "room"),
  parcel: "mud",
  by: "zach",
  factor: "room",
  kind: "override",
  grade: "A",
  reason: "the bench below the road is wider than the lidar shows",
  was: "B",
  at: "2026-10-22T12:00:00Z",
};
const plain = drawnOf([], null);
const drawn = { ...plain, adjust: new Map([[MINE, [room]]]) };
const noop = () => {};

describe("a single override shows the same letter in every view", () => {
  const app = reportCard(MUD, mine, plain);
  const card = reportCard(MUD, mine, drawn);

  it("the premise: the app says B, the person's card says A", () => {
    expect(app.rows.find((x) => x.key === "room")!.grade).toBe("B");
    expect(shownLetter(card, "room")).toEqual({ grade: "A", adjusted: true, setAside: false });
    expect(letterText(shownLetter(card, "room"))).toBe("A ✎");
  });

  it("the grid and the phone strip", () => {
    expect(factorCells(card).find((x) => x.key === "room")).toMatchObject({
      grade: "A",
      text: "A",
      adjusted: true,
    });
  });

  it("Compare", () => {
    const t = compareTable(
      [{ key: "mud", name: "Mud Creek", acres: 10, askingPrice: null, state: "ok", result: MUD, drawn }],
      mine,
    );
    const line = t.groups.flatMap((g) => g.rows).find((x) => x.key === "room")!;
    expect(line.cells[0]).toMatchObject({ grade: "A", adjusted: true });
  });

  it("One page", () => {
    const row = cardTiers(card)
      .flatMap((t) => t.rows)
      .find((x) => x.key === "room")!;
    expect(row.mark).toBe("A ✎");
  });

  it("the suggestions' words", () => {
    expect(effectWords(card, app)).toContain("Room to build A ✎ → B");
  });

  it("the household section: my override, Julie's app letter", () => {
    const theirs = reportCard(MUD, julie, drawn);
    const d = differences(card, theirs, null).find((x) => x.key === "room")!;
    expect(d).toMatchObject({ mine: "A ✎", theirs: "B" });
  });

  it("the rulebook's breakdown", () => {
    expect(breakdown(card)!.rows.find((x) => x.key === "room")).toMatchObject({ grade: "A", adjusted: true });
  });

  it("Best homesite: measurements only, no letter", () => {
    const h = renderToStaticMarkup(
      <BestHomesite
        card={card}
        result={MUD}
        running={false}
        showing={null}
        pick={noop}
        back={noop}
        show={noop}
      />,
    );
    expect(h).not.toContain("card-grade");
    expect(h).toContain("December sun");
  });

  it("the adjust panel says where it applies: the graded site", () => {
    const at = gradedSite(card, false)!;
    expect(at).toBe(card.sites.find((s) => s.index === card.at)!.rank);
    expect(APPLIES_AT(at)).toBe(`Applies to this parcel's graded site, #${at}.`);
  });
});
