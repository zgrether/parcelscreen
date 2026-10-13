/**
 * Maps a prototype result object (`R`, as recorded in test/fixtures/<slug>/golden.json) onto ScreenResult,
 * so parity tests compare like with like. Every rename or drop between the prototype and the port happens
 * here and nowhere else (plan §5). ScreenResultSchema is strict, so a prototype field this mapping forgets
 * to handle fails the schema test instead of being silently ignored.
 */
import { STEPS } from "@/lib/screen/config";
import { DEFAULT_USER_CONFIG } from "@/lib/screen/config";
import { NEAREST_HOSPITAL } from "@/lib/screen/driveList";
import { UNSTAMPED_ENGINE } from "@/lib/screen/engine";
import { runParams, SCREEN_SCHEMA_VERSION } from "@/lib/screen/index";
import type { ScreenResult, Step } from "@/lib/screen/types";
import { isDeepStrictEqual } from "node:util";
import type { PrototypeResult } from "./fixtures";

/** Prototype fields that are session-only in the port (rasters, raw features) or input, not result. */
const SESSION_ONLY = ["parcel", "_horizon", "_roads", "_sfha", "sunAt"] as const;

type Loose = Record<string, unknown>;

function stepId(label: string): Step {
  const hit = STEPS.find(([, l]) => l === label);
  if (!hit) throw new Error(`fromPrototype: unknown step label "${label}"`);
  return hit[0];
}

function mapRoute(route: Loose, entrances: unknown[]): Loose {
  const { entrance, ...rest } = route;
  const entranceIndex = entrances.findIndex((e) => isDeepStrictEqual(e, entrance));
  if (entranceIndex < 0) throw new Error("fromPrototype: route entrance not among driveway.entrances");
  // v4 (VR3a): the prototype measured no route against the flood zones. v5 (follow-up 34): nor had drawn lines.
  return {
    ...rest,
    metrics: { ...(rest.metrics as Loose), sfhaFt: 0, drawnFt: 0 },
    entranceIndex,
    lines: [],
    existing: null,
  };
}

export function fromPrototype(R: PrototypeResult): ScreenResult {
  const r: Loose = { ...R };
  for (const k of SESSION_ONLY) delete r[k];

  // when → runAt; valleyFloorFt and benchDiag move into terrain.
  const { when, valleyFloorFt, benchDiag, ...out } = r;
  // The goldens were recorded with the default config, so their params are its (schema v2).
  const result: Loose = {
    schemaVersion: SCREEN_SCHEMA_VERSION,
    // The prototype's rules are engine 1 (lib/screen/engine.ts).
    engine: UNSTAMPED_ENGINE,
    runAt: when,
    params: runParams(DEFAULT_USER_CONFIG),
    ...out,
  };
  if (result.terrain) result.terrain = { ...(result.terrain as Loose), valleyFloorFt, diag: benchDiag };

  // Soil units: the pieces (geos) become `geometries`; `geo` (the first piece) is redundant.
  if (Array.isArray(result.soilUnits))
    result.soilUnits = (result.soilUnits as Loose[]).map(({ mukey, muname, acres, color, geos }) => ({
      mukey,
      muname,
      acres,
      color,
      geometries: geos,
    }));

  // Step labels → step ids.
  result.failed = (R.failed ?? []).map(stepId);

  // Routes shared their entrance object with driveway.entrances; the port stores an index instead.
  if (result.driveway) {
    const { _entrancesRoadsNearestFt, routes, direct, ...dw } = result.driveway as Loose;
    const entrances = (dw.entrances as unknown[]) ?? [];
    result.driveway = {
      ...dw,
      routes: (routes as Loose[]).map((rt) => mapRoute(rt, entrances)),
      ...(direct ? { direct: mapRoute(direct as Loose, entrances) } : {}),
      roadsNearestFt: _entrancesRoadsNearestFt ?? null,
      // v3 (B2a): the prototype had neither rule.
      practical: null,
      steepLanding: null,
      // v4 (VR3a): its entrances were all TIGER's.
      entrances: (entrances as Loose[]).map((e) => ({
        ...e,
        source: "tiger",
        reaches: null,
        line: null,
        roadClass: null,
      })),
    };
  }

  // v3 (B2a): each site's "no practical drive" outcome (none in the prototype). v4 (VR3a): it had no build
  // footprint (every site counts as fitting, with no gentle ground measured) and tested only the pin for flooding.
  if (Array.isArray(result.sites))
    result.sites = (result.sites as Loose[]).map((x) => ({
      ...x,
      practical: null,
      fit: "fits",
      gentleNearAc: 0,
      sfhaOnSite: !!x.flood,
    }));

  // v4 (VR3a): no step on the prototype's flags, and no record of a source that didn't answer.
  result.flags = ((result.flags as Loose[]) ?? []).map((f) => ({ ...f, step: null }));
  result.noResponse = [];
  // v5 (follow-up 34): no lines were drawn.
  result.lines = [];

  // v3 (B2a): the prototype's trailheads are all OpenStreetMap's; its hospital's emergency status is unknown, and it
  // had no closer grocery.
  if (result.near) {
    const n = result.near as Loose;
    // v6 (follow-up 54): and it drove to none of them.
    result.near = {
      ...n,
      trailheads: (n.trailheads as Loose[]).map((t) => ({ ...t, source: "osm", drive: null })),
    };
  }
  if (Array.isArray(result.drives)) {
    result.drives = (result.drives as Loose[]).map((d) => ({
      ...d,
      er: d.label === NEAREST_HOSPITAL ? "unknown" : null,
    }));
    result.closerGrocery = null;
  }

  return result as ScreenResult;
}
