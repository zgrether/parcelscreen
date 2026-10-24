import { describe, expect, it } from "vitest";
import { drawnPart } from "@/lib/geo/recipe";
import { DEFAULT_ENDPOINTS, DEFAULT_USER_CONFIG } from "@/lib/screen/config";
import type { ScreenResult, UserConfig } from "@/lib/screen/types";
import { loadFixture } from "@/test/support/fixtures";
import { fromPrototype } from "@/test/support/fromPrototype";
import { built, county, square, T0 } from "@/test/support/parcels";
import { prototypeConst } from "@/test/support/prototypeFns";
import {
  applyImport,
  buildExport,
  changedFields,
  EXPORT_FORMAT,
  exportFileName,
  importSummary,
  keptScreenIds,
  fromV1,
  fromV2,
  fromV3,
  fromV4,
  fromV5,
  READS_VERSIONS,
  V1_DEFAULTS,
  nameFromNotes,
  NOTES_NAME_MAX,
  NOT_AN_EXPORT,
  planImport,
  settingsQuestion,
  type ImportPlan,
} from "./exportFile";
import { JULIE } from "@/test/support/rubrics";
import { defaultRubric } from "@/lib/rubric/default";
import { byRank, withRanks } from "./myOrder";
import { EMPTY_STORE, type ParcelStore } from "./parcelStore";
import type { ScreenRecord } from "./screenStore";

const NOW = "2026-10-07T15:00:00.000Z";
const RESULT = fromPrototype(loadFixture("ferney-creek-52-47A").goldens.run) as ScreenResult;
const screen = (id: string): ScreenRecord => ({
  id,
  keys: { boundary: "b", house: "", settings: "s", lines: "" },
  result: RESULT,
});
const SPLIT = {
  a: [36.62, -81.354] as [number, number],
  b: [36.64, -81.354] as [number, number],
  keep: 1 as const,
};
const keys = () => {
  let n = 0;
  return () => `new${++n}`;
};

/** History with two parcels, one screened, ranked in My order as a read store is (WF3). */
const STORE: ParcelStore = withRanks({
  v: 2,
  open: null,
  built: [built("a", { screenIds: ["s1"] }), built("b", { pieces: [county(-81.351, "52-48")] })],
});
const file = (over: Partial<ReturnType<typeof buildExport>> = {}, store = STORE, cfg = DEFAULT_USER_CONFIG) =>
  JSON.stringify({ ...buildExport(cfg, store, [screen("s1")], NOW), ...over });
const plan = (
  text: string,
  store: ParcelStore = EMPTY_STORE,
  cfg: UserConfig = DEFAULT_USER_CONFIG,
): ImportPlan => {
  const r = planImport(text, { store, cfg }, NOW, keys());
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r.plan;
};
const errors = (text: string, store: ParcelStore = EMPTY_STORE) => {
  const r = planImport(text, { store, cfg: DEFAULT_USER_CONFIG }, NOW, keys());
  return r.ok ? [] : r.errors;
};

describe("export (owner, 16b): versioned by format and version", () => {
  it("holds the settings, the parcel store and History's kept screens", () => {
    const f = buildExport(DEFAULT_USER_CONFIG, STORE, [screen("s1")], NOW);
    expect(f).toMatchObject({ format: EXPORT_FORMAT, version: 6, exportedAt: NOW, parcels: STORE });
    expect(f.cfg).toBe(DEFAULT_USER_CONFIG);
    expect(keptScreenIds(STORE)).toEqual(["s1"]);
    expect(exportFileName(NOW)).toBe("parcelscreen-2026-10-07.json");
  });
});

