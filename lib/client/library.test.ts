import { describe, expect, it } from "vitest";
import { PERSONS } from "@/test/support/rubrics";
import { MINE } from "@/lib/rubric/types";
import { expectedOf } from "@/test/support/expected";
import { loadFixture } from "@/test/support/fixtures";
import { built, county } from "@/test/support/parcels";
import { drawnPart } from "@/lib/geo/recipe";
import { DEFAULT_ENDPOINTS } from "@/lib/screen/config";
import { EMPTY_HOUSEHOLD, withAsk, withTake } from "./takes";
import {
  COMPARE_MAX,
  COMPARE_MIN,
  toggleTick,
  ALL_FILTERS,
  DEFAULT_FILTERS,
  DEFAULT_VIEW,
  hiddenBy,
  countyShort,
  hiddenWords,
  householdVerdict,
  listName,
  libraryRow,
  parcelStates,
  passes,
  readLibraryView,
  showHidden,
  snippet,
  sortRows,
  type LibraryRow,
} from "./library";

const TN_SOURCE = DEFAULT_ENDPOINTS.parcels.find((u) => u.includes("Tennessee"))!;
const NC_SOURCE = DEFAULT_ENDPOINTS.parcels.find((u) => u.includes("nconemap"))!;

const row = (over: Partial<LibraryRow>): LibraryRow => ({
  key: "k",
  name: "P",
  acres: 10,
  price: null,
  states: ["VA"],
  county: null,
  status: "inProgress",
  milestones: { walked: null, offered: null },
  grades: [],
  household: null,
  unscreened: "none",
  updatedAt: "2026-10-14T12:00:00.000Z",
  rank: null,
  takes: {},
  takeNotes: {},
  waiting: false,
  ask: null,
  newTakesBy: [],
  bothLike: false,
  costBuild: null,
  perAcre: null,
  factors: [],
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
  it("from its screen: each rubric's grade, in order, and the household verdict (the lowest)", () => {
    const kept = { state: "ok" as const, result: expectedOf("grayson-mud-creek-6273", "run") };
    const r = libraryRow(built("g"), kept, PERSONS);
    expect(r.grades.map((g) => g.id)).toEqual(["zach", "julie"]);
    expect(r.grades[0]!.graded?.verdict).toBeDefined();
    expect(r.household).toBe(householdVerdict(r.grades[0]!.graded!.verdict, r.grades[1]!.graded!.verdict));
    expect(r.unscreened).toBeNull();
    // A profile with its own rubric alone (the default): one grade, and the household verdict is its own.
    const alone = libraryRow(built("g"), kept);
    expect(alone.grades.map((g) => g.id)).toEqual([MINE]);
    expect(alone.household).toBe(alone.grades[0]!.graded!.verdict);
    expect(libraryRow(built("n"), { state: "none", result: null })).toMatchObject({
      grades: [{ id: MINE, graded: null }],
      household: null,
      unscreened: "none",
    });
    expect(libraryRow(built("o"), { state: "rescreen", result: null }).unscreened).toBe("rescreen");
  });

  it("its states: the county services', else where its boundary lies", () => {
    expect(parcelStates(built("va"))).toEqual(["VA"]); // a VGIN record
    const ferney = loadFixture("ferney-creek-52-47A").input.polygon;
    expect(parcelStates(built("d", { pieces: [drawnPart(ferney as never)] }))).toEqual(["VA"]);
    expect(parcelStates(built("c", { pieces: [{ ...county(-81.355, "x"), source: "saved" }] }))).toEqual([
      "VA",
    ]);
  });

  it("a parcel combined across the TN/NC line has both states, in piece order (step 2 plan §6.5)", () => {
    const tn = { ...county(-81.355, "x"), source: TN_SOURCE, props: { GISLINK: "010066    03700" } };
    const nc = { ...county(-81.353, "y"), source: NC_SOURCE, props: { parno: "1", stcntyfips: "37121" } };
    const both = built("tn-nc", { pieces: [tn, nc] });
    expect(parcelStates(both)).toEqual(["TN", "NC"]);
    expect(libraryRow(both, undefined).states).toEqual(["TN", "NC"]);
    expect(passes(row({ states: ["TN", "NC"] }), { ...DEFAULT_FILTERS, state: "NC" })).toBe(true);
    expect(passes(row({ states: ["TN", "NC"] }), { ...DEFAULT_FILTERS, state: "TN" })).toBe(true);
    expect(passes(row({ states: ["TN", "NC"] }), { ...DEFAULT_FILTERS, state: "VA" })).toBe(false);
  });
});

