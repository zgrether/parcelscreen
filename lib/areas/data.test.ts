/**
 * The area profiler's snapshots (step 13 plan §3.4): each passes its schema, sits where the catalog is, and was made
 * for the same extent as the catalog's (the scripts keep their own copy of the box).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { erDestinations, ersToConfirm, loadAirports, loadErAdditions, loadErList } from "./data";
import { CATALOG_BOX } from "./extent";

const script = (name: string) => readFileSync(join(process.cwd(), "scripts", name), "utf8");
/** The numbers in `export const NAME = [a, b, c, d]`, or null. */
const boxIn = (text: string, name: string) => {
  const head = `export const ${name} = [`;
  const at = text.indexOf(head);
  if (at < 0) return null;
  const from = at + head.length;
  return text.slice(from, text.indexOf("]", from)).split(",").map(Number);
};

describe("the catalog's extent", () => {
  it("is the one each data script was made for", () => {
    expect(boxIn(script("data-er.mts"), "CATALOG_BOX")).toEqual([...CATALOG_BOX]);
    expect(boxIn(script("data-airports.mts"), "CATALOG_BOX")).toEqual([...CATALOG_BOX]);
    expect(boxIn(script("data-climate.mts"), "REGION")).toEqual([...CATALOG_BOX]);
  });
});

describe("the ER list", () => {
  it("passes its schema, with ERs in every state the catalog touches", async () => {
    const list = await loadErList();
    for (const st of ["VA", "NC", "TN"]) expect(list.hospitals.some((h) => h.state === st)).toBe(true);
    // Never one whose emergency room isn't open to everyone.
    expect(list.hospitals.some((h) => /psychiatric|childrens|veterans|defense/i.test(h.type))).toBe(false);
  });

  it("holds the catalog's own hospitals", async () => {
    const names = (await loadErList()).hospitals.map((h) => `${h.name}, ${h.city}`);
    for (const n of [
      /^Twin County Regional Hospital, Galax/,
      /^Watauga Medical Center, Boone/,
      /, Linville$/,
    ])
      expect(names.some((x) => n.test(x))).toBe(true);
  });
});

describe("the airport list", () => {
  it("passes its schema, and holds the airports the design names", async () => {
    const codes = (await loadAirports()).airports.map((a) => a.code);
    for (const c of ["TRI", "AVL", "ROA", "GSO", "CHO", "CLT", "TYS"]) expect(codes).toContain(c);
  });
});

describe("the ERs the profiler times, and those to confirm (owner, #298 answers)", () => {
  it("CMS's, with the hand-checked additions: Stuart Community is timed", async () => {
    const list = await loadErList();
    const additions = await loadErAdditions();
    const dest = erDestinations(list, additions);
    expect(dest.length).toBe(list.hospitals.length + 1);
    expect(dest).toContainEqual([36.646318, -80.254812]);
  });

  it("an addition without an ER takes CMS's hospital near it off the list", async () => {
    const list = await loadErList();
    const h = list.hospitals[0]!;
    const closed = {
      name: "Closed",
      ll: h.ll,
      er: false,
      source: "https://example.org",
      checked: "2026-10-23",
    };
    expect(erDestinations(list, [closed])).not.toContainEqual(h.ll);
  });

  it("to confirm: OSM's ERs that CMS lacks, less the additions and CMS's own under another name", async () => {
    const list = await loadErList();
    const names = ersToConfirm(list, await loadErAdditions()).map((o) => o.name);
    expect(names).not.toContain("Stuart Community Hospital");
    expect(names.length).toBeLessThan(list.osmOnly.length);
  });
});