describe("import: validate all, then all or nothing", () => {
  it("round trip: into an empty History, the same parcels, screens and settings", () => {
    const p = plan(file());
    expect(p.kind).toBe("port");
    expect(applyImport(EMPTY_STORE, p)).toEqual({ ...EMPTY_STORE, built: STORE.built });
    expect(p.screens.map((s) => s.id)).toEqual(["s1"]);
    expect(p.settings).toEqual({ config: DEFAULT_USER_CONFIG, changed: [] });
    expect(p.skipped).toEqual([]);
  });

  it("carries each screen's engine stamp, and takes a file without one (Batch A §6)", () => {
    const stamped = JSON.stringify({
      ...buildExport(DEFAULT_USER_CONFIG, STORE, [{ ...screen("s1"), engine: 4 }], NOW),
    });
    expect(plan(stamped).screens[0]!.engine).toBe(4);
    expect(plan(file()).screens[0]!.engine).toBeUndefined(); // an export from before the stamp
  });

  it("into the same History: every parcel skipped and listed, nothing changes", () => {
    const p = plan(file(), STORE);
    expect(p.added).toEqual([]);
    expect(p.screens).toEqual([]);
    expect(p.skipped).toEqual(["52-47A", "52-48"]);
    expect(applyImport(STORE, p)).toEqual(STORE);
    expect(importSummary(p, "unchanged")).toEqual([
      "Imported 0 parcels",
      "Skipped, already on your list: 52-47A, 52-48.",
      "Settings unchanged.",
    ]);
  });

  it("one bad screen record: nothing at all", () => {
    const bad = { ...screen("s1"), result: { ...RESULT, acres: "x" } };
    expect(errors(file({ screens: [bad] as never }))[0]).toMatch(/^file[.]screens[.]0[.]result[.]acres: /);
  });

  it("not an export: the prototype's hint, verbatim", () => {
    expect(errors("not json")).toEqual([NOT_AN_EXPORT]);
    expect(errors(JSON.stringify({ hello: 1 }))).toEqual([NOT_AN_EXPORT]);
    expect(errors(JSON.stringify([1]))).toEqual([NOT_AN_EXPORT]);
    expect(errors(file({ version: 7 as never }))).toEqual([
      "This export is version 7; this app reads versions 1, 2, 3, 4, 5 and 6.",
    ]);
  });
});