describe("an unnamed parcel's name on the list (owner, after #133)", () => {
  it("'{parcel ID} · {County} Co.'; a typed name as typed", () => {
    expect(countyShort("Floyd County")).toBe("Floyd Co.");
    expect(countyShort("ASHE")).toBe("Ashe Co.");
    expect(countyShort("johnson")).toBe("Johnson Co.");
    const floyd = built("f", {
      pieces: [{ ...county(-81.355, "52-47A"), props: { PARCELID: "52-47A", LOCALITY: "Floyd County" } }],
    });
    expect(listName(floyd, "Floyd County")).toBe("52-47A · Floyd Co.");
    expect(libraryRow(floyd, undefined)).toMatchObject({
      name: "52-47A · Floyd Co.",
      county: "Floyd County",
    });
    expect(libraryRow({ ...floyd, name: "Ferney Creek" }, undefined).name).toBe("Ferney Creek");
    // No county known: the parcel ID alone.
    expect(listName(built("n"), null)).toBe("52-47A");
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

  it("each rubric's verdict (by its id; one not listed passes), milestones, a price range, the state", () => {
    const z = row({ grades: [{ id: "zach", name: "Zach", graded: { grade: "B", verdict: "Maybe" } }] });
    expect(passes(z, { ...DEFAULT_FILTERS, grades: { zach: ["Contender"] } })).toBe(false);
    expect(passes(z, { ...DEFAULT_FILTERS, grades: { zach: ["Maybe"] } })).toBe(true);
    expect(passes(z, { ...DEFAULT_FILTERS, grades: { julie: ["Contender"] } })).toBe(true);
    const walked = row({ milestones: { walked: "2026-10-01", offered: null } });
    expect(passes(walked, { ...DEFAULT_FILTERS, milestones: ["walked"] })).toBe(true);
    expect(passes(walked, { ...DEFAULT_FILTERS, milestones: ["walked", "offered"] })).toBe(false);
    const priced = row({ price: 185_000 });
    expect(passes(priced, { ...DEFAULT_FILTERS, priceMax: 200_000 })).toBe(true);
    expect(passes(priced, { ...DEFAULT_FILTERS, priceMin: 190_000 })).toBe(false);
    expect(passes(row({}), { ...DEFAULT_FILTERS, priceMax: 200_000 })).toBe(false); // no price, a bound set
    expect(passes(row({ states: ["NC"] }), { ...DEFAULT_FILTERS, state: "VA" })).toBe(false);
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
    grades: [
      { id: "zach", name: "Zach", graded: { grade: "B", verdict: "Contender" } },
      { id: "julie", name: "Julie", graded: { grade: "C", verdict: "Maybe" } },
    ],
    household: "Maybe",
  });
  const c = row({
    key: "c",
    name: "C",
    acres: 20,
    updatedAt: "2026-10-05T00:00:00Z",
    grades: [
      { id: "zach", name: "Zach", graded: { grade: "A", verdict: "Contender" } },
      { id: "julie", name: "Julie", graded: { grade: "A", verdict: "Contender" } },
    ],
    household: "Contender",
  });
  const keys = (rs: LibraryRow[]) => rs.map((r) => r.key);
  it("each key in its natural order; no price or no screen last, either way", () => {
    expect(keys(sortRows([a, b, c], { key: "updated", reversed: false }))).toEqual(["b", "c", "a"]);
    expect(keys(sortRows([a, b, c], { key: "price", reversed: false }))).toEqual(["b", "a", "c"]);
    expect(keys(sortRows([a, b, c], { key: "price", reversed: true }))).toEqual(["a", "b", "c"]);
    expect(keys(sortRows([a, b, c], { key: "acres", reversed: false }))).toEqual(["b", "c", "a"]);
    expect(keys(sortRows([a, b, c], { key: "household", reversed: false }))).toEqual(["c", "b", "a"]);
    expect(keys(sortRows([a, b, c], { key: "grade:zach", reversed: false }))).toEqual(["c", "b", "a"]);
    expect(keys(sortRows([a, b, c], { key: "grade:julie", reversed: true }))).toEqual(["b", "c", "a"]);
  });

  it("My order (WF3) is the default: by rank, then key; one without a rank last", () => {
    expect(DEFAULT_VIEW.sort).toEqual({ key: "order", reversed: false });
    const ranked = [
      { ...a, rank: "k" },
      { ...b, rank: null },
      { ...c, rank: "V" },
    ];
    expect(keys(sortRows(ranked, DEFAULT_VIEW.sort))).toEqual(["c", "a", "b"]);
    expect(
      keys(
        sortRows(
          [
            { ...a, rank: "V" },
            { ...c, rank: "V" },
          ],
          DEFAULT_VIEW.sort,
        ),
      ),
    ).toEqual(["a", "c"]);
    // Another sort is a view: the rows keep their ranks.
    expect(sortRows(ranked, { key: "price", reversed: false }).map((r) => r.rank)).toEqual([null, "k", "V"]);
  });
});

describe("the remembered view (ps.library)", () => {
  it("round-trips; a stored view of another shape reads as the default", () => {
    const v = { ...DEFAULT_VIEW, sort: { key: "price" as const, reversed: true } };
    expect(readLibraryView(JSON.stringify(v))).toEqual(v);
    expect(readLibraryView(JSON.stringify({ filters: {} }))).toEqual(DEFAULT_VIEW);
    // A view saved before WF3 keeps its sort.
    const before = { ...DEFAULT_VIEW, sort: { key: "updated" as const, reversed: false } };
    expect(readLibraryView(JSON.stringify(before))).toEqual(before);
  });
});

describe("what the filters hide, at the list's end (owner, #132 review)", () => {
  const archived = row({ key: "x", status: "archived", household: "Contender" });
  const pass = row({ key: "p", household: "Pass" });
  const live = row({ key: "l", household: "Contender" });
  it("nothing hidden: no line", () => {
    expect(hiddenBy([live], DEFAULT_FILTERS)).toBeNull();
  });
  it("only ruled-out parcels the status filter hides: '2 ruled-out parcels hidden', and Show adds them", () => {
    const h = hiddenBy([live, archived, { ...archived, key: "y" }], DEFAULT_FILTERS)!;
    expect(h).toEqual({ n: 2, onlyArchived: true });
    expect(hiddenWords(h)).toBe("2 ruled-out parcels hidden");
    expect(hiddenWords({ n: 1, onlyArchived: true })).toBe("1 ruled-out parcel hidden");
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

describe("Compare's ticks (step 4b, owner #185 Q5): 2 or 3", () => {
  it("ticks and unticks, and doesn't take a fourth", () => {
    let t: ReadonlySet<string> = new Set();
    for (const k of ["a", "b", "c"]) t = toggleTick(t, k);
    expect([...t]).toEqual(["a", "b", "c"]);
    expect(toggleTick(t, "d")).toBe(t);
    t = toggleTick(t, "b");
    expect([...t]).toEqual(["a", "c"]);
    expect([...toggleTick(t, "d")]).toEqual(["a", "c", "d"]);
    expect([COMPARE_MIN, COMPARE_MAX]).toEqual([2, 3]);
  });
});

describe("step 6: Lowest of our grades, Waiting for you and Both like it", () => {
  const g = (grade: "A" | "B" | "C" | "D" | null, verdict: "Contender" | "Maybe" | "Pass" = "Contender") => ({
    id: String(Math.random()),
    name: "x",
    graded: grade ? { grade, verdict } : null,
  });
  it("sorts by the worst of everyone's grades, best first; none graded last", () => {
    const a = row({ key: "a", name: "a", grades: [g("A"), g("C", "Maybe")] });
    const b = row({ key: "b", name: "b", grades: [g("B"), g("B")] });
    const c = row({ key: "c", name: "c", grades: [g(null), g(null)] });
    expect(sortRows([c, a, b], { key: "lowest", reversed: false }).map((r) => r.key)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });
  it("the two filters keep only the parcels waiting for me, and those we both like", () => {
    const waiting = row({ key: "w", waiting: true });
    const liked = row({ key: "l", bothLike: true });
    const all = { ...DEFAULT_FILTERS, household: [...DEFAULT_FILTERS.household, "Pass" as const] };
    expect([waiting, liked].filter((r) => passes(r, { ...all, waiting: true })).map((r) => r.key)).toEqual([
      "w",
    ]);
    expect([waiting, liked].filter((r) => passes(r, { ...all, bothLike: true })).map((r) => r.key)).toEqual([
      "l",
    ]);
  });
});

describe("the household on a row (step 6b)", () => {
  const at = (n: number) => `2026-10-20T12:0${n}:00.000Z`;
  it("the ask waiting for me, for its note; the takes I haven't seen, by whom", () => {
    let household = withAsk(EMPTY_HOUSEHOLD, {
      parcel: "g",
      from: "zach",
      to: "julie",
      note: "The spring?",
      at: at(1),
    });
    household = withTake(household, { parcel: "g", by: "julie", answer: "maybe", comment: "", at: at(2) });
    household = withAsk(household, { parcel: "g", from: "julie", to: "zach", note: "", at: at(3) });
    // Julie: her ask was answered by her own take, so nothing waits, and her own take is never new.
    const julie = libraryRow(built("g"), undefined, PERSONS, { household, me: "julie", seen: {} });
    expect(julie).toMatchObject({ waiting: false, ask: null, newTakesBy: [] });
    // Zach: Julie's ask waits, with its (empty) note, and her take is new until he's seen that version of it.
    const zach = libraryRow(built("g"), undefined, PERSONS, { household, me: "zach", seen: {} });
    expect(zach.waiting).toBe(true);
    expect(zach.ask).toMatchObject({ from: "julie", note: "" });
    expect(zach.newTakesBy).toEqual(["julie"]);
    const seen = { "g:julie": at(2) };
    expect(libraryRow(built("g"), undefined, PERSONS, { household, me: "zach", seen }).newTakesBy).toEqual(
      [],
    );
  });
});

describe("polish: a take's comment on the row, and the New takes filter", () => {
  it("the comment's first ~40 characters, cut at a word", () => {
    expect(snippet("Love the view.")).toBe("Love the view.");
    expect(snippet("The driveway looks steep from the road, but the top is lovely")).toBe(
      "The driveway looks steep from the road…",
    );
    expect(snippet("  two\n lines  ")).toBe("two lines");
  });

  it("New takes keeps only the rows with a take I haven't seen", () => {
    const f = { ...DEFAULT_FILTERS, newTakes: true };
    expect(passes(row({ newTakesBy: ["julie"] }), f)).toBe(true);
    expect(passes(row({ newTakesBy: [] }), f)).toBe(false);
    expect(passes(row({ newTakesBy: [] }), DEFAULT_FILTERS)).toBe(true);
  });
});
