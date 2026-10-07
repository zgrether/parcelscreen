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
  NOT_AN_EXPORT,
  planImport,
  settingsQuestion,
  type ImportPlan,
} from "./exportFile";
import { EMPTY_STORE, type ParcelStore } from "./parcelStore";
import type { ScreenRecord } from "./screenStore";

const NOW = "2026-10-07T15:00:00.000Z";
const RESULT = fromPrototype(loadFixture("ferney-creek-52-47A").goldens.run) as ScreenResult;
const screen = (id: string): ScreenRecord => ({
  id,
  keys: { boundary: "b", house: "", settings: "s" },
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

/** History with two parcels, one screened. */
const STORE: ParcelStore = {
  v: 2,
  open: null,
  built: [built("a", { screenIds: ["s1"] }), built("b", { pieces: [county(-81.351, "52-48")] })],
};
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
    expect(f).toMatchObject({ format: EXPORT_FORMAT, version: 1, exportedAt: NOW, parcels: STORE });
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

  it("into the same History: every parcel skipped and listed, nothing changes", () => {
    const p = plan(file(), STORE);
    expect(p.added).toEqual([]);
    expect(p.screens).toEqual([]);
    expect(p.skipped).toEqual(["52-47A", "52-48"]);
    expect(applyImport(STORE, p)).toEqual(STORE);
    expect(importSummary(p, "unchanged")).toEqual([
      "Imported 0 parcels",
      "Skipped, already in History: 52-47A, 52-48.",
      "Settings unchanged.",
    ]);
  });

  it("one bad screen record: nothing at all", () => {
    const bad = { ...screen("s1"), result: { ...RESULT, verdict: 42 } };
    expect(errors(file({ screens: [bad] as never }))[0]).toMatch(/^file\.screens\.0\.result\.verdict: /);
  });

  it("not an export: the prototype's hint, verbatim", () => {
    expect(errors("not json")).toEqual([NOT_AN_EXPORT]);
    expect(errors(JSON.stringify({ hello: 1 }))).toEqual([NOT_AN_EXPORT]);
    expect(errors(JSON.stringify([1]))).toEqual([NOT_AN_EXPORT]);
    expect(errors(file({ version: 2 as never }))).toEqual([
      "This export is version 2; this app reads version 1.",
    ]);
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

describe("settings from a file", () => {
  it("changed fields are listed by label, and the question names them", () => {
    const theirs = { ...DEFAULT_USER_CONFIG, houseMin: 55, timeZone: "America/Chicago" };
    const p = plan(file({}, STORE, theirs));
    expect(p.settings!.changed).toEqual([
      "House site: min cell score (0–100) (60 → 55)",
      "Time zone (America/New_York → America/Chicago)",
    ]);
    expect(settingsQuestion(p.settings!)).toBe(
      "Replace your settings with the file's?\n\nChanged: House site: min cell score (0–100) (60 → 55); Time zone (America/New_York → America/Chicago).",
    );
    expect(changedFields(DEFAULT_USER_CONFIG, { ...DEFAULT_USER_CONFIG, anchors: [] })).toEqual([
      "Drive-time anchors",
    ]);
  });

  it("the same checks as Save: a bad field fails the whole import", () => {
    const bad = { ...DEFAULT_USER_CONFIG, gardenMin: 300, endpoints: { ...DEFAULT_ENDPOINTS, _v: 12 } };
    expect(errors(file({ cfg: bad }))).toEqual([
      "Settings: Garden: min cell score — must be between 0 and 100",
      "Settings: Data endpoints — Endpoints are version 12; only version 11 is accepted, and older versions are replaced by defaults on load. Reset the endpoints, or update the list and set _v to 11.",
    ]);
  });

  it("hidden and unknown fields are ignored, current values kept, and named", () => {
    const theirs = { ...DEFAULT_USER_CONFIG, aspectFrom: 100, aspectTo: 225, extra: 1 };
    const p = plan(file({ cfg: theirs as never }));
    expect(p.ignored).toEqual(["Good aspect from (degrees) 100 (kept 90)", "extra"]);
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
    expect(p.settings).toEqual({ config: DEFAULT_USER_CONFIG, changed: [] });
    expect(p.endpointsReplaced).toBe(true);
    expect(p.ignored).toEqual(["Good aspect from (degrees)", "Good aspect to (degrees)", "_res3"]);
    expect(importSummary(p, "unchanged")).toContain(
      "The file's endpoints were an older version, so the defaults are used.",
    );
  });

  it("its saved parcels become History parcels, with no result: house, name and notes kept", () => {
    const p = plan(proto(undefined, [saved(), saved({ id: "x", name: "52-47A", notes: "" })]));
    expect(p.settings).toBeNull();
    const [a, b] = p.added;
    expect(a).toMatchObject({
      key: "new1",
      split: null,
      house: [36.629, -81.354],
      notes: "Ridge tract\n\nSpring on the north line.",
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
    // A name that's just the parcel ID adds nothing; an id that isn't a time stamps it now.
    expect(b).toMatchObject({ key: "new2", notes: "", notesAt: null, updatedAt: NOW });
    expect(p.sameRecord).toHaveLength(1); // the second is the same record as the first
  });

  it("is noted as the same county record as a port parcel from that record", () => {
    const p = plan(proto(undefined), STORE);
    expect(p.sameRecord).toEqual([expect.stringMatching(/^52-47A \(/)]);
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
      skipped: ["52-48"],
      sameRecord: [],
      settings: { config: DEFAULT_USER_CONFIG, changed: ["Data endpoints"] },
      ignored: ["extra"],
      endpointsReplaced: false,
    };
    expect(importSummary(p, "replaced")).toEqual([
      "Imported 1 parcels",
      "Added: 52-47A (with 2 kept results).",
      "Skipped, already in History: 52-48.",
      "Settings replaced. Changed: Data endpoints.",
      "Ignored (not in Settings): extra.",
    ]);
    expect(importSummary(p, "declined")[3]).toBe("Settings kept (you declined).");
    expect(T0 < NOW).toBe(true);
  });
});
