/**
 * Export and import (step 16b; plan phase-0-16-settings.md §2, REQUIREMENTS §3a). Pure: the menu reads the
 * screens and the file, and writes what the plan says. Nothing here touches storage.
 *
 * The export is the port's own file, versioned by `format` and `version`: the settings, the parcel store and
 * the kept screens of its parcels. Phase 1 imports the same file into Supabase.
 *
 * Import reads the port's file or a prototype export (`{ cfg, saved[] }`, proto L1605). It validates the whole
 * file first and returns either a plan or the list of what's wrong; the caller applies all of a plan or none.
 * Every parcel is matched on its History key (owner, after #58): an identical key is skipped, never
 * overwritten. So is an identical recipe under another key (owner, #60). Anything else is added, including
 * another recipe of a county record already in History.
 */
import { z } from "zod";
import { DEFAULT_ENDPOINTS, DEFAULT_USER_CONFIG } from "@/lib/screen/config";
import { UserConfigSchema, type UserConfig } from "@/lib/screen/types";
import { historyRows, parcelName } from "./historyRows";
import { pieceDedupeKey } from "@/lib/geo/recipe";
import type { ParcelRecord } from "@/lib/geo/parcels";
import { LatLonSchema, RecordSchema } from "./currentParcel";
import { ParcelStoreSchema, type ParcelStore, type WorkingParcel } from "./parcelStore";
import { ScreenRecordSchema, type ScreenRecord } from "./screenStore";
import {
  ANCHORS_LABEL,
  ENDPOINTS_LABEL,
  fromForm,
  NUMBER_FIELDS,
  TIME_ZONE_LABEL,
  type SettingsForm,
} from "./settingsForm";

export const EXPORT_FORMAT = "parcelscreen-export";
export const EXPORT_VERSION = 1;
/** The prototype's hint for a file it can't read (L1611), verbatim. */
export const NOT_AN_EXPORT = "That file isn't a Parcel Screen export";

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  cfg: UserConfig;
  parcels: ParcelStore;
  screens: ScreenRecord[];
}

/** The screen ids History's parcels keep, in order, each once. */
export const keptScreenIds = (store: ParcelStore): string[] => [
  ...new Set(store.built.flatMap((b) => b.screenIds)),
];

export function buildExport(
  cfg: UserConfig,
  store: ParcelStore,
  screens: ScreenRecord[],
  now: string,
): ExportFile {
  return { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: now, cfg, parcels: store, screens };
}

/** `parcelscreen-YYYY-MM-DD.json`, as the prototype named its export (L1606). */
export const exportFileName = (now: string): string => `parcelscreen-${now.slice(0, 10)}.json`;

// ---------- reading a file ----------

const PortFileSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(EXPORT_VERSION),
  exportedAt: z.string(),
  cfg: z.unknown(),
  parcels: ParcelStoreSchema,
  screens: z.array(ScreenRecordSchema),
});

/** A prototype saved parcel (L1590): the boundary, its county attributes, the house, the name and notes. */
const ProtoSavedSchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  name: z.string().optional(),
  notes: z.string().optional(),
  geo: RecordSchema.shape.geo,
  props: z.record(z.string(), z.unknown()).nullable().optional(),
  house: LatLonSchema.nullable().optional(),
});
const ProtoFileSchema = z.object({
  cfg: z.unknown().optional(),
  saved: z.array(ProtoSavedSchema).optional(),
});

/** The prototype's labels for the hidden aspect pair (L349–350): named when an import ignores them. */
const HIDDEN_LABELS: Record<"aspectFrom" | "aspectTo", string> = {
  aspectFrom: "Good aspect from (degrees)",
  aspectTo: "Good aspect to (degrees)",
};

export interface SettingsChange {
  config: UserConfig;
  /** The changed fields by label, numbers with "(old → new)". Empty when the file's settings are yours. */
  changed: string[];
}

