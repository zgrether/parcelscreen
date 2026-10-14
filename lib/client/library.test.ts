import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { loadFixture } from "@/test/support/fixtures";
import { built, county } from "@/test/support/parcels";
import { drawnPart } from "@/lib/geo/recipe";
import {
  ALL_FILTERS,
  DEFAULT_FILTERS,
  DEFAULT_VIEW,
  hiddenBy,
  hiddenWords,
  householdVerdict,
  libraryRow,
  parcelState,
  passes,
  readLibraryView,
  showHidden,
  sortRows,
  type LibraryRow,
} from "./library";

const row = (over: Partial<LibraryRow>): LibraryRow => ({
  key: "k",
  name: "P",
  acres: 10,
  price: null,
  state: "VA",
  county: null,
  status: "inProgress",
  milestones: { walked: null, offered: null },
  zach: null,
  julie: null,
  household: null,
  unscreened: "none",
  updatedAt: "2026-10-14T12:00:00.000Z",
  ...over,
});

describe("the household verdict (owner, #128): the lower of the two", () => {
  it("Contender only when both say so; Pass when either does", () => {
    expect(householdVerdict("Contender", "Contender")).toBe("Contender");
    expect(householdVerdict("Contender", "Maybe")).toBe("Maybe");
    expect(householdVerdict("Maybe", "Pass")).toBe("Pass");
    expect(householdVerdict("Pass", "Contender")).toBe("Pass");
  });
});

describe("a parcel's row", () => {
  it("from its screen: both people's grades and the household verdict", () => {
    const r = libraryRow(built("g"), { state: "ok", result: expectedOf("grayson-mud-creek-6273", "run") });
    expect(r.zach?.verdict).toBeDefined();
    expect(r.household).toBe(householdVerdict(r.zach!.verdict, r.julie!.verdict));
    expect(r.unscreened).toBeNull();
    expect(libraryRow(built("n"), { state: "none", result: null })).toMatchObject({
      zach: null,
      household: null,
      unscreened: "none",
    });
    expect(libraryRow(built("o"), { state: "rescreen", result: null }).unscreened).toBe("rescreen");
  });

  it("its state: the county service's, else where its boundary lies", () => {
    expect(parcelState(built("va"))).toBe("VA"); // a VGIN record
    const ferney = loadFixture("ferney-creek-52-47A").input.polygon;
    expect(parcelState(built("d", { pieces: [drawnPart(ferney as never)] }))).toBe("VA");
    expect(parcelState(built("c", { pieces: [{ ...county(-81.355, "x"), source: "saved" }] }))).toBe("VA");
  });
});

describe("filters: views only", () => {
  it("by default: in progress and saved; the household's Contenders, Maybes and parcels not screened yet", () => {
    expect(passes(row({}), DEFAULT_FILTERS)).toBe(true);
    expect(passes(row({ status: "saved", household: "Contender" }), DEFAULT_FILTERS)).toBe(true);
    expect(passes(row({ status: "archived" }), DEFAULT_FILTERS)).toBe(false);
    expect(passes(row({ household: "Pass" }), DEFAULT_FILTERS)).toBe(false);
    expect(passes(row({ status: "archived" }), { ...DEFAULT_FILTERS, status: ["archived"] })).toBe(true);
  });

  it("each person's verdict, milestones, a price range, the state", () => {
    const z = { grade: "B" as const, verdict: "Maybe" as const };
    expect(passes(row({ zach: z }), { ...DEFAULT_FILTERS, zach: ["Contender"] })).toBe(false);
    expect(passes(row({ zach: z }), { ...DEFAULT_FILTERS, zach: ["Maybe"] })).toBe(true);
    const walked = row({ milestones: { walked: "2026-10-01", offered: null } });
    expect(passes(walked, { ...DEFAULT_FILTERS, milestones: ["walked"] })).toBe(true);
    expect(passes(walked, { ...DEFAULT_FILTERS, milestones: ["walked", "offered"] })).toBe(false);
    const priced = row({ price: 185_000 });
    expect(passes(priced, { ...DEFAULT_FILTERS, priceMax: 200_000 })).toBe(true);
    expect(passes(priced, { ...DEFAULT_FILTERS, priceMin: 190_000 })).toBe(false);
    expect(passes(row({}), { ...DEFAULT_FILTERS, priceMax: 200_000 })).toBe(false); // no price, a bound set
    expect(passes(row({ state: "NC" }), { ...DEFAULT_FILTERS, state: "VA" })).toBe(false);
  });
});

