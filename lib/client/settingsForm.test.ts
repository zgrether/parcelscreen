import { describe, expect, it } from "vitest";
import { DEFAULT_ENDPOINTS, DEFAULT_USER_CONFIG } from "@/lib/screen/config";
import type { UserConfig } from "@/lib/screen/types";
import { prototypeConst, prototypeFn } from "@/test/support/prototypeFns";
import type { KeyValueStore } from "./prefs";
import {
  COST_FIELDS,
  fromForm,
  NUMBER_FIELDS,
  parseAnchors,
  sameConfig,
  THRESHOLD_FIELDS,
  toForm,
  type SettingsForm,
} from "./settingsForm";
import { loadUserConfig, saveUserConfig } from "./userConfig";

type ProtoDefaults = Record<string, unknown> & {
  dw: Record<string, unknown>;
  anchors: string;
  endpoints: string;
};
const PROTO = prototypeConst<ProtoDefaults>("DEFAULTS");

const memory = (init: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } => {
  const data = { ...init };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
};

const ok = (r: ReturnType<typeof fromForm>): UserConfig => {
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.config;
};
const errorsOf = (r: ReturnType<typeof fromForm>) => (r.ok ? [] : r.errors);
const edit = (patch: Partial<SettingsForm> & { n?: Record<string, string> }): SettingsForm => {
  const f = toForm(DEFAULT_USER_CONFIG);
  return { ...f, ...patch, numbers: { ...f.numbers, ...patch.n } };
};

describe("the defaults are the prototype's (owner, step 16)", () => {
  it("field by field, types included; the only differences are named", () => {
    const port = DEFAULT_USER_CONFIG as unknown as Record<string, unknown>;
    // Every prototype default the port keeps as a plain value: same value, same type.
    const scalars = Object.keys(PROTO).filter((k) => !["dw", "anchors", "endpoints"].includes(k));
    expect(scalars.length).toBe(15); // the 13 thresholds shown, and the hidden aspect pair
    for (const k of scalars) {
      expect(typeof port[k], k).toBe(typeof PROTO[k]);
      expect(port[k], k).toBe(PROTO[k]);
    }
    expect(Object.keys(DEFAULT_USER_CONFIG.dw)).toEqual(Object.keys(PROTO.dw));
    for (const [k, v] of Object.entries(PROTO.dw)) {
      expect(typeof DEFAULT_USER_CONFIG.dw[k as keyof UserConfig["dw"]], k).toBe(typeof v);
      expect(DEFAULT_USER_CONFIG.dw[k as keyof UserConfig["dw"]], k).toBe(v);
    }

    // Anchors: the prototype's text, read by its own parser (L467), is the port's list.
    const anchors = prototypeFn<() => unknown>("anchors", { CFG: PROTO });
    expect(DEFAULT_USER_CONFIG.anchors).toEqual(anchors());

    // Endpoints: the prototype's JSON string is the port's object, except _v and overpass (#18), and the
    // official trailhead sources the port adds (follow-up 24, Batch A A2b).
    const protoEndpoints = JSON.parse(PROTO.endpoints) as Record<string, unknown>;
    const portEndpoints = DEFAULT_ENDPOINTS as unknown as Record<string, unknown>;
    const ADDED = ["usfsRecSites", "stateParks"];
    expect(Object.keys(portEndpoints).filter((k) => !ADDED.includes(k))).toEqual(Object.keys(protoEndpoints));
    const differ = Object.keys(protoEndpoints).filter(
      (k) => JSON.stringify(protoEndpoints[k]) !== JSON.stringify(portEndpoints[k]),
    );
    expect(differ).toEqual(["_v", "overpass"]);
    expect([protoEndpoints._v, portEndpoints._v]).toEqual([10, 12]);
    for (const k of Object.keys(protoEndpoints))
      expect(typeof portEndpoints[k], k).toBe(typeof protoEndpoints[k]);

    // timeZone is the only port-only setting (B5).
    expect(Object.keys(port).filter((k) => !(k in PROTO))).toEqual(["timeZone"]);
  });

  it("the dialog shows the prototype's fields with its labels, less the hidden aspect pair", () => {
    expect(THRESHOLD_FIELDS.map((f) => f.id)).toEqual([
      "houseMin",
      "benchMinAcres",
      "shelfMin",
      "shelfMinAcres",
      "compactMinAcres",
      "gardenMin",
      "gardenMinAcres",
      "thermalMinFt",
      "shallowBedrockCm",
      "sunHoursWanted",
      "canopyDeg",
      "roadMaxGradePct",
      "demResM",
    ]);
    expect(COST_FIELDS.map((f) => f.id)).toEqual(Object.keys(PROTO.dw).map((k) => `dw.${k}`));
  });
});