export interface ImportPlan {
  kind: "port" | "prototype";
  /** New History entries, with their keys. */
  added: WorkingParcel[];
  /** The kept screens of the added parcels. */
  screens: ScreenRecord[];
  /** Names of the file's parcels whose History key is already there. */
  skipped: string[];
  /** Names of the file's parcels whose recipe (pieces, split, drawn geometry) is already there, any key. */
  sameParcel: string[];
  /** Added parcels sharing a county record with another History parcel: name and what tells it apart. */
  sameRecord: string[];
  /** Null when the file has no settings. */
  settings: SettingsChange | null;
  /** Fields the dialog doesn't show, ignored (the current values kept). */
  ignored: string[];
  /** The file's endpoints were missing, unreadable or an older `_v`, so the defaults were used (L461). */
  endpointsReplaced: boolean;
}

export type ImportRead = { ok: true; plan: ImportPlan } | { ok: false; errors: string[] };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const issues = (prefix: string, e: z.ZodError): string[] =>
  e.issues.map((i) => `${[prefix, ...i.path].join(".")}: ${i.message}`);

/** A county record's identity without the state (the prototype's saved parcels don't know their service). */
const recordId = (r: ParcelRecord): string | null => pieceDedupeKey(r)?.split(":").slice(1).join(":") ?? null;

/**
 * A recipe's identity (owner, #60): its pieces, each by its source and geometry (a county record's, or the
 * drawn shape), in any order, and its split. The service's attributes don't count: they describe the same land.
 */
export function recipeIdentity(p: WorkingParcel): string {
  const pieces = p.pieces.map((x) => JSON.stringify([x.source, x.geo.geometry.coordinates])).sort();
  return JSON.stringify([pieces, p.split]);
}

/**
 * The file's settings, as the Settings form would hold them, so they pass the same checks as Save. Missing
 * fields take the defaults, as the prototype's loader did (L460); the hidden aspect pair and unknown fields
 * are ignored and named; endpoints that are missing, unreadable or older are replaced by the defaults.
 */
function settingsForm(
  raw: Record<string, unknown>,
  current: UserConfig,
  kind: ImportPlan["kind"],
): { form: SettingsForm; ignored: string[]; endpointsReplaced: boolean } {
  const ignored: string[] = [];
  const known = new Set(Object.keys(UserConfigSchema.shape));
  for (const k of Object.keys(raw)) {
    // The port's own file always carries the hidden pair: named only when it differs. A prototype's, always.
    if (k === "aspectFrom" || k === "aspectTo") {
      if (kind === "prototype" || raw[k] !== current[k])
        ignored.push(
          raw[k] === current[k]
            ? HIDDEN_LABELS[k]
            : `${HIDDEN_LABELS[k]} ${String(raw[k])} (kept ${current[k]})`,
        );
    } else if (!known.has(k)) ignored.push(k);
  }
  const dw = isRecord(raw.dw) ? raw.dw : {};
  for (const k of Object.keys(dw)) if (!(k in DEFAULT_USER_CONFIG.dw)) ignored.push(`dw.${k}`);

  const numbers: Record<string, string> = {};
  for (const f of NUMBER_FIELDS) {
    const [, costKey] = f.id.split(".");
    const v = costKey ? dw[costKey] : raw[f.id];
    numbers[f.id] = v === undefined ? String(f.get(DEFAULT_USER_CONFIG)) : String(v);
  }

  // Anchors: the prototype keeps text; the port, objects.
  const a = raw.anchors;
  const anchors =
    a === undefined
      ? DEFAULT_USER_CONFIG.anchors.map((x) => `${x.name}, ${x.lat}, ${x.lon}`).join("\n")
      : typeof a === "string"
        ? a
        : Array.isArray(a)
          ? a
              .map((x) => (isRecord(x) ? `${String(x.name)}, ${String(x.lat)}, ${String(x.lon)}` : String(x)))
              .join("\n")
          : String(a);

  // Endpoints: the prototype keeps a JSON string; the port, the object. The load rule (L461) first.
  let ep: unknown = raw.endpoints;
  if (typeof ep === "string")
    try {
      ep = JSON.parse(ep);
    } catch {
      ep = undefined;
    }
  const v = isRecord(ep) ? ep._v : undefined;
  const endpointsReplaced = !(typeof v === "number" && v >= DEFAULT_ENDPOINTS._v);
  const endpoints = JSON.stringify(endpointsReplaced ? DEFAULT_ENDPOINTS : ep, null, 2);

  // The prototype has no time zone (B5): yours stays.
  const timeZone =
    kind === "prototype" || raw.timeZone === undefined ? current.timeZone : String(raw.timeZone);
  return { form: { numbers, anchors, endpoints, timeZone }, ignored, endpointsReplaced };
}