describe("sorts: views only", () => {
  const a = row({ key: "a", name: "A", price: 300_000, acres: 5, updatedAt: "2026-10-01T00:00:00Z" });
  const b = row({
    key: "b",
    name: "B",
    price: 150_000,
    acres: 40,
    updatedAt: "2026-10-12T00:00:00Z",
    zach: { grade: "B", verdict: "Contender" },
    julie: { grade: "C", verdict: "Maybe" },
    household: "Maybe",
  });
  const c = row({
    key: "c",
    name: "C",
    acres: 20,
    updatedAt: "2026-10-05T00:00:00Z",
    zach: { grade: "A", verdict: "Contender" },
    julie: { grade: "A", verdict: "Contender" },
    household: "Contender",
  });
  const keys = (rs: LibraryRow[]) => rs.map((r) => r.key);
  it("each key in its natural order; no price or no screen last, either way", () => {
    expect(keys(sortRows([a, b, c], { key: "updated", reversed: false }))).toEqual(["b", "c", "a"]);
    expect(keys(sortRows([a, b, c], { key: "price", reversed: false }))).toEqual(["b", "a", "c"]);
    expect(keys(sortRows([a, b, c], { key: "price", reversed: true }))).toEqual(["a", "b", "c"]);
    expect(keys(sortRows([a, b, c], { key: "acres", reversed: false }))).toEqual(["b", "c", "a"]);
    expect(keys(sortRows([a, b, c], { key: "household", reversed: false }))).toEqual(["c", "b", "a"]);
    expect(keys(sortRows([a, b, c], { key: "zach", reversed: false }))).toEqual(["c", "b", "a"]);
    expect(keys(sortRows([a, b, c], { key: "julie", reversed: true }))).toEqual(["b", "c", "a"]);
  });
});

describe("the remembered view (ps.library)", () => {
  it("round-trips; a stored view of another shape reads as the default", () => {
    const v = { ...DEFAULT_VIEW, sort: { key: "price" as const, reversed: true } };
    expect(readLibraryView(JSON.stringify(v))).toEqual(v);
    expect(readLibraryView(JSON.stringify({ filters: {} }))).toEqual(DEFAULT_VIEW);
  });
});

describe("what the filters hide, at the list's end (owner, #132 review)", () => {
  const archived = row({ key: "x", status: "archived", household: "Contender" });
  const pass = row({ key: "p", household: "Pass" });
  const live = row({ key: "l", household: "Contender" });
  it("nothing hidden: no line", () => {
    expect(hiddenBy([live], DEFAULT_FILTERS)).toBeNull();
  });
  it("only archived parcels the status filter hides: '2 archived parcels hidden', and Show adds Archived", () => {
    const h = hiddenBy([live, archived, { ...archived, key: "y" }], DEFAULT_FILTERS)!;
    expect(h).toEqual({ n: 2, onlyArchived: true });
    expect(hiddenWords(h)).toBe("2 archived parcels hidden");
    expect(hiddenWords({ n: 1, onlyArchived: true })).toBe("1 archived parcel hidden");
    expect(showHidden(h, DEFAULT_FILTERS)).toEqual({
      ...DEFAULT_FILTERS,
      status: ["inProgress", "saved", "archived"],
    });
  });
  it("anything else hidden: '{n} hidden by filters', and Show all shows everything", () => {
    const h = hiddenBy([live, archived, pass], DEFAULT_FILTERS)!;
    expect(h).toEqual({ n: 2, onlyArchived: false });
    expect(hiddenWords(h)).toBe("2 hidden by filters");
    expect(showHidden(h, DEFAULT_FILTERS)).toBe(ALL_FILTERS);
    for (const r of [live, archived, pass]) expect(passes(r, ALL_FILTERS)).toBe(true);
    // An archived parcel another filter hides too isn't "only archived".
    expect(hiddenBy([{ ...archived, household: "Pass" }], DEFAULT_FILTERS)).toEqual({
      n: 1,
      onlyArchived: false,
    });
  });
});