describe("saving without edits", () => {
  it("gives back the same config, byte for byte, for the defaults and for an edited config", () => {
    expect(
      sameConfig(ok(fromForm(toForm(DEFAULT_USER_CONFIG), DEFAULT_USER_CONFIG)), DEFAULT_USER_CONFIG),
    ).toBe(true);
    const edited: UserConfig = {
      ...DEFAULT_USER_CONFIG,
      houseMin: 55,
      gardenMinAcres: 0.07,
      canopyDeg: 4.5,
      dw: { ...DEFAULT_USER_CONFIG.dw, fabricPerSf: 0.8 },
      anchors: [...DEFAULT_USER_CONFIG.anchors, { name: "Boone (NC)", lat: 36.2168, lon: -81.6746 }],
      timeZone: "America/Chicago",
    };
    const stored = memory();
    saveUserConfig(edited, stored);
    const loaded = loadUserConfig(stored);
    const again = ok(fromForm(toForm(loaded), loaded));
    expect(JSON.stringify(again)).toBe(stored.data["ps.cfg"]);
  });

  it("an unchanged form is the same config, so Save writes nothing", () => {
    const c = loadUserConfig(memory());
    expect(sameConfig(ok(fromForm(toForm(c), c)), c)).toBe(true);
    const changed = ok(fromForm({ ...toForm(c), numbers: { ...toForm(c).numbers, houseMin: "61" } }, c));
    expect(sameConfig(changed, c)).toBe(false);
    expect(changed.houseMin).toBe(61);
  });

  it("keeps the fields the dialog doesn't show", () => {
    const base = { ...DEFAULT_USER_CONFIG, aspectFrom: 100, aspectTo: 200 };
    const c = ok(fromForm(toForm(base), base));
    expect([c.aspectFrom, c.aspectTo]).toEqual([100, 200]);
  });
});

