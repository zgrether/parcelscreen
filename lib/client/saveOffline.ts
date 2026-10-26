/**
 * Save offline, the page's half (step 14e, docs/plans/step-14e-offline.md §4): the plan and its size for the open
 * parcel, then the downloads handed to the service worker (lib/offline/swSave.ts) with progress back over a message
 * channel. Before sending, the parcel's screens are made sure of on this device (a synced device fetches one it hasn't
 * got), and persistent storage is asked for (the first Save offline is a deliberate act; §3.4).
 */
import { bbox as turfBbox } from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { isKept, OFFLINE_LAYERS } from "@/components/Map/offlineLayers";
import { stateOf } from "@/lib/geo/parcelFields";
import type { ParcelRecord } from "@/lib/geo/parcels";
import { planSave, type SavePlan } from "@/lib/offline/plan";
import { averagesByLayer, type SavedParcel } from "@/lib/offline/store";
import type { SaveReply, SaveRequest } from "@/lib/offline/swSave";
import { DEFAULT_USER_CONFIG } from "@/lib/screen/config";
import { PLACE_FOLDERS, PLACES_PATH, PlacesIndexSchema } from "@/lib/screen/placeData";
import { getScreens } from "./screenStore";
import { requestPersist } from "./storage";

export interface SaveTarget {
  key: string;
  name: string;
  geo: Feature<Polygon | MultiPolygon>;
  pieces: readonly ParcelRecord[];
  /** Its screens: the last one, and each split piece's. */
  screenIds: readonly string[];
}

/** The places files that exist, by folder; null when the index can't be read (the save goes on without them). */
async function placeCells(): Promise<Record<string, string[]> | null> {
  try {
    const r = await fetch(`${PLACES_PATH}/index.json`);
    if (!r.ok) return null;
    const index = PlacesIndexSchema.parse(await r.json());
    return Object.fromEntries(PLACE_FOLDERS.map((f) => [f, Object.keys(index.cells[f] ?? {})]));
  } catch {
    return null;
  }
}

export async function planFor(t: SaveTarget): Promise<SavePlan> {
  const [west, south, east, north] = turfBbox(t.geo) as [number, number, number, number];
  const states = new Set(t.pieces.map((p) => stateOf(p.source)).filter((s) => s !== null));
  const cells = await placeCells();
  return planSave({
    parcel: { west, south, east, north },
    layers: OFFLINE_LAYERS.filter((l) => isKept(l)),
    // Drawn land has no county service: every service counts as the parcel's own.
    parcelServices: DEFAULT_USER_CONFIG.endpoints.parcels.map((url) => ({
      url,
      inState: !states.size || states.has(stateOf(url)!),
    })),
    places: cells ? { path: PLACES_PATH, cells } : null,
    averages: await averagesByLayer(),
  });
}

export type SaveOutcome =
  | { kind: "saved"; saved: SavedParcel }
  | { kind: "full" }
  | { kind: "cancelled" }
  /** No service worker (a development build, or the browser refused it): nothing can be kept. */
  | { kind: "unavailable" };

export interface SaveRun {
  cancel(): void;
  done: Promise<SaveOutcome>;
}

export function startSave(
  t: SaveTarget,
  plan: SavePlan,
  force: boolean,
  onProgress: (done: number, total: number, failed: number) => void,
): SaveRun {
  const channel = new MessageChannel();
  const done = (async (): Promise<SaveOutcome> => {
    const reg = await navigator.serviceWorker?.getRegistration("/");
    const worker = reg?.active;
    if (!worker) return { kind: "unavailable" };
    await getScreens(t.screenIds);
    void requestPersist();
    return new Promise<SaveOutcome>((resolve) => {
      channel.port1.onmessage = (e: MessageEvent<SaveReply>) => {
        const m = e.data;
        if (m.type === "progress") onProgress(m.done, m.total, m.failed);
        else if (m.type === "done") resolve({ kind: "saved", saved: m.saved });
        else resolve({ kind: m.type });
      };
      const req: SaveRequest = {
        type: "SAVE_OFFLINE",
        parcel: t.key,
        name: t.name,
        items: plan.items,
        force,
      };
      worker.postMessage(req, [channel.port2]);
    });
  })();
  return { cancel: () => channel.port1.postMessage({ type: "cancel" }), done };
}

/**
 * The one save running or last finished, for the sheet and the ⋯ item: closing the sheet doesn't stop a download, and
 * the ⋯ item shows its progress (plan §4.1). One at a time.
 */
export interface SaveState {
  target: SaveTarget;
  /** Null while the size is worked out. */
  plan: SavePlan | null;
  phase: "ask" | "saving" | "over";
  done: number;
  total: number;
  failed: number;
  outcome: SaveOutcome | null;
  /** The sheet is showing. */
  shown: boolean;
  force: boolean;
}

let state: SaveState | null = null;
let run: SaveRun | null = null;
const listeners = new Set<() => void>();
const set = (s: SaveState | null) => {
  state = s;
  for (const l of listeners) l();
};

export const saveState = (): SaveState | null => state;
export function onSaveState(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** ⋯ › Save offline (or Update offline copy): the sheet, with the size once it's known. */
export function askSave(target: SaveTarget, force: boolean): void {
  if (state?.phase === "saving") return set({ ...state, shown: true });
  set({ target, plan: null, phase: "ask", done: 0, total: 0, failed: 0, outcome: null, shown: true, force });
  void planFor(target).then((plan) => {
    if (state?.target.key === target.key && state.phase === "ask") set({ ...state, plan });
  });
}

export function confirmSave(): void {
  const s = state;
  if (!s?.plan || s.phase !== "ask") return;
  set({ ...s, phase: "saving", total: s.plan.items.length });
  run = startSave(s.target, s.plan, s.force, (done, total, failed) => {
    if (state?.phase === "saving") set({ ...state, done, total, failed });
  });
  void run.done.then((outcome) => {
    run = null;
    // Cancelled: the sheet goes (what downloaded is listed in Settings as Incomplete).
    if (state) set(outcome.kind === "cancelled" ? null : { ...state, phase: "over", outcome });
  });
}

export const cancelSave = (): void => run?.cancel();
export const hideSave = (): void => {
  if (!state) return;
  // Asked and not started, or over: gone; saving: hidden, still going.
  set(state.phase === "saving" ? { ...state, shown: false } : null);
};
