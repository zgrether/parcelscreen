/**
 * The Settings dialog's form ↔ UserConfig (step 16a; plan phase-0-16-settings.md §1). Pure, so it's
 * Node-tested: the dialog only renders what's here.
 *
 * The form holds text, exactly as typed. `toForm` writes a config out and `fromForm` reads it back, and the
 * round trip is exact (numbers via String/Number, anchors as "Name, lat, lon" lines, endpoints as indented
 * JSON in their stored key order), so saving without edits gives back the same config, byte for byte.
 */
import { DEFAULT_ENDPOINTS } from "@/lib/screen/config";
import { EndpointsSchema, UserConfigSchema, type Anchor, type UserConfig } from "@/lib/screen/types";

type ThresholdKey = Exclude<
  {
    [K in keyof UserConfig]: UserConfig[K] extends number ? K : never;
  }[keyof UserConfig],
  "aspectFrom" | "aspectTo"
>;
type CostKey = keyof UserConfig["dw"];

/** A numeric field: its id in the form, where it lives in the config, its label and its range. */
export interface NumberField {
  id: string;
  label: string;
  min: number;
  max?: number;
  /** The input's step, as the prototype's (L341–373); only a hint to the keyboard. */
  step?: number;
  get(c: UserConfig): number;
  set(c: UserConfig, v: number): UserConfig;
}

const threshold = (
  key: ThresholdKey,
  label: string,
  range: { min?: number; max?: number; step?: number } = {},
) =>
  ({
    id: key,
    label,
    min: range.min ?? 0,
    ...(range.max !== undefined ? { max: range.max } : {}),
    ...(range.step !== undefined ? { step: range.step } : {}),
    get: (c) => c[key],
    set: (c, v) => ({ ...c, [key]: v }),
  }) satisfies NumberField;

const cost = (key: CostKey, label: string, step?: number) =>
  ({
    id: `dw.${key}`,
    label,
    min: 0,
    ...(step !== undefined ? { step } : {}),
    get: (c) => c.dw[key],
    set: (c, v) => ({ ...c, dw: { ...c.dw, [key]: v } }),
  }) satisfies NumberField;

/**
 * Thresholds, in the prototype's order with its labels verbatim (L341–359), less the hidden aspect pair
 * (plan §9.4). Ranges are the ones the labels state (Q1): scores 0–100, the DEM cell size 1–30, else ≥ 0.
 */
export const THRESHOLD_FIELDS: readonly NumberField[] = [
  threshold("houseMin", "House site: min cell score (0–100)", { max: 100 }),
  threshold("benchMinAcres", "House site: min area (acres)", { step: 0.05 }),
  threshold("shelfMin", "Shelf (shop/barn): min cell score", { max: 100 }),
  threshold("shelfMinAcres", "Shelf: min area (acres)", { step: 0.05 }),
  threshold("compactMinAcres", "Compact site: shelf acres to rank as a cut-pad house site", { step: 0.05 }),
  threshold("gardenMin", "Garden: min cell score", { max: 100 }),
  threshold("gardenMinAcres", "Garden: min area (acres)", { step: 0.01 }),
  threshold("thermalMinFt", "Frost pocket: height above valley floor for full credit (ft)"),
  threshold("shallowBedrockCm", "Shallow bedrock warning (cm)"),
  threshold("sunHoursWanted", "Winter sun: hours of direct sun wanted", { step: 0.5 }),
  threshold("canopyDeg", "Tree canopy allowance on the horizon (degrees)", { step: 0.5 }),
  threshold("roadMaxGradePct", "Road grade warning (%)"),
  threshold("demResM", "DEM cell size (m, 1–30; 3 sees a house pad, 10 doesn't)", { min: 1, max: 30 }),
];

