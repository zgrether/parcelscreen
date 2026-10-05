/**
 * Dark skies from the Light Pollution Atlas (David Lorenz): binary tiles of 5°×5° at 1/120°, gzip,
 * differential-coded. Zenith ratio → zone and mag/arcsec², light domes sampled around the compass, the
 * galactic core's peak altitude against the southern ridge, and the sky score.
 * Ported verbatim (proto L812–840, L1086–1091, L1262–1277). Decoded tiles are memoized per session
 * (CLAUDE.md: "the sky step samples the atlas 24×6 times; memoize tile decoding").
 */
import { destination } from "@turf/turf";
import { compass } from "../format";
import type { HttpClient } from "../http";
import { SCREEN_CONSTANTS } from "./config";
import type { HorizonPoint } from "./sun";
import type { Endpoints, ScreenResult } from "./types";
import type { LatLon } from "./util";

const K = SCREEN_CONSTANTS.sky;

interface AtlasTile {
  vals: Float32Array;
  year: number;
}

/** Decoded atlas tiles for the session. A failed tile isn't kept, so the next run retries it. */
export class AtlasCache {
  readonly tiles = new Map<string, Promise<AtlasTile>>();
}

export interface SkyDeps {
  http: HttpClient;
  endpoints: Endpoints;
  signal?: AbortSignal;
  atlas?: AtlasCache;
}

async function gunzip(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const ds = new DecompressionStream("gzip");
  return new Response(new Blob([buf]).stream().pipeThrough(ds)).arrayBuffer();
}

/** Undoes the atlas's differential coding: a 600×600 grid of brightness codes (proto L826–827). */
export function decodeAtlasTile(d: Int8Array): Float32Array {
  const vals = new Float32Array(360000);
  let base = 128 * d[0]! + d[1]!;
  for (let iy = 1; iy <= 600; iy++) {
    if (iy > 1) base += d[600 * (iy - 1) + 1]!;
    let v = base;
    vals[(iy - 1) * 600] = v;
    for (let ix = 2; ix <= 600; ix++) {
      v += d[600 * (iy - 1) + ix]!;
      vals[(iy - 1) * 600 + ix - 1] = v;
    }
  }
  return vals;
}

function atlasTile(tilex: number, tiley: number, deps: SkyDeps): Promise<AtlasTile> {
  const key = `${tilex}_${tiley}`;
  const hit = deps.atlas?.tiles.get(key);
  if (hit) return hit;
  const p = (async () => {
    // The configured year, the year before, then 2022 (B3: the year comes from endpoints, as intended).
    let year = +deps.endpoints.lpAtlasYear || 2025,
      r: Response | null = null;
    for (const y of [year, year - 1, K.atlasFinalFallbackYear]) {
      r = await deps.http.fetch(`${deps.endpoints.lpAtlasBinary}/${y}/binary_tile_${tilex}_${tiley}.dat.gz`, {
        timeoutMs: K.timeoutMs,
        ...(deps.signal ? { signal: deps.signal } : {}),
      });
      if (r.ok) {
        year = y;
        break;
      }
      r = null;
    }
    if (!r) throw new Error("atlas tile unavailable");
    return { vals: decodeAtlasTile(new Int8Array(await gunzip(await r.arrayBuffer()))), year };
  })();
  deps.atlas?.tiles.set(key, p);
  p.catch(() => deps.atlas?.tiles.delete(key));
  return p;
}

/** Artificial / natural sky brightness at the zenith, or null outside the atlas (proto L832–838). */
export async function lpRatioAt(
  lat: number,
  lon: number,
  deps: SkyDeps,
): Promise<{ ratio: number; year: number } | null> {
  const lonF = (((lon + 180) % 360) + 360) % 360,
    latF = lat + 65;
  const tilex = Math.floor(lonF / 5) + 1,
    tiley = Math.floor(latF / 5) + 1;
  if (tiley < 1 || tiley > 28) return null;
  const ix = Math.max(1, Math.min(600, Math.round(120 * (lonF - 5 * (tilex - 1) + 1 / 240)))),
    iy = Math.max(1, Math.min(600, Math.round(120 * (latF - 5 * (tiley - 1) + 1 / 240))));
  const t = await atlasTile(tilex, tiley, deps);
  const x = t.vals[(iy - 1) * 600 + ix - 1]!;
  return { ratio: (5 / 195) * (Math.exp(0.0195 * x) - 1), year: t.year };
}

/** Bortle-style zone and a word for it, from the ratio (proto L839). */
export function lpZone(r: number): [zone: string, word: string] {
  return r < 0.01
    ? ["0", "pristine"]
    : r < 0.06
      ? ["1a", "pristine"]
      : r < 0.11
        ? ["1b", "excellent"]
        : r < 0.19
          ? ["2a", "very dark"]
          : r < 0.33
            ? ["2b", "very dark"]
            : r < 0.58
              ? ["3a", "rural dark"]
              : r < 1.0
                ? ["3b", "rural"]
                : r < 1.73
                  ? ["4a", "rural–suburban"]
                  : r < 3.0
                    ? ["4b", "suburban edge"]
                    : r < 5.2
                      ? ["5a", "suburban"]
                      : r < 9.0
                        ? ["5b", "bright suburban"]
                        : r < 15.59
                          ? ["6a", "urban"]
                          : r < 27
                            ? ["6b", "urban"]
                            : ["7", "city"];
}

