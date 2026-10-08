/**
 * Messages between the page and the screening Web Worker, and the worker's logic as a plain class so it
 * can be tested in Node without a Worker. worker.ts only wires this to `self`.
 *
 * Each request carries an `id`; a new `run` supersedes the previous one (its progress and result are
 * dropped), and `evaluateAt` / `setHouse` act on the run with that id. The worker keeps the session (DEMs,
 * caches) and sends the page a structured-clone-safe `SessionView`: only what the map and 3D need.
 *
 * Step 17e: the worker keeps the sessions of the last few runs (the page keeps up to 3, by recent use and a
 * size budget, and says which to drop with `release`; the worker also caps itself at MAX_SESSIONS). Each
 * keeps its run's own result (`base`: the run, or its last house re-assessment) and the current one (a pin
 * re-evaluation moves it). `activate` reopens a kept run at its own point, with no network.
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
  /** Reopen a kept run at its own point (an unsaved re-evaluation is dropped): answered as `updated`. */
  | { type: "activate"; id: number }
  /** The page no longer needs this run's session. */
  | { type: "release"; id: number }
  /** Liveness check: the worker loaded and its modules evaluated. No network. */
  | { type: "ping"; id: number };

export type FromWorker =
  | { type: "progress"; id: number; event: ProgressEvent }
  | { type: "done"; id: number; result: ScreenResult; view: SessionView; bytes: SessionBytes }
  | { type: "updated"; id: number; result: ScreenResult; view: SessionView; bytes: SessionBytes }
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

/** The bytes of a kept session's arrays: in the worker, and the view the page holds a copy of. */
export interface SessionBytes {
  session: number;
  view: number;
}

/** Bytes of every typed array reachable from `root` (each buffer once). */
export function arrayBytes(root: unknown): number {
  const buffers = new Set<ArrayBufferLike>();
  const seen = new WeakSet<object>();
  const walk = (v: unknown): void => {
    if (v === null || typeof v !== "object" || seen.has(v)) return;
    seen.add(v);
    if (ArrayBuffer.isView(v)) {
      buffers.add(v.buffer);
      return;
    }
    if (v instanceof Map) return v.forEach((x) => walk(x));
    for (const x of Object.values(v)) walk(x);
  };
  walk(root);
  let n = 0;
  buffers.forEach((b) => (n += b.byteLength));
  return n;
}

export const sessionBytes = (out: ScreenOutput): SessionBytes => ({
  session: arrayBytes(out.session),
  view: arrayBytes(sessionView(out.session)),
});

/** The worker never keeps more than this many sessions, whatever the page says (a missed release can't grow). */
export const MAX_SESSIONS = 3;

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
  /** Kept runs, least recently used first. */
  private readonly sessions = new Map<number, { base: ScreenOutput; current: ScreenOutput }>();
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
        return this.update(msg.id, (out) => evaluateAt(out, msg.ll, msg.label), false);
      case "setHouse":
        // A house re-assessment is kept as a new screen: it becomes the run's own result.
        return this.update(msg.id, (out) => setHouse(out, msg.ll), true);
      case "activate":
        return this.activate(msg.id);
      case "release":
        this.sessions.delete(msg.id);
        return;
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
      this.keep(id, { base: out, current: out });
      this.post({
        type: "done",
        id,
        result: out.result,
        view: sessionView(out.session),
        bytes: sessionBytes(out),
      });
    } catch (e) {
      if (live()) this.post({ type: "error", id, message: (e as Error).message || String(e) });
    }
  }

  /** Keeps a run's session as the most recently used, dropping the oldest above MAX_SESSIONS. */
  private keep(id: number, s: { base: ScreenOutput; current: ScreenOutput }): void {
    this.sessions.delete(id);
    this.sessions.set(id, s);
    for (const old of this.sessions.keys()) {
      if (this.sessions.size <= MAX_SESSIONS) break;
      if (old !== id) this.sessions.delete(old);
    }
  }

  private gone(id: number): void {
    this.post({ type: "error", id, message: "That screen is no longer available; run it again." });
  }

  private async update(
    id: number,
    fn: (out: ScreenOutput) => Promise<ScreenOutput>,
    keepAsBase: boolean,
  ): Promise<void> {
    const s = this.sessions.get(id);
    if (!s) return this.gone(id);
    try {
      const next = await fn(s.current);
      this.keep(id, { base: keepAsBase ? next : s.base, current: next });
      this.post({
        type: "updated",
        id,
        result: next.result,
        view: sessionView(next.session),
        bytes: sessionBytes(next),
      });
    } catch (e) {
      this.post({ type: "error", id, message: (e as Error).message || String(e) });
    }
  }

  private activate(id: number): void {
    const s = this.sessions.get(id);
    if (!s) return this.gone(id);
    this.keep(id, { base: s.base, current: s.base });
    const out = s.base;
    this.post({
      type: "updated",
      id,
      result: out.result,
      view: sessionView(out.session),
      bytes: sessionBytes(out),
    });
  }

  /** The kept runs, least recently used first (for tests). */
  keptIds(): number[] {
    return [...this.sessions.keys()];
  }
}