describe("validation (owner, Q1): Save names the field and the reason", () => {
  it("numbers: empty, not a number, out of the stated range", () => {
    const r = fromForm(
      edit({
        n: { houseMin: "", benchMinAcres: "abc", gardenMin: "101", demResM: "0.5", "dw.mobilize": "-1" },
      }),
      DEFAULT_USER_CONFIG,
    );
    expect(errorsOf(r).map((e) => `${e.label} — ${e.reason}`)).toEqual([
      "House site: min cell score (0–100) — is empty",
      "House site: min area (acres) — must be a number",
      "Garden: min cell score — must be between 0 and 100",
      "DEM cell size (m, 1–30; 3 sees a house pad, 10 doesn't) — must be between 1 and 30",
      "Mobilization — must be 0 or more",
    ]);
  });

  it("every number field has its range", () => {
    for (const f of NUMBER_FIELDS) {
      expect(
        errorsOf(fromForm(edit({ n: { [f.id]: String(f.min - 1) } }), DEFAULT_USER_CONFIG)),
      ).toHaveLength(1);
      if (f.max !== undefined)
        expect(
          errorsOf(fromForm(edit({ n: { [f.id]: String(f.max + 1) } }), DEFAULT_USER_CONFIG)),
        ).toHaveLength(1);
      expect(errorsOf(fromForm(edit({ n: { [f.id]: "Infinity" } }), DEFAULT_USER_CONFIG))[0]?.reason).toBe(
        "must be a number",
      );
    }
  });

  it("min ≤ max for every pair (none is editable today, so a test-only pair)", () => {
    const pair = [["houseMin", "gardenMin"]] as const;
    expect(fromForm(edit({ n: { houseMin: "70", gardenMin: "60" } }), DEFAULT_USER_CONFIG, pair)).toEqual({
      ok: false,
      errors: [
        {
          id: "houseMin",
          label: "House site: min cell score (0–100)",
          reason: 'must not be more than "Garden: min cell score"',
        },
      ],
    });
    expect(fromForm(edit({ n: { houseMin: "60", gardenMin: "60" } }), DEFAULT_USER_CONFIG, pair).ok).toBe(
      true,
    );
  });

  it("anchors: each bad line named; blank lines skipped", () => {
    expect(
      parseAnchors("A, 36.1, -81.2\n\nB, 91, 0\nC, 36, -181\nD, 36\n, 1, 2\nE, 36.5, -81, extra"),
    ).toEqual({
      anchors: [
        { name: "A", lat: 36.1, lon: -81.2 },
        { name: "E", lat: 36.5, lon: -81 },
      ],
      bad: [
        "line 3: latitude must be -90 to 90",
        "line 4: longitude must be -180 to 180",
        'line 5 needs "Name, lat, lon"',
        'line 6 needs "Name, lat, lon"',
      ],
    });
    expect(errorsOf(fromForm(edit({ anchors: "X, north, 1" }), DEFAULT_USER_CONFIG))).toEqual([
      { id: "anchors", label: "Drive-time anchors", reason: "line 1: latitude must be -90 to 90" },
    ]);
  });

  it("endpoints: JSON, the schema, whole-number counts, https, a current _v", () => {
    const reasons = (e: unknown) =>
      errorsOf(
        fromForm(edit({ endpoints: typeof e === "string" ? e : JSON.stringify(e) }), DEFAULT_USER_CONFIG),
      ).map((x) => `${x.label} — ${x.reason}`);
    expect(reasons("{ nope")[0]).toMatch(/^Data endpoints — isn't valid JSON/);
    expect(reasons({ ...DEFAULT_ENDPOINTS, photon: 3 })).toEqual([
      "Data endpoints — photon: Invalid input: expected string, received number",
    ]);
    expect(reasons({ ...DEFAULT_ENDPOINTS, lpAtlasYear: 2025.5 })).toEqual([
      "Data endpoints — lpAtlasYear must be a whole number",
    ]);
    // Only the current version, 12 since A2b (owner, #59), with the owner's wording, below or above.
    expect(reasons({ ...DEFAULT_ENDPOINTS, _v: 11 })).toEqual([
      "Data endpoints — Endpoints are version 11; only version 12 is accepted, and older versions are replaced by defaults on load. Reset the endpoints, or update the list and set _v to 12.",
    ]);
    expect(reasons({ ...DEFAULT_ENDPOINTS, _v: 13 })).toEqual([
      "Data endpoints — Endpoints are version 13; only version 12 is accepted, and older versions are replaced by defaults on load. Reset the endpoints, or update the list and set _v to 12.",
    ]);
    expect(reasons({ ...DEFAULT_ENDPOINTS, _v: 12 })).toEqual([]);
    expect(
      reasons({
        ...DEFAULT_ENDPOINTS,
        osrm: "http://router.project-osrm.org/route/v1/driving",
        overpass: ["https://a.example", "ftp://b"],
      }),
    ).toEqual([
      "Data endpoints — overpass[1] must be an https URL",
      "Data endpoints — osrm must be an https URL",
    ]);
  });

  it("time zone: a known IANA zone", () => {
    expect(errorsOf(fromForm(edit({ timeZone: "America/Nowhere" }), DEFAULT_USER_CONFIG))).toEqual([
      { id: "timeZone", label: "Time zone", reason: "isn't a known time zone" },
    ]);
    expect(fromForm(edit({ timeZone: "Europe/Dublin" }), DEFAULT_USER_CONFIG).ok).toBe(true);
  });

  it("on failure there's no config at all, so nothing can be stored", () => {
    const r = fromForm(edit({ n: { houseMin: "55", gardenMin: "x" } }), DEFAULT_USER_CONFIG);
    expect(r.ok).toBe(false);
    expect("config" in r).toBe(false);
  });

  it("Reset: the defaults' form reads back as the defaults", () => {
    const edited = { ...DEFAULT_USER_CONFIG, houseMin: 40 };
    expect(ok(fromForm(toForm(DEFAULT_USER_CONFIG), edited))).toEqual(DEFAULT_USER_CONFIG);
  });
});