/** The fields that differ, by label; numbers and the time zone with "(old → new)". */
export function changedFields(from: UserConfig, to: UserConfig): string[] {
  const out: string[] = [];
  for (const f of NUMBER_FIELDS)
    if (f.get(from) !== f.get(to)) out.push(`${f.label} (${f.get(from)} → ${f.get(to)})`);
  if (JSON.stringify(from.anchors) !== JSON.stringify(to.anchors)) out.push(ANCHORS_LABEL);
  if (JSON.stringify(from.endpoints) !== JSON.stringify(to.endpoints)) out.push(ENDPOINTS_LABEL);
  if (from.timeZone !== to.timeZone) out.push(`${TIME_ZONE_LABEL} (${from.timeZone} → ${to.timeZone})`);
  return out;
}

/** A prototype saved parcel as a History entry: its boundary as a "saved" piece, its house, name and notes. */
function fromPrototypeSaved(s: z.infer<typeof ProtoSavedSchema>, key: string, now: string): WorkingParcel {
  const piece: ParcelRecord = {
    geo: s.geo as ParcelRecord["geo"],
    props: s.props ?? {},
    source: "saved",
    multiPart: false,
  };
  // The prototype's id was Date.now() when it was saved.
  const at = typeof s.id === "number" && Number.isFinite(s.id) ? new Date(s.id).toISOString() : now;
  const p: WorkingParcel = {
    key,
    pieces: [piece],
    split: null,
    house: s.house ?? null,
    notes: "",
    notesAt: null,
    hidden: [],
    excluded: [],
    screenIds: [],
    updatedAt: at,
  };
  // History has no name field (owner, #60): the saved name is the notes' first line, exactly "Name: {name}",
  // then a blank line and any notes. Phase 1 lifts it into the parcel's name (REQUIREMENTS §3a).
  const name = s.name?.trim() ?? "";
  const notes = [name ? `Name: ${name}` : "", s.notes?.trim() ?? ""].filter((x) => x !== "").join("\n\n");
  return notes ? { ...p, notes, notesAt: at } : p;
}

/**
 * Reads a file against the current History and settings. Nothing is written: the result is the whole plan,
 * or every reason the file can't be imported.
 */
