/**
 * A drive step that failed (OSRM down) reads as unknown, with Try again, never as absent (owner, #216): Town and
 * hospital isn't "no hospital found, no grocery found" with an F, but not graded, its data not loaded, and the verdict
 * held at Maybe until a run that loads it.
 */
import { describe, expect, it } from "vitest";
import { depsFor, runFixture } from "@/test/support/scenarios";
import { ZACH } from "@/test/support/rubrics";
import { cardFacts, reportCard } from "./card";

/** Every OSRM request (its table and its single routes) answered 503. */
const osrmDown =
  (f: typeof fetch): typeof fetch =>
  async (input, init) =>
    /router\.project-osrm\.org/.test(String(input)) ? new Response("down", { status: 503 }) : f(input, init);

describe("OSRM failing", () => {
  it("Town and hospital is unknown, not absent; the card says the drive times didn't load", async () => {
    const r = (await runFixture("ferney-creek-52-47A", {}, depsFor("ferney-creek-52-47A", osrmDown))).result;
    expect(r.failed).toContain("drive");
    const town = cardFacts(r).rows.find((x) => x.key === "town")!;
    expect(town).toMatchObject({
      grade: null,
      detail: "the drive times didn't load",
      missing: "the drive times",
    });
    expect(town.detail).not.toMatch(/no hospital found|no grocery found/);
    const card = reportCard(r, ZACH);
    expect(card.incomplete).toContain("the drive times");
    expect(card.verdict).not.toBe("Contender");
    expect(card.reason).toMatch(/\(incomplete: .*the drive times.* didn't load, run again\)\.$/);
  }, 240_000);
});