describe("version 2 (owner, after #131): every field written; a version 1 file converted", () => {
  it("round trip: an archived parcel with both milestones, exported and imported into an empty store, is the same", () => {
    const p = {
      ...built("k1", { screenIds: ["s1"] }),
      name: "Ferney Creek 43 ac",
      askingPrice: 185_000,
      askingPriceAt: "2026-10-11T12:00:00.000Z",
      status: "archived" as const,
      archived: { reason: "Rejected: no winter sun", at: "2026-10-14T12:00:00.000Z", from: "saved" as const },
      milestones: { walked: "2026-10-01", offered: "2026-10-09" },
      rank: "V",
    };
    const store: ParcelStore = { v: 2, open: null, built: [p] };
    const text = JSON.stringify(buildExport(DEFAULT_USER_CONFIG, store, [screen("s1")], NOW));
    expect(JSON.parse(text)).toMatchObject({ version: 6 }); // the current version: version 2's fields, and more
    const after = applyImport(EMPTY_STORE, plan(text));
    expect(after.built).toEqual([p]);
    // Each field the owner named, one by one.
    expect(after.built[0]).toMatchObject({
      status: "archived",
      archived: { reason: "Rejected: no winter sun", at: "2026-10-14T12:00:00.000Z", from: "saved" },
      milestones: { walked: "2026-10-01", offered: "2026-10-09" },
    });
  });

  it("a version 1 file: each parcel gets the defaults for what it lacks, and keeps what it has", () => {
    const v1Parcel = (key: string) => {
      const {
        askingPrice: _p,
        askingPriceAt: _pa,
        markup: _m,
        name: _n,
        listingUrl: _u,
        listingAcres: _a,
        agent: _g,
        status: _s,
        archived: _ar,
        milestones: _mi,
        ...v1
      } = built(key);
      return v1;
    };
    const v1 = {
      ...JSON.parse(file()),
      version: 1,
      parcels: {
        v: 2,
        open: null,
        built: [
          v1Parcel("old"),
          { ...v1Parcel("priced"), pieces: [county(-81.351, "52-48")], askingPrice: 99_000 },
        ],
      },
    };
    expect(Object.keys(fromV1(v1).parcels as object)).toEqual(["v", "open", "built"]);
    const added = plan(JSON.stringify(v1)).added;
    expect(added).toHaveLength(2);
    expect(added[0]).toMatchObject({ key: "old", ...V1_DEFAULTS, askingPrice: null });
    expect(added[1]).toMatchObject({ key: "priced", askingPrice: 99_000, status: "inProgress" });
    expect(V1_DEFAULTS).toEqual({
      askingPrice: null,
      askingPriceAt: null,
      markup: [],
      name: "",
      listingUrl: "",
      listingAcres: null,
      agent: "",
      deedRestrictions: "",
      hoa: "unknown",
      status: "inProgress",
      archived: null,
      milestones: { walked: null, offered: null },
    });
    expect(READS_VERSIONS).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe("matching on the History key (owner, after #58)", () => {
  it("an identical key is skipped, never overwritten, even if the file's copy differs", () => {
    const theirs: ParcelStore = { ...STORE, built: [{ ...STORE.built[0]!, notes: "changed elsewhere" }] };
    const p = plan(file({}, theirs), STORE);
    expect(p.skipped).toEqual(["52-47A"]);
    expect(applyImport(STORE, p).built[0]!.notes).toBe("kept");
  });

  it("the same county record with a different split, or different pieces, is added and noted", () => {
    const theirs: ParcelStore = {
      ...STORE,
      built: [
        built("split", { split: SPLIT }),
        built("plus", { pieces: [county(-81.355, "52-47A"), county(-81.353, "52-49")] }),
      ],
    };
    const p = plan(file({ screens: [] }, theirs), { ...STORE, built: [STORE.built[0]!] });
    expect(p.added.map((x) => x.key)).toEqual(["split", "plus"]);
    expect(p.sameRecord).toHaveLength(2);
    expect(p.sameRecord[0]).toMatch(/^52-47A \(\d+\.\d\d ac · split\)$/);
    expect(p.sameRecord[1]).toMatch(/^52-47A \+ 52-49|^52-49 \+ 52-47A/);
    const after = applyImport({ ...STORE, built: [STORE.built[0]!] }, p);
    expect(after.built.map((b) => b.key)).toEqual(["a", "split", "plus"]);
    expect(importSummary(p, "none")[2]).toMatch(/^Same county record, different recipe: 52-47A \(/);
  });

  it("drawn-only parcels: a new key is added, a known one skipped", () => {
    const drawn = built("d", { pieces: [drawnPart(square(-81.36))] });
    const theirs: ParcelStore = { ...STORE, built: [drawn] };
    expect(plan(file({ screens: [] }, theirs)).added.map((x) => x.key)).toEqual(["d"]);
    expect(plan(file({ screens: [] }, theirs), theirs).skipped).toEqual(["Drawn parcel"]);
  });
});

describe("an identical recipe under another key is the same parcel (owner, #60)", () => {
  it("is skipped and listed as the same parcel already in History", () => {
    const theirs: ParcelStore = {
      ...STORE,
      built: [{ ...STORE.built[0]!, key: "other-key", notes: "elsewhere", house: null }],
    };
    const p = plan(file({}, theirs), STORE);
    expect([p.added, p.skipped, p.sameParcel]).toEqual([[], [], ["52-47A"]]);
    expect(p.screens).toEqual([]);
    expect(importSummary(p, "unchanged")).toEqual([
      "Imported 0 parcels",
      "Skipped, same parcel already on your list: 52-47A.",
      "Settings unchanged.",
    ]);
  });

  it("the same pieces in another order, or with other attributes, are the same; a split or a drawn shape isn't", () => {
    const pair = [county(-81.355, "52-47A"), county(-81.353, "52-48")];
    const mine: ParcelStore = { ...STORE, built: [built("a", { pieces: pair })] };
    const swapped = built("b", {
      pieces: [{ ...pair[1]!, props: { PARCELID: "52-48", OWNER: "new" } }, pair[0]!],
    });
    const split = built("c", { pieces: pair, split: SPLIT });
    const drawn = built("d", { pieces: [pair[0]!, drawnPart(square(-81.353))] });
    const p = plan(file({ screens: [] }, { ...STORE, built: [swapped, split, drawn] }), mine);
    expect(p.sameParcel).toHaveLength(1);
    expect(p.added.map((x) => x.key)).toEqual(["c", "d"]);
  });

  it("duplicates already in History stay as they are", () => {
    const twins: ParcelStore = { ...STORE, built: [built("a"), built("a2")] };
    const p = plan(file({}, STORE), twins);
    expect(applyImport(twins, p).built.map((b) => b.key)).toEqual(["a", "a2", "b"]);
  });

  it("two identical recipes in one file: the first is added, the second skipped", () => {
    const theirs: ParcelStore = { ...STORE, built: [built("x"), built("y")] };
    const p = plan(file({ screens: [] }, theirs));
    expect(p.added.map((x) => x.key)).toEqual(["x"]);
    expect(p.sameParcel).toEqual(["52-47A"]);
  });
});

describe("settings from a file", () => {
  it("changed fields are listed by label, and the question names them", () => {
    const theirs = {
      ...DEFAULT_USER_CONFIG,
      houseMin: 55,
      budget: { readyToBuild: 250_000 },
      timeZone: "America/Chicago",
    };
    const p = plan(file({}, STORE, theirs));
    expect(p.settings!.changed).toEqual([
      "House site: min cell score (0–100) (60 → 55)",
      "Budget: ready to build (land prep, well, septic, power, driveway) $ (300000 → 250000)",
      "Time zone (America/New_York → America/Chicago)",
    ]);
    expect(p.settings!.config.budget).toEqual({ readyToBuild: 250_000 });
    expect(settingsQuestion(p.settings!)).toBe(
      "Replace your settings with the file's?\n\nChanged: House site: min cell score (0–100) (60 → 55); Budget: ready to build (land prep, well, septic, power, driveway) $ (300000 → 250000); Time zone (America/New_York → America/Chicago).",
    );
    expect(changedFields(DEFAULT_USER_CONFIG, { ...DEFAULT_USER_CONFIG, anchors: [] })).toEqual([
      "Drive-time anchors",
    ]);
  });

  it("the same checks as Save: a bad field fails the whole import", () => {
    const bad = { ...DEFAULT_USER_CONFIG, gardenMin: 300, endpoints: { ...DEFAULT_ENDPOINTS, _v: 15 } };
    expect(errors(file({ cfg: bad }))).toEqual([
      "Settings: Garden: min cell score — must be between 0 and 100",
      "Settings: Data endpoints — Endpoints are version 15; only version 14 is accepted, and older versions are replaced by defaults on load. Reset the endpoints, or update the list and set _v to 14.",
    ]);
  });

  it("hidden and unknown fields are ignored, current values kept, and named", () => {
    const theirs = {
      ...DEFAULT_USER_CONFIG,
      aspectFrom: 100,
      aspectTo: 225,
      budget: { readyToBuild: 300_000, landPrep: 1 },
      extra: 1,
    };
    const p = plan(file({ cfg: theirs as never }));
    expect(p.ignored).toEqual(["Good aspect from (degrees) 100 (kept 90)", "extra", "budget.landPrep"]);
    expect([p.settings!.config.aspectFrom, p.settings!.config.aspectTo]).toEqual([90, 225]);
    expect(p.settings!.changed).toEqual([]);
  });
});

describe("a prototype export ({ cfg, saved[] }, L1605)", () => {
  const PROTO = prototypeConst<Record<string, unknown>>("DEFAULTS");
  const savedAt = Date.parse("2026-09-30T18:00:00.000Z");
  const saved = (over: Record<string, unknown> = {}) => ({
    id: savedAt,
    name: "Ridge tract",
    notes: "Spring on the north line.",
    when: "x",
    verdict: "ok",
    acres: 9.9,
    geo: square(-81.355),
    props: { PARCELID: "52-47A", FIPS: "51077" },
    house: [36.629, -81.354],
    ...over,
  });
  const proto = (cfg: unknown, list = [saved()]) => JSON.stringify({ cfg, saved: list });

  it("its cfg (the real defaults, with _res3) converts and validates; old endpoints are replaced", () => {
    const p = plan(proto({ ...PROTO, _res3: true }));
    expect(p.kind).toBe("prototype");
    // The prototype's 10% grade limit is its own; the port's default is 15% (#103 decisions), so it reads as a change.
    expect(p.settings).toEqual({
      config: { ...DEFAULT_USER_CONFIG, roadMaxGradePct: 10 },
      changed: ["Road grade warning (%) (15 → 10)"],
    });
    expect(p.endpointsReplaced).toBe(true);
    expect(p.ignored).toEqual(["Good aspect from (degrees)", "Good aspect to (degrees)", "_res3"]);
    expect(importSummary(p, "unchanged")).toContain(
      "The file's endpoints were an older version, so the defaults are used.",
    );
  });

  it("its culvert rate is also the relief culverts' (owner, 2026-10-11: their own rate defaults to it)", () => {
    const dw = { ...(PROTO.dw as Record<string, number>), culvertEach: 4200 };
    const p = plan(proto({ ...PROTO, dw }));
    expect(p.settings!.config.dw).toMatchObject({ culvertEach: 4200, reliefCulvertEach: 4200 });
  });

  it("its saved parcels become History parcels, with no result: house, name and notes kept", () => {
    const p = plan(
      proto(undefined, [
        saved(),
        saved({
          id: "x",
          name: "52-48",
          notes: "",
          geo: square(-81.351),
          props: { PARCELID: "52-48", FIPS: "51077" },
        }),
      ]),
    );
    expect(p.settings).toBeNull();
    const [a, b] = p.added;
    expect(a).toMatchObject({
      key: "new1",
      split: null,
      house: [36.629, -81.354],
      name: "Ridge tract",
      notes: "Spring on the north line.",
      notesAt: "2026-09-30T18:00:00.000Z",
      updatedAt: "2026-09-30T18:00:00.000Z",
      screenIds: [],
    });
    expect(a!.pieces).toEqual([
      {
        geo: square(-81.355),
        props: { PARCELID: "52-47A", FIPS: "51077" },
        source: "saved",
        multiPart: false,
      },
    ]);
    // The saved name is the parcel's name (polish #21), even when it's the parcel ID, and no line in its notes; an
    // id that isn't a time stamps it now.
    expect(b).toMatchObject({ key: "new2", name: "52-48", notes: "", notesAt: null, updatedAt: NOW });
    expect(p.sameRecord).toEqual([]);
  });

  it("a port file's unnamed parcel takes its name from its notes' 'Name:' line on import; a named one keeps its own (#133)", () => {
    const notes = "name : Ferney Creek, Floyd County VA, parcel 52-47A\n\nSpring.";
    const unnamed = { ...STORE.built[0]!, name: "", notes };
    const named = { ...STORE.built[1]!, name: "Macks", notes: "Name: something else" };
    const added = plan(file({}, { ...STORE, built: [unnamed, named] })).added;
    expect(added.map((p) => [p.name, p.notes])).toEqual([
      ["Ferney Creek, Floyd County VA, parcel 52-47A", notes],
      ["Macks", "Name: something else"],
    ]);
  });

  it("the notes' first line names the parcel when it's 60 characters or less; the notes stay (owner, #130)", () => {
    const named = plan(proto(undefined, [saved()])).added[0]!;
    expect(named).toMatchObject({
      name: "Ridge tract", // the saved name (polish #21: not written into the notes)
      notes: "Spring on the north line.",
    });
    const long = "A".repeat(61);
    const tooLong = plan(proto(undefined, [saved({ name: long })])).added[0]!;
    expect(tooLong).toMatchObject({ name: "", notes: `Name: ${long}\n\nSpring on the north line.` });
    expect(plan(proto(undefined, [saved({ name: "A".repeat(60) })])).added[0]!.name).toBe("A".repeat(60));
    // No saved name: the notes' own first line.
    const unnamed = plan(
      proto(undefined, [saved({ name: "", notes: "Gate code 1234\nAsk about the spring." })]),
    );
    expect(unnamed.added[0]).toMatchObject({
      name: "Gate code 1234",
      notes: "Gate code 1234\nAsk about the spring.",
    });
    expect(nameFromNotes(`${"x".repeat(80)}\nmore`)).toBe("");
    expect(NOTES_NAME_MAX).toBe(60);
  });

  it("the same saved parcel twice: the second is the same parcel, skipped", () => {
    const p = plan(proto(undefined, [saved(), saved({ name: "Again" })]));
    expect(p.added.map((x) => x.notes)).toEqual(["Spring on the north line."]);
    // Named by its saved name, now that an imported parcel has one (owner, #130).
    expect(p.sameParcel).toEqual(["Again"]);
  });

  it("is noted as the same county record as a port parcel from that record", () => {
    const p = plan(proto(undefined), STORE);
    // By its saved name (owner, #130): unique, so nothing more is needed to tell it from the port parcel.
    expect(p.sameRecord).toEqual(["Ridge tract"]);
  });

  it("a NaN the prototype stored (null in JSON) is named", () => {
    expect(errors(proto({ ...PROTO, houseMin: null }))).toEqual([
      "Settings: House site: min cell score (0–100) — must be a number",
    ]);
  });
});

describe("the summary", () => {
  it("opens with the prototype's hint, then added, skipped, changed and ignored", () => {
    const p: ImportPlan = {
      kind: "port",
      added: [built("x")],
      screens: [screen("s1"), screen("s2")],
      olderResults: 0,
      skipped: ["52-48"],
      sameParcel: [],
      sameRecord: [],
      settings: { config: DEFAULT_USER_CONFIG, changed: ["Data endpoints"] },
      ignored: ["extra"],
      endpointsReplaced: false,
      profileName: null,
      rubrics: null,
    };
    expect(importSummary(p, "replaced")).toEqual([
      "Imported 1 parcels",
      "Added: 52-47A (with 2 kept results).",
      "Skipped, already on your list: 52-48.",
      "Settings replaced. Changed: Data endpoints.",
      "Ignored (not in Settings): extra.",
    ]);
    expect(importSummary(p, "declined")[3]).toBe("Settings kept (you declined).");
    // A version 6 file says whose it was (step 1), right after the count.
    expect(importSummary({ ...p, profileName: "Zach" }, "none")[1]).toBe("Exported from the profile Zach.");
    expect(T0 < NOW).toBe(true);
    expect(importSummary({ ...p, olderResults: 2 }, "none")[2]).toBe(
      "2 saved results were from an older version and skipped; those parcels re-screen when opened.",
    );
  });
});

describe("schema v3 (B2a): older results and the asking price", () => {
  it("a result from an older schema is skipped, not an error: its parcel is added and re-screens when opened", () => {
    const v2 = { ...screen("s1"), result: { ...RESULT, schemaVersion: 2 } };
    const p = plan(file({ screens: [v2] as never }));
    expect(p.added.map((x) => x.screenIds)).toEqual([["s1"], []]);
    expect([p.screens, p.olderResults]).toEqual([[], 1]);
    expect(importSummary(p, "none")).toContain(
      "1 saved result was from an older version and skipped; those parcels re-screen when opened.",
    );
    // A current result that's malformed still fails the whole import.
    expect(
      errors(file({ screens: [{ ...screen("s1"), result: { ...RESULT, verdict: 42 } }] as never })),
    ).not.toEqual([]);
  });

  it("the status, archive and milestones round-trip (WF2); a parcel kept before them is in progress", () => {
    const standing = {
      status: "archived" as const,
      archived: { reason: "Sold", at: "2026-10-14T12:00:00.000Z", from: "saved" as const },
      milestones: { walked: "2026-10-01", offered: null },
    };
    const kept: ParcelStore = { ...STORE, built: [{ ...STORE.built[0]!, ...standing }] };
    expect(plan(file({}, kept)).added[0]).toMatchObject(standing);
    const { status: _s, archived: _a, milestones: _m, ...older } = STORE.built[0]!;
    expect(plan(file({ parcels: { ...STORE, built: [older as never] } })).added[0]).toMatchObject({
      status: "inProgress",
      archived: null,
      milestones: { walked: null, offered: null },
    });
  });

  it("the listing's facts round-trip (WF1); a parcel kept before them has none", () => {
    const facts = {
      name: "Ferney Creek",
      listingUrl: "https://x.test/l",
      listingAcres: 52,
      agent: "A. Agent",
    };
    const named: ParcelStore = { ...STORE, built: [{ ...STORE.built[0]!, ...facts }] };
    expect(plan(file({}, named)).added[0]).toMatchObject(facts);
    const { name: _n, listingUrl: _u, listingAcres: _a, agent: _g, ...older } = STORE.built[0]!;
    expect(plan(file({ parcels: { ...STORE, built: [older as never] } })).added[0]).toMatchObject({
      name: "",
      listingUrl: "",
      listingAcres: null,
      agent: "",
    });
  });

  it("the asking price and its date round-trip; a parcel kept before the price has none", () => {
    const at = "2026-10-11T12:00:00.000Z";
    const priced: ParcelStore = {
      ...STORE,
      built: [{ ...STORE.built[0]!, askingPrice: 185_000, askingPriceAt: at }],
    };
    expect(plan(file({}, priced)).added[0]).toMatchObject({ askingPrice: 185_000, askingPriceAt: at });
    const { askingPrice: _p, askingPriceAt: _a, ...older } = STORE.built[0]!;
    const before = plan(file({ parcels: { ...STORE, built: [older as never] } }));
    expect(before.added[0]).toMatchObject({ askingPrice: null, askingPriceAt: null });
  });

  it("drawn lines round-trip (follow-up 34); a parcel kept before them has none", () => {
    const line = {
      id: "t1",
      name: "Track 1",
      shape: "line" as const,
      recordedIn: "",
      kind: "track" as const,
      condition: "pioneer" as const,
      line: [
        [36.6, -81.5],
        [36.61, -81.51],
      ] as [number, number][],
      widthFt: 10,
      note: "seen on the visit",
      at: "2026-10-12T12:00:00.000Z",
    };
    const drawn: ParcelStore = { ...STORE, built: [{ ...STORE.built[0]!, markup: [line] }] };
    expect(plan(file({}, drawn)).added[0]!.markup).toEqual([line]);
    const { markup: _m, ...older } = STORE.built[0]!;
    expect(plan(file({ parcels: { ...STORE, built: [older as never] } })).added[0]!.markup).toEqual([]);
  });
});

describe("version 3 (owner, #135): My order", () => {
  const order = (st: ParcelStore) => [...st.built].sort(byRank).map((x) => x.key);
  /** The file's own order: b above a. */
  const ranked: ParcelStore = {
    ...STORE,
    built: [
      { ...STORE.built[0]!, rank: "k" },
      { ...STORE.built[1]!, rank: "V" },
    ],
  };
  /** A version 2 file: no ranks, History oldest first. */
  const v2File = (built: unknown[]) =>
    JSON.stringify({ ...JSON.parse(file()), version: 2, parcels: { v: 2, open: null, built } });
  const unranked = (key: string, x0: number, id: string) => {
    const { rank: _r, ...p } = built(key, { pieces: [county(x0, id)] });
    return p;
  };

  it("the export writes History in My order, each parcel with its rank", () => {
    const f = JSON.parse(file({}, ranked)) as {
      version: number;
      parcels: { built: { key: string; rank: string }[] };
    };
    expect(f.version).toBe(6);
    expect(f.parcels.built.map((b) => [b.key, b.rank])).toEqual([
      ["b", "V"],
      ["a", "k"],
    ]);
  });

  it("round trip: a backup restored into an empty browser keeps My order; into a list, below what's there", () => {
    expect(order(applyImport(EMPTY_STORE, plan(file({}, ranked))))).toEqual(["b", "a"]);
    const mine: ParcelStore = {
      v: 2,
      open: null,
      built: [built("m", { pieces: [county(-81.34, "60-1")], rank: "z" })],
    };
    expect(order(applyImport(mine, plan(file({}, ranked), mine)))).toEqual(["m", "b", "a"]);
  });

  it("a version 2 file without ranks: ranked at the bottom in the file's order, and imported that way", () => {
    const v2 = v2File([unranked("old", -81.355, "52-47A"), unranked("new", -81.351, "52-48")]);
    const converted = fromV2(JSON.parse(v2) as Record<string, unknown>) as {
      version: number;
      parcels: { built: { key: string; rank: string }[] };
    };
    expect(converted.version).toBe(3);
    expect(converted.parcels.built.map((b) => [b.key, b.rank])).toEqual([
      ["old", "V"],
      ["new", "l"],
    ]);
    expect(order(applyImport(EMPTY_STORE, plan(v2)))).toEqual(["old", "new"]);
    // Into a list that has one: appended below it, still in the file's order.
    const mine: ParcelStore = {
      v: 2,
      open: null,
      built: [built("m", { pieces: [county(-81.34, "60-1")], rank: "z" })],
    };
    expect(order(applyImport(mine, plan(v2, mine)))).toEqual(["m", "old", "new"]);
  });

  it("a version 2 file with some ranks keeps them; the rest go after the highest, in the file's order", () => {
    const v2 = v2File([
      unranked("x", -81.355, "52-47A"),
      { ...unranked("y", -81.351, "52-48"), rank: "k" },
      { ...unranked("z", -81.347, "52-49"), rank: "not a rank!" },
    ]);
    const c = fromV2(JSON.parse(v2) as Record<string, unknown>) as { parcels: { built: { rank: string }[] } };
    expect(c.parcels.built[1]!.rank).toBe("k");
    expect(order(applyImport(EMPTY_STORE, plan(v2)))).toEqual(["y", "x", "z"]);
  });

  it("a version 1 file goes through both converters", () => {
    const v1 = JSON.stringify({ ...JSON.parse(v2File([unranked("old", -81.355, "52-47A")])), version: 1 });
    expect(plan(v1).added[0]).toMatchObject({ key: "old", rank: "V", status: "inProgress" });
  });
});

describe("version 4 (owner, WF4): point and area markers", () => {
  const spring = {
    id: "m1",
    name: "Spring 1",
    shape: "point" as const,
    kind: "spring" as const,
    ll: [36.629, -81.354] as [number, number],
    septicClass: null,
    note: "runs in August",
    at: "2026-10-14T12:00:00.000Z",
  };
  const field = {
    id: "m2",
    name: "Septic permit 1",
    shape: "area" as const,
    kind: "septic" as const,
    ring: [
      [36.6285, -81.3545],
      [36.6285, -81.354],
      [36.629, -81.354],
    ] as [number, number][],
    septicClass: "conventional" as const,
    note: "",
    at: "2026-10-14T12:00:00.000Z",
  };

  it("round trip: a point and an area marker come back as they were", () => {
    const store: ParcelStore = {
      ...STORE,
      built: [{ ...STORE.built[0]!, markup: [spring, field] }, STORE.built[1]!],
    };
    expect(JSON.parse(file({}, store))).toMatchObject({ version: 6 });
    expect(plan(file({}, store)).added[0]!.markup).toEqual([spring, field]);
  });

  it("a version 3 file: its lines, which have no shape, import as lines", () => {
    const v3Line = {
      id: "t1",
      name: "Gate lane",
      kind: "track",
      condition: "pioneer",
      line: [
        [36.6, -81.5],
        [36.61, -81.51],
      ],
      widthFt: 10,
      note: "",
      at: "2026-10-12T12:00:00.000Z",
    };
    const v4 = JSON.parse(file()) as { parcels: { built: Record<string, unknown>[] } };
    const v3 = {
      ...v4,
      version: 3,
      parcels: { ...v4.parcels, built: v4.parcels.built.map((b, i) => (i ? b : { ...b, markup: [v3Line] })) },
    };
    const converted = fromV3(v3) as {
      version: number;
      parcels: { built: { markup: { shape: string }[] }[] };
    };
    expect(converted.version).toBe(4);
    expect(converted.parcels.built[0]!.markup[0]!.shape).toBe("line");
    expect(plan(JSON.stringify(v3)).added[0]!.markup).toEqual([{ ...v3Line, shape: "line", recordedIn: "" }]);
  });
});

describe("version 5 (owner, WF5): the driveway choice and where an easement is recorded", () => {
  const easement = {
    id: "e1",
    name: "Red gate",
    shape: "line" as const,
    recordedIn: "Ashe Co. Plat Bk 574 Pg 1132",
    kind: "easement" as const,
    condition: "uncleared" as const,
    line: [
      [36.6, -81.5],
      [36.61, -81.51],
    ] as [number, number][],
    widthFt: 30,
    note: "",
    at: "2026-10-15T12:00:00.000Z",
  };

  it("round trip: the line chosen as the driveway, and its record", () => {
    const store: ParcelStore = {
      ...STORE,
      built: [{ ...STORE.built[0]!, markup: [easement], drivewayLine: "e1" }, STORE.built[1]!],
    };
    expect(JSON.parse(file({}, store))).toMatchObject({ version: 6 });
    expect(plan(file({}, store)).added[0]).toMatchObject({ drivewayLine: "e1", markup: [easement] });
  });

  it("a version 4 file: the app's pick, and no record on its lines", () => {
    const { recordedIn: _r, ...v4Line } = easement;
    const v5 = JSON.parse(file()) as { parcels: { built: Record<string, unknown>[] } };
    const v4 = {
      ...v5,
      version: 4,
      parcels: {
        ...v5.parcels,
        built: v5.parcels.built.map((b, i) => {
          const { drivewayLine: _d, ...rest } = b;
          return i ? rest : { ...rest, markup: [v4Line] };
        }),
      },
    };
    const converted = fromV4(v4) as {
      version: number;
      parcels: { built: { drivewayLine: unknown; markup: { recordedIn?: string }[] }[] };
    };
    expect(converted.version).toBe(5);
    expect(converted.parcels.built[0]).toMatchObject({ drivewayLine: null, markup: [{ recordedIn: "" }] });
    expect(plan(JSON.stringify(v4)).added[0]).toMatchObject({
      drivewayLine: null,
      markup: [{ recordedIn: "" }],
    });
  });
});

describe("version 6 (roadmap step 1, PR 6): the profile and its rubrics", () => {
  const RUBRICS = { mine: defaultRubric(), others: [JULIE] };
  const from = { profile: { name: "Zach" }, rubrics: RUBRICS };

  it("writes whose file it is and its rubrics; without them, null", () => {
    expect(buildExport(DEFAULT_USER_CONFIG, STORE, [], NOW, from)).toMatchObject({ version: 6, ...from });
    expect(buildExport(DEFAULT_USER_CONFIG, STORE, [], NOW)).toMatchObject({ profile: null, rubrics: null });
  });

  it("round trip: the plan carries the profile's name and the rubrics; the summary names the profile", () => {
    const text = JSON.stringify(buildExport(DEFAULT_USER_CONFIG, STORE, [screen("s1")], NOW, from));
    const p = plan(text);
    expect(p.profileName).toBe("Zach");
    expect(p.rubrics).toEqual(RUBRICS);
    expect(p.added).toHaveLength(2);
    expect(importSummary(p, "none")[1]).toBe("Exported from the profile Zach.");
  });

  it("a version 5 file: no profile and no rubrics, and it imports as before", () => {
    const v6 = JSON.parse(file()) as Record<string, unknown>;
    const { profile: _p, rubrics: _r, ...rest } = v6;
    const v5 = { ...rest, version: 5 };
    expect(fromV5(v5)).toMatchObject({ version: 6, profile: null, rubrics: null });
    const p = plan(JSON.stringify(v5));
    expect(p.profileName).toBeNull();
    expect(p.rubrics).toBeNull();
    expect(p.added).toHaveLength(2);
    expect(importSummary(p, "none")[1]).toMatch(/^Added: /);
  });

  it("rubrics that aren't a rubric fail the whole import", () => {
    const text = JSON.stringify({
      ...buildExport(DEFAULT_USER_CONFIG, STORE, [], NOW, from),
      rubrics: { mine: {} },
    });
    expect(errors(text).some((e) => e.startsWith("file.rubrics"))).toBe(true);
  });
});