export function planImport(
  text: string,
  current: { store: ParcelStore; cfg: UserConfig },
  now: string,
  newKey: () => string,
): ImportRead {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, errors: [NOT_AN_EXPORT] };
  }
  if (!isRecord(json)) return { ok: false, errors: [NOT_AN_EXPORT] };

  let kind: ImportPlan["kind"];
  let incoming: WorkingParcel[];
  let fileScreens: ScreenRecord[] = [];
  let rawCfg: unknown;
  if (json.format === EXPORT_FORMAT) {
    if (json.version !== EXPORT_VERSION)
      return {
        ok: false,
        errors: [`This export is version ${String(json.version)}; this app reads version ${EXPORT_VERSION}.`],
      };
    const f = PortFileSchema.safeParse(json);
    if (!f.success) return { ok: false, errors: issues("file", f.error) };
    kind = "port";
    incoming = f.data.parcels.built as WorkingParcel[];
    fileScreens = f.data.screens as ScreenRecord[];
    rawCfg = f.data.cfg;
  } else if ("saved" in json || "cfg" in json) {
    const f = ProtoFileSchema.safeParse(json);
    if (!f.success) return { ok: false, errors: issues("file", f.error) };
    kind = "prototype";
    incoming = (f.data.saved ?? []).map((s) => fromPrototypeSaved(s, newKey(), now));
    rawCfg = f.data.cfg;
  } else return { ok: false, errors: [NOT_AN_EXPORT] };

  // Parcels: an identical History key is skipped; so is an identical recipe under another key (#60). History
  // itself isn't touched: duplicates already in it stay, for Phase 1's dedupe.
  const have = new Set(current.store.built.map((b) => b.key));
  const recipes = new Set(current.store.built.map(recipeIdentity));
  const added: WorkingParcel[] = [],
    skipped: string[] = [],
    sameParcel: string[] = [];
  for (const p of incoming) {
    const id = recipeIdentity(p);
    if (have.has(p.key)) skipped.push(parcelName(p).name);
    else if (recipes.has(id)) sameParcel.push(parcelName(p).name);
    else {
      have.add(p.key);
      recipes.add(id);
      added.push(p);
    }
  }
  // Another recipe of a record already in History (or added just before it): added, and noted.
  const seen = new Set(current.store.built.flatMap((b) => b.pieces.map(recordId)).filter((x) => x !== null));
  const after = historyRows([...current.store.built, ...added]);
  const sameRecord: string[] = [];
  for (const p of added) {
    const ids = p.pieces.map(recordId).filter((x): x is string => x !== null);
    if (ids.some((id) => seen.has(id))) {
      const row = after.find((r) => r.key === p.key)!;
      sameRecord.push(row.tellApart ? `${row.name} (${row.tellApart})` : row.name);
    }
    for (const id of ids) seen.add(id);
  }
  const wanted = new Set(added.flatMap((p) => p.screenIds));
  const screens = fileScreens.filter((s) => wanted.has(s.id));

  // Settings: the same checks as Save.
  const errors: string[] = [];
  let settings: SettingsChange | null = null,
    ignored: string[] = [],
    endpointsReplaced = false;
  if (rawCfg !== undefined) {
    if (!isRecord(rawCfg)) errors.push("Settings: not an object");
    else {
      const s = settingsForm(rawCfg, current.cfg, kind);
      ignored = s.ignored;
      endpointsReplaced = s.endpointsReplaced;
      const r = fromForm(s.form, current.cfg);
      if (!r.ok) for (const e of r.errors) errors.push(`Settings: ${e.label} — ${e.reason}`);
      else settings = { config: r.config, changed: changedFields(current.cfg, r.config) };
    }
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    plan: { kind, added, screens, skipped, sameParcel, sameRecord, settings, ignored, endpointsReplaced },
  };
}

/** History with the plan's parcels added; the open parcel isn't changed. */
export const applyImport = (store: ParcelStore, plan: ImportPlan): ParcelStore => ({
  ...store,
  built: [...store.built, ...plan.added],
});

/** The question before the settings are replaced, listing what changes. */
export const settingsQuestion = (s: SettingsChange): string =>
  `Replace your settings with the file's?\n\nChanged: ${s.changed.join("; ")}.`;

export type SettingsOutcome = "replaced" | "declined" | "unchanged" | "none";

/** The summary: the prototype's hint first (L1611), then what was added, skipped, changed and ignored. */
export function importSummary(plan: ImportPlan, outcome: SettingsOutcome): string[] {
  const names = (ps: WorkingParcel[]) => ps.map((p) => parcelName(p).name).join(", ");
  const lines = [`Imported ${plan.added.length} parcels`];
  if (plan.added.length)
    lines.push(
      `Added: ${names(plan.added)}${plan.screens.length ? ` (with ${plan.screens.length} kept result${plan.screens.length === 1 ? "" : "s"})` : ""}.`,
    );
  if (plan.skipped.length) lines.push(`Skipped, already in History: ${plan.skipped.join(", ")}.`);
  if (plan.sameParcel.length)
    lines.push(`Skipped, same parcel already in History: ${plan.sameParcel.join(", ")}.`);
  if (plan.sameRecord.length)
    lines.push(`Same county record, different recipe: ${plan.sameRecord.join(", ")}.`);
  if (outcome === "replaced" && plan.settings)
    lines.push(`Settings replaced. Changed: ${plan.settings.changed.join("; ")}.`);
  else if (outcome === "declined") lines.push("Settings kept (you declined).");
  else if (outcome === "unchanged") lines.push("Settings unchanged.");
  if (plan.ignored.length) lines.push(`Ignored (not in Settings): ${plan.ignored.join(", ")}.`);
  if (plan.endpointsReplaced && outcome !== "none" && outcome !== "declined")
    lines.push("The file's endpoints were an older version, so the defaults are used.");
  return lines;
}