/** Zenith sky brightness, mag/arcsec² (22.0 is pristine), from the ratio (proto L840). */
export const lpMag = (r: number): number => 22.0 - (5.0 * Math.log(1.0 + r)) / Math.log(100);

interface Sample {
  az: number;
  km: number;
  ratio: number;
  w: number;
}

/** The sky at a point, given the skyline traced there (proto computeSky, L1262–1277). */
export async function computeSky(
  ll: LatLon,
  horizon: HorizonPoint[] | null,
  canopyDeg: number,
  deps: SkyDeps,
): Promise<{ sky: NonNullable<ScreenResult["sky"]>; zone: [string, string]; worst: Sample | { w: -1 } }> {
  const lat = ll[0],
    lon = ll[1];
  const z = await lpRatioAt(lat, lon, deps);
  if (!z) throw new Error("outside atlas coverage");
  const mag = lpMag(z.ratio),
    zone = lpZone(z.ratio);
  const [s0, s1] = K.southArc;
  const samples: Sample[] = [];
  const domes: NonNullable<ScreenResult["sky"]>["domes"] = [];
  for (let az = 0; az < 360; az += K.sampleAzStepDeg) {
    let best: Sample | null = null;
    for (const km of K.sampleKm) {
      const p = destination([lon, lat], km, az, { units: "kilometers" }).geometry.coordinates;
      const s = await lpRatioAt(p[1]!, p[0]!, deps);
      if (!s) continue;
      const smp = { az, km, ratio: s.ratio, w: s.ratio * Math.min(1, K.domeWeightKm / km) };
      if (az >= s0 && az <= s1) samples.push(smp);
      if (!best || smp.w > best.w) best = smp;
    }
    domes.push({ az, w: best ? best.w : 0, km: best ? best.km : null, ratio: best ? best.ratio : 0 });
  }
  const worst = samples.reduce<Sample | { w: -1 }>((a, b) => (b.w > a.w ? b : a), { w: -1 });
  const coreAlt = 90 - lat + K.coreDecDeg;
  const [c0, c1] = K.coreRidgeArc;
  const south = (horizon || []).filter((h) => h.az >= c0 && h.az <= c1);
  const ridge = south.length ? Math.max(...south.map((h) => h.angle)) : 0;
  const coreClear = coreAlt - ridge - canopyDeg;
  const [m0, m1] = K.magRange;
  let score = Math.max(0, Math.min(1, (mag - m0) / (m1 - m0))) * 100;
  const notes: string[] = [];
  score -= Math.min(K.domePenaltyMax, K.domePenaltyMax * Math.min(1, worst.w / K.domePenaltyFullW));
  if (coreClear <= 0) {
    score -= K.coreBlockedPenalty;
    notes.push(
      `A ridge to the south rises ${ridge.toFixed(0)}° — the galactic core (max ${coreAlt.toFixed(0)}° up) never clears it from this point.`,
    );
  } else if (coreClear < K.coreLowDeg) {
    score -= K.coreLowPenalty;
    notes.push(
      `Only ${coreClear.toFixed(0)}° between the core's peak and the southern ridge; you'll be shooting it low.`,
    );
  } else
    notes.push(
      `The core peaks ${coreAlt.toFixed(0)}° above due south; the ridge there is ${ridge.toFixed(0)}° — ${coreClear.toFixed(0)}° of clear sky under it.`,
    );
  if (worst.w >= 0) {
    const w = worst as Sample;
    notes.push(
      w.w > K.domeBrightW
        ? `Bright patch toward ${compass(w.az)} at ${Math.round(w.km * 0.621)} mi (ratio ${w.ratio.toFixed(1)}): expect a light dome low in the ${compass(w.az)} exactly where the core sits.`
        : w.w > K.domeGlowW
          ? `Some glow toward ${compass(w.az)} at ${Math.round(w.km * 0.621)} mi (ratio ${w.ratio.toFixed(2)}) — a modest dome near the horizon.`
          : `Nothing bright within 40 mi to the south (worst ratio ${w.ratio.toFixed(2)} toward ${compass(w.az)}).`,
    );
  }
  return {
    sky: {
      mag,
      ratio: z.ratio,
      zone: zone[0],
      zoneWord: zone[1],
      year: z.year,
      coreAlt,
      ridgeS: ridge,
      coreClear,
      dome: worst.w >= 0 ? (worst as Sample) : null,
      domes,
      score: Math.round(Math.max(0, score)),
      notes,
    },
    zone,
    worst,
  };
}

/** The sky step's flag (proto L1089–1090). */
export function skyFlags(
  sky: NonNullable<ScreenResult["sky"]>,
  zone: [string, string],
  worst: { w: number },
): ScreenResult["flags"] {
  if (sky.mag < K.flagBrightMag)
    return [
      {
        lvl: "warn",
        t: `Night sky is ${sky.mag.toFixed(1)} mag/arcsec² (${zone[1]}). The Milky Way core will be a smudge, not a subject.`,
      },
    ];
  if (sky.mag >= K.flagDarkMag && sky.coreClear > 0 && worst.w < K.domeBrightW)
    return [
      {
        lvl: "good",
        t: `Dark sky: ${sky.mag.toFixed(2)} mag/arcsec², zone ${zone[0]} (${zone[1]}), and the core clears the southern ridge.`,
      },
    ];
  return [];
}
