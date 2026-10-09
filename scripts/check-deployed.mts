/**
 * A deployed site's first visit doesn't fetch the hospital snapshot (owner, #85): neither the page's own
 * scripts nor the service worker's precache include the chunk that holds lib/screen/data/hospitals.json. Only
 * the screen worker fetches it, when a screen runs.
 *
 *   pnpm check:deployed https://parcelscreen-zgrether-1030s-projects.vercel.app
 *
 * CI runs it on every successful Vercel deployment (.github/workflows/deployed-check.yml); run it by hand
 * against production after a merge. It fails (exit 1) naming the URL that carries the snapshot.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** lib/screen/hospitalsMarker.ts's HOSPITAL_SNAPSHOT_MARKER (a test holds the two equal). */
export const MARKER = "amenity=hospital or healthcare=hospital in";

/** The scripts a first visit loads: the page's <script src>, and every script the precache manifest lists. */
export function firstVisitScripts(html: string, sw: string): { page: string[]; precache: string[] } {
  const page = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map((m) => m[1]!);
  const precache = [...sw.matchAll(/url:\s*"([^"]+\.js)"/g)].map((m) => m[1]!);
  return { page: [...new Set(page)], precache: [...new Set(precache)] };
}

async function text(url: string): Promise<string> {
  const r = await fetch(url, { headers: { "user-agent": "parcelscreen check:deployed" } });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.text();
}

export async function checkDeployed(base: string): Promise<string[]> {
  const origin = base.replace(/\/+$/, "");
  const [html, sw] = await Promise.all([text(`${origin}/explore`), text(`${origin}/serwist/sw.js`)]);
  const { page, precache } = firstVisitScripts(html, sw);
  if (!page.length)
    throw new Error(`${origin}/explore: no <script src> found; the check can't see the page's scripts`);
  if (!precache.length)
    throw new Error(`${origin}/serwist/sw.js: no precached scripts found; the check can't read the manifest`);
  const bad: string[] = [];
  for (const [where, list] of [
    ["page", page],
    ["precache", precache],
  ] as const)
    for (const path of list) {
      const url = new URL(path, origin).toString();
      if ((await text(url)).includes(MARKER)) bad.push(`${where}: ${url}`);
    }
  console.log(`${origin}: ${page.length} page scripts and ${precache.length} precached scripts checked.`);
  return bad;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const base = process.argv[2];
  if (!base) {
    console.error("usage: pnpm check:deployed <deployment URL>");
    process.exit(2);
  }
  const bad = await checkDeployed(base);
  if (bad.length) {
    console.error(`The hospital snapshot loads on a first visit:\n  ${bad.join("\n  ")}`);
    process.exit(1);
  }
  console.log("The hospital snapshot isn't fetched on a first visit.");
}