/** Driveway unit costs, in the prototype's order with its labels verbatim (L364–373). */
export const COST_FIELDS: readonly NumberField[] = [
  cost("clearPerAc", "Clearing $/acre"),
  cost("earthSoilPerYd", "Earthwork, soil $/yd³"),
  cost("earthRockPerYd", "Earthwork, rock $/yd³"),
  cost("stonePerTon", "Stone $/ton delivered"),
  cost("fabricPerSf", "Geotextile $/sq ft", 0.05),
  cost("culvertEach", "Culvert, each"),
  cost("entrance", "VDOT entrance"),
  cost("erosion", "Erosion control (flat)"),
  cost("mobilize", "Mobilization"),
  cost("woodedPct", "Corridor assumed wooded, %"),
];

export const NUMBER_FIELDS: readonly NumberField[] = [...THRESHOLD_FIELDS, ...COST_FIELDS];

export const ANCHORS_LABEL = "Drive-time anchors";
export const ENDPOINTS_LABEL = "Data endpoints";
export const TIME_ZONE_LABEL = "Time zone";

/**
 * Pairs of fields where the first may not exceed the second (owner, Q1). None is editable today: the only
 * pair, aspectFrom/aspectTo, is hidden. Ids from NUMBER_FIELDS.
 */
export const MIN_MAX_PAIRS: readonly (readonly [min: string, max: string])[] = [];

/** Endpoint keys that are counts, so must be whole numbers (owner, Q1): the rest are URLs. */
const ENDPOINT_INTEGERS = ["_v", "lpAtlasYear"] as const;

export interface SettingsForm {
  /** Each number field's text, by its id. */
  numbers: Record<string, string>;
  /** One per line: "Name, lat, lon". */
  anchors: string;
  /** The endpoints object as JSON. */
  endpoints: string;
  timeZone: string;
}

export interface FieldError {
  /** The form field: a NUMBER_FIELDS id, "anchors", "endpoints" or "timeZone". */
  id: string;
  /** Its label, as the dialog shows it. */
  label: string;
  reason: string;
}

export type FormResult = { ok: true; config: UserConfig } | { ok: false; errors: FieldError[] };

const anchorLine = (a: Anchor) => `${a.name}, ${a.lat}, ${a.lon}`;

export function toForm(c: UserConfig): SettingsForm {
  return {
    numbers: Object.fromEntries(NUMBER_FIELDS.map((f) => [f.id, String(f.get(c))])),
    anchors: c.anchors.map(anchorLine).join("\n"),
    endpoints: JSON.stringify(c.endpoints, null, 2),
    timeZone: c.timeZone,
  };
}

const fmtRange = (f: NumberField) =>
  f.max !== undefined ? `must be between ${f.min} and ${f.max}` : `must be ${f.min} or more`;

function parseNumber(f: NumberField, text: string): number | string {
  const t = text.trim();
  if (t === "") return "is empty";
  const v = Number(t);
  if (!Number.isFinite(v)) return "must be a number";
  if (v < f.min || (f.max !== undefined && v > f.max)) return fmtRange(f);
  return v;
}

/**
 * The anchors, one "Name, lat, lon" per line (proto L467: name, then lat and lon; extra commas after lon are
 * ignored, as there). Blank lines are skipped. The prototype silently dropped a bad line at use; here it's
 * named.
 */
export function parseAnchors(text: string): { anchors: Anchor[]; bad: string[] } {
  const anchors: Anchor[] = [],
    bad: string[] = [];
  text.split("\n").forEach((line, i) => {
    if (line.trim() === "") return;
    const [name = "", lat = "", lon = ""] = line.split(",").map((s) => s.trim());
    const la = Number(lat),
      lo = Number(lon);
    if (name === "" || lat === "" || lon === "") bad.push(`line ${i + 1} needs "Name, lat, lon"`);
    else if (!Number.isFinite(la) || la < -90 || la > 90)
      bad.push(`line ${i + 1}: latitude must be -90 to 90`);
    else if (!Number.isFinite(lo) || lo < -180 || lo > 180)
      bad.push(`line ${i + 1}: longitude must be -180 to 180`);
    else anchors.push({ name, lat: la, lon: lo });
  });
  return { anchors, bad };
}

const isHttps = (s: string): boolean => {
  try {
    return new URL(s).protocol === "https:";
  } catch {
    return false;
  }
};

