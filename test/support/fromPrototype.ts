/**
 * Maps a prototype result object (`R`, as recorded in test/fixtures/<slug>/golden.json) onto ScreenResult,
 * so parity tests compare like with like. Every rename or drop between the prototype and the port happens
 * here and nowhere else (plan §5). ScreenResultSchema is strict, so a prototype field this mapping forgets
 * to handle fails the schema test instead of being silently ignored.
 */
import { STEPS } from "@/lib/screen/config";
import { DEFAULT_USER_CONFIG } from "@/lib/screen/config";
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
  return { ...rest, entranceIndex };
}

export function fromPrototype(R: PrototypeResult): ScreenResult {
  const r: Loose = { ...R };
  for (const k of SESSION_ONLY) delete r[k];

  // when → runAt; valleyFloorFt and benchDiag move into terrain.
  const { when, valleyFloorFt, benchDiag, ...out } = r;
  // The goldens were recorded with the default config, so their params are its (schema v2).
  const result: Loose = {
    schemaVersion: SCREEN_SCHEMA_VERSION,
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
    };
  }

  return result as ScreenResult;
}
