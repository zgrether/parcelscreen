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
 *
 * WF6: `reroute` re-runs a kept run's driveway for other drawn lines or another driveway choice
 * (docs/plans/wf6-reroute.md). It reroutes the run itself (`run`: the full run, or its last reroute), then re-applies
 * the house moved since, so the result is the one the run and the move would give with those lines. A newer reroute
 * of the same run supersedes one still going: only the latest is posted.
 */
import type { Feature, Polygon } from "geojson";
import { CancelledError, createHttpClient, type HttpClient } from "../http";
import { DemCache } from "./dem";
import { evaluateAt, reroute, screen, setHouse, type ScreenOutput, type ScreenSession } from "./index";
import type { OsmWay } from "./osmRoads";
import type { OsmPowerSource } from "./power";
import type { ParkingSource } from "./trailheadParking";
import type { PlacesSource } from "./placeData";
import type { Surfaces } from "./sites";
import { AtlasCache } from "./sky";
import type { SoilUnit } from "./soils";
import type { HorizonPoint } from "./sun";
import type { Dem, DrawnInput, ProgressEvent, ScreenInput, ScreenResult } from "./types";
import type { LatLon } from "./util";

export type ToWorker =
  | { type: "run"; id: number; input: ScreenInput }
  | { type: "cancel"; id: number }
  | { type: "evaluateAt"; id: number; ll: LatLon; label: string }
  | { type: "setHouse"; id: number; ll: LatLon | null }
  /** WF6: the kept run's driveway re-routed for these lines and this choice; answered as `updated`. */
  | { type: "reroute"; id: number; lines: DrawnInput[]; drivewayLine: string | null }
  /** Reopen a kept run at its own point (an unsaved re-evaluation is dropped): answered as `updated`. */
  | { type: "activate"; id: number }
  /** The page no longer needs this run's session. */
  | { type: "release"; id: number }
  /** Liveness check: the worker loaded and its modules evaluated. No network. */
  | { type: "ping"; id: number };

export type FromWorker =
  /** A run was received and is starting: sent at once, before any step (the page's start watchdog). */
  | { type: "started"; id: number }
  /**
   * While a run is going, every HEARTBEAT_MS: the worker's event loop is free during network waits, so silence
   * longer than its longest synchronous computation means it's gone (the page's watch, 18b).
   */
  | { type: "heartbeat"; id: number }
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

/** How often a running worker says it's alive. */
export const HEARTBEAT_MS = 5_000;

/** The worker never keeps more than this many sessions, whatever the page says (a missed release can't grow). */
export const MAX_SESSIONS = 3;

export interface WorkerCoreOptions {
  /** Defaults to a browser-mode client (no custom headers). */
  http?: HttpClient;
  sleep?: (ms: number) => Promise<void>;
  /** The baked places (step 14d): the browser entry reads its own origin's; tests leave it unset (endpoints.places). */
  places?: PlacesSource;
  /** The OSM roads query (VR3a), through the server route in the browser (see places.ts). */
  osmRoads?: (centre: LatLon, signal?: AbortSignal) => Promise<OsmWay[]>;
  /** The trailheads' parking (follow-up 54); defaults to the baked lots. */
  parking?: ParkingSource;
  /** OSM's power lines (step 14), likewise. */
  osmPower?: OsmPowerSource;
  /** Defaults to HEARTBEAT_MS; tests shorten it. */
  heartbeatMs?: number;
}

/**
 * A kept run: its own result (`base`), the one showing (`current`), the run a reroute starts from (`run`: the full
 * run, or its last reroute, WF6), and the house moved since (`house`), which a reroute re-applies.
 */
interface Kept {
  base: ScreenOutput;
  current: ScreenOutput;
  run: ScreenOutput;
  house?: { ll: LatLon | null };
}

