/**
 * Messages between the page and the screening Web Worker, and the worker's logic as a plain class so it
 * can be tested in Node without a Worker. worker.ts only wires this to `self`.
 *
 * Each request carries an `id`; a new `run` supersedes the previous one (its progress and result are
 * dropped), and `evaluateAt` / `setHouse` act on the run with that id. The worker keeps the session (DEMs,
 * caches) and sends the page a structured-clone-safe `SessionView`: only what the map and 3D need.
 */
import type { Feature, Polygon } from "geojson";
import { createHttpClient, type HttpClient } from "../http";
import { DemCache } from "./dem";
import { evaluateAt, screen, setHouse, type ScreenOutput, type ScreenSession } from "./index";
import type { OverpassFallback } from "./places";
import type { Surfaces } from "./sites";
import { AtlasCache } from "./sky";
import type { SoilUnit } from "./soils";
import type { HorizonPoint } from "./sun";
import type { Dem, ProgressEvent, ScreenInput, ScreenResult } from "./types";
import type { LatLon } from "./util";

export type ToWorker =
  | { type: "run"; id: number; input: ScreenInput }
  | { type: "cancel"; id: number }
  | { type: "evaluateAt"; id: number; ll: LatLon; label: string }
  | { type: "setHouse"; id: number; ll: LatLon | null }
  /** Liveness check: the worker loaded and its modules evaluated. No network. */
  | { type: "ping"; id: number };

export type FromWorker =
  | { type: "progress"; id: number; event: ProgressEvent }
  | { type: "done"; id: number; result: ScreenResult; view: SessionView }
  | { type: "updated"; id: number; result: ScreenResult; view: SessionView }
  | { type: "error"; id: number; message: string }
  | { type: "pong"; id: number };

/** What rendering needs from the session (map overlays, fans, 3D). Copied to the page, never stored. */
export interface SessionView {
  parcel: Feature<Polygon>;
  house: LatLon | null;
  dFine?: Dem;
  dWide?: Dem;
  inside?: Uint8Array;
  slope?: Float32Array;
  surfaces?: Pick<Surfaces, "house" | "garden">;
  labels?: { house: Int32Array; shelf: Int32Array; garden: Int32Array };
  /** The highlighted house site in the suitability overlay. */
  bestId?: number;
  horizon?: HorizonPoint[];
  decAltByAz?: (number | null)[];
  /** Soil units with their pieces, for the 3D soil walls (the result has the same, as `geometries`). */
  units?: SoilUnit[] | null;
}

export function sessionView(s: ScreenSession): SessionView {
  return {
    parcel: s.parcel,
    house: s.house,
    ...(s.dFine ? { dFine: s.dFine } : {}),
    ...(s.dWide ? { dWide: s.dWide } : {}),
    ...(s.inside ? { inside: s.inside } : {}),
    ...(s.slope ? { slope: s.slope } : {}),
    ...(s.search
      ? {
          surfaces: { house: s.search.surfaces.house, garden: s.search.surfaces.garden },
          labels: { house: s.search.label, shelf: s.search.shelfLabel, garden: s.search.gardenLabel },
        }
      : {}),
    ...(s.bestId != null ? { bestId: s.bestId } : {}),
    ...(s.horizon ? { horizon: s.horizon } : {}),
    ...(s.decAltByAz ? { decAltByAz: s.decAltByAz } : {}),
    ...(s.units !== undefined ? { units: s.units } : {}),
  };
}

export interface WorkerCoreOptions {
  /** Defaults to a browser-mode client (no custom headers). */
  http?: HttpClient;
  sleep?: (ms: number) => Promise<void>;
  /** The browser entry passes the server route (see places.ts); tests leave it unset. */
  overpass?: OverpassFallback;
}

/** The worker's state machine. One instance per worker; caches live for the worker's lifetime (the session). */
export class ScreenWorkerCore {
  private current: { id: number; abort: AbortController } | null = null;
  private readonly outputs = new Map<number, ScreenOutput>();
  private readonly demCache = new DemCache();
  private readonly atlas = new AtlasCache();
  private readonly http: HttpClient;

  constructor(
    private readonly post: (m: FromWorker) => void,
    private readonly opts: WorkerCoreOptions = {},
  ) {
    this.http = opts.http ?? createHttpClient({ env: "browser" });
  }

  async handle(msg: ToWorker): Promise<void> {
    switch (msg.type) {
      case "run":
        return this.run(msg.id, msg.input);
      case "cancel":
        if (this.current?.id === msg.id) this.current.abort.abort();
        return;
      case "evaluateAt":
        return this.update(msg.id, (out) => evaluateAt(out, msg.ll, msg.label));
      case "setHouse":
        return this.update(msg.id, (out) => setHouse(out, msg.ll));
      case "ping":
        return this.post({ type: "pong", id: msg.id });
    }
  }

  private async run(id: number, input: ScreenInput): Promise<void> {
    this.current?.abort.abort(); // a new run supersedes the old one
    const abort = new AbortController();
    this.current = { id, abort };
    const live = () => this.current?.id === id;
    try {
      const out = await screen(input, (event) => live() && this.post({ type: "progress", id, event }), {
        http: this.http,
        signal: abort.signal,
        demCache: this.demCache,
        atlas: this.atlas,
        ...(this.opts.sleep ? { sleep: this.opts.sleep } : {}),
        ...(this.opts.overpass ? { overpass: this.opts.overpass } : {}),
      });
      if (!live()) return;
      this.outputs.clear(); // only the latest run can be re-evaluated
      this.outputs.set(id, out);
      this.post({ type: "done", id, result: out.result, view: sessionView(out.session) });
    } catch (e) {
      if (live()) this.post({ type: "error", id, message: (e as Error).message || String(e) });
    }
  }

  private async update(id: number, fn: (out: ScreenOutput) => Promise<ScreenOutput>): Promise<void> {
    const out = this.outputs.get(id);
    if (!out)
      return this.post({ type: "error", id, message: "That screen is no longer available; run it again." });
    try {
      const next = await fn(out);
      this.outputs.set(id, next);
      this.post({ type: "updated", id, result: next.result, view: sessionView(next.session) });
    } catch (e) {
      this.post({ type: "error", id, message: (e as Error).message || String(e) });
    }
  }
}