/** The endpoints JSON: valid, the schema's shape, whole-number counts, https URLs, and a current `_v`. */
export function parseEndpoints(text: string): { endpoints: UserConfig["endpoints"] } | { reasons: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { reasons: [`isn't valid JSON (${(e as Error).message})`] };
  }
  const parsed = EndpointsSchema.safeParse(raw);
  if (!parsed.success)
    return {
      reasons: parsed.error.issues.map(
        (i) => `${i.path.length ? i.path.join(".") : "the object"}: ${i.message}`,
      ),
    };
  const e = parsed.data;
  const reasons: string[] = [];
  for (const k of ENDPOINT_INTEGERS) if (!Number.isInteger(e[k])) reasons.push(`${k} must be a whole number`);
  // The prototype's rule (L461, migrateEndpoints): an older `_v` is replaced by the defaults on the next load,
  // so saving one would silently lose the edit.
  if (e._v < DEFAULT_ENDPOINTS._v)
    reasons.push(`_v must be ${DEFAULT_ENDPOINTS._v} or more (older copies are replaced by the defaults)`);
  for (const [k, v] of Object.entries(e)) {
    if (typeof v === "string" && !isHttps(v)) reasons.push(`${k} must be an https URL`);
    if (Array.isArray(v))
      v.forEach((u, i) => {
        if (!isHttps(u)) reasons.push(`${k}[${i}] must be an https URL`);
      });
  }
  return reasons.length ? { reasons } : { endpoints: e };
}

/** A zone the browser (or Node) knows, e.g. "America/New_York". */
export function isTimeZone(tz: string): boolean {
  if (tz.trim() === "") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * The form back to a config, over `base` (the current config: it carries the fields the dialog doesn't
 * show). Every field is checked; on any failure there's no config, only the list of what failed.
 */
export function fromForm(
  form: SettingsForm,
  base: UserConfig,
  pairs: readonly (readonly [string, string])[] = MIN_MAX_PAIRS,
): FormResult {
  const errors: FieldError[] = [];
  let c: UserConfig = base;
  const values = new Map<string, number>();
  for (const f of NUMBER_FIELDS) {
    const v = parseNumber(f, form.numbers[f.id] ?? "");
    if (typeof v === "string") errors.push({ id: f.id, label: f.label, reason: v });
    else {
      values.set(f.id, v);
      c = f.set(c, v);
    }
  }
  for (const [lo, hi] of pairs) {
    const a = values.get(lo),
      b = values.get(hi);
    const fl = NUMBER_FIELDS.find((f) => f.id === lo),
      fh = NUMBER_FIELDS.find((f) => f.id === hi);
    if (a !== undefined && b !== undefined && fl && fh && a > b)
      errors.push({ id: lo, label: fl.label, reason: `must not be more than "${fh.label}"` });
  }

  const anchors = parseAnchors(form.anchors);
  for (const reason of anchors.bad) errors.push({ id: "anchors", label: ANCHORS_LABEL, reason });
  c = { ...c, anchors: anchors.anchors };

  const ep = parseEndpoints(form.endpoints);
  if ("reasons" in ep)
    for (const reason of ep.reasons) errors.push({ id: "endpoints", label: ENDPOINTS_LABEL, reason });
  else c = { ...c, endpoints: ep.endpoints };

  if (!isTimeZone(form.timeZone))
    errors.push({ id: "timeZone", label: TIME_ZONE_LABEL, reason: "isn't a known time zone" });
  else c = { ...c, timeZone: form.timeZone };

  if (errors.length) return { ok: false, errors };
  // In the schema's key order, as loadUserConfig returns it, so an unchanged config stringifies the same.
  const parsed = UserConfigSchema.safeParse(c);
  if (!parsed.success)
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => ({ id: "", label: i.path.join("."), reason: i.message })),
    };
  return { ok: true, config: parsed.data };
}

/** True when two configs would store the same bytes. */
export const sameConfig = (a: UserConfig, b: UserConfig): boolean => JSON.stringify(a) === JSON.stringify(b);