/** The worker's state machine. One instance per worker; caches live for the worker's lifetime (the session). */
export class ScreenWorkerCore {
  private current: { id: number; abort: AbortController } | null = null;
  /** Kept runs, least recently used first. */
  private readonly sessions = new Map<number, Kept>();
  /** The reroute going for each kept run (WF6): a newer one aborts it. */
  private readonly rerouting = new Map<number, AbortController>();
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
        // A house re-assessment is kept as a new screen: it becomes the run's own result. A reroute re-applies it.
        return this.update(msg.id, (out) => setHouse(out, msg.ll), true, { ll: msg.ll });
      case "reroute":
        return this.reroute(msg.id, msg.lines, msg.drivewayLine);
      case "activate":
        return this.activate(msg.id);
      case "release":
        this.rerouting.get(msg.id)?.abort();
        this.sessions.delete(msg.id);
        return;
      case "ping":
        return this.post({ type: "pong", id: msg.id });
    }
  }

  private async run(id: number, input: ScreenInput): Promise<void> {
    this.post({ type: "started", id });
    this.current?.abort.abort(); // a new run supersedes the old one
    const abort = new AbortController();
    this.current = { id, abort };
    const live = () => this.current?.id === id;
    const beat = setInterval(
      () => live() && this.post({ type: "heartbeat", id }),
      this.opts.heartbeatMs ?? HEARTBEAT_MS,
    );
    try {
      const out = await screen(input, (event) => live() && this.post({ type: "progress", id, event }), {
        http: this.http,
        signal: abort.signal,
        demCache: this.demCache,
        atlas: this.atlas,
        ...(this.opts.sleep ? { sleep: this.opts.sleep } : {}),
        ...(this.opts.places ? { places: this.opts.places } : {}),
        ...(this.opts.osmRoads ? { osmRoads: this.opts.osmRoads } : {}),
        ...(this.opts.parking ? { parking: this.opts.parking } : {}),
        ...(this.opts.osmPower ? { osmPower: this.opts.osmPower } : {}),
      });
      if (!live()) return;
      this.keep(id, { base: out, current: out, run: out });
      this.post({
        type: "done",
        id,
        result: out.result,
        view: sessionView(out.session),
        bytes: sessionBytes(out),
      });
    } catch (e) {
      if (live()) this.post({ type: "error", id, message: (e as Error).message || String(e) });
    } finally {
      clearInterval(beat);
    }
  }

  /** Keeps a run's session as the most recently used, dropping the oldest above MAX_SESSIONS. */
  private keep(id: number, s: Kept): void {
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
    house?: { ll: LatLon | null },
  ): Promise<void> {
    const s = this.sessions.get(id);
    if (!s) return this.gone(id);
    try {
      const next = await fn(s.current);
      this.keep(id, {
        ...s,
        base: keepAsBase ? next : s.base,
        current: next,
        ...(house ? { house } : {}),
      });
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

  /**
   * WF6: the kept run rerouted for these lines and this choice, then the house moved since re-applied; kept as the
   * run's own result. Superseded by a newer reroute of the same run, it posts nothing.
   */
  private async reroute(id: number, lines: DrawnInput[], drivewayLine: string | null): Promise<void> {
    const s = this.sessions.get(id);
    if (!s) return this.gone(id);
    this.rerouting.get(id)?.abort();
    const abort = new AbortController();
    this.rerouting.set(id, abort);
    const live = () => !abort.signal.aborted;
    try {
      const run = await reroute(
        s.run,
        lines,
        drivewayLine,
        { signal: abort.signal, ...(this.opts.parking ? { parking: this.opts.parking } : {}) },
        (event) => live() && this.post({ type: "progress", id, event }),
      );
      if (!live()) return;
      // The house moved since the run, as it stands now (a move may have come in while this rerouted).
      const house = this.sessions.get(id)?.house ?? s.house;
      const next = house ? await setHouse(run, house.ll) : run;
      if (!live()) return;
      this.keep(id, { base: next, current: next, run, ...(house ? { house } : {}) });
      this.post({
        type: "updated",
        id,
        result: next.result,
        view: sessionView(next.session),
        bytes: sessionBytes(next),
      });
    } catch (e) {
      if (e instanceof CancelledError || !live()) return;
      this.post({ type: "error", id, message: (e as Error).message || String(e) });
    } finally {
      if (this.rerouting.get(id) === abort) this.rerouting.delete(id);
    }
  }

  private activate(id: number): void {
    const s = this.sessions.get(id);
    if (!s) return this.gone(id);
    this.keep(id, { ...s, base: s.base, current: s.base });
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
