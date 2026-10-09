/**
 * Serves the service worker built from app/sw.ts with its precache manifest injected (step 17c; Serwist's
 * Turbopack integration, so the app's build stays on Turbopack). The page registers /serwist/sw.js.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createSerwistRoute } from "@serwist/turbopack";
import { HOSPITAL_SNAPSHOT_MARKER } from "@/lib/screen/hospitalsMarker";

// The app shell's revision: a new deploy re-fetches /explore. Vercel gives the commit; locally, git.
const revision =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() ||
  crypto.randomUUID();

/**
 * The chunk holding lib/screen/data/hospitals.json (A2c), left out of the precache (owner, #82): 250 KB that
 * only a screen needs, fetched by the screen worker when it runs. Chunk names are content hashes, so it's
 * found by the source line `pnpm data:hospitals` writes into the file.
 */
function isHospitalSnapshot(url: string): boolean {
  // Our transforms run before Serwist's own, which rewrites ".next/…" to "/_next/…"; accept either. Any script
  // under static/: locally chunks are in static/chunks/, on Vercel in static/immutable/chunks/.
  const m = /^(?:\/_next|\.next)\/(static\/.+\.js)$/.exec(url);
  if (!m) return false;
  try {
    return readFileSync(join(process.cwd(), ".next", m[1]!), "utf8").includes(HOSPITAL_SNAPSHOT_MARKER);
  } catch {
    return false;
  }
}

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: "app/sw.ts",
  additionalPrecacheEntries: [{ url: "/explore", revision }],
  // Left out: notes in public/ (fonts/README.md) aren't app assets; and Turbopack's Web Worker entry, which
  // reads its bootstrap config from its own URL's #params= hash. A worker started from a cached response gets
  // the cache's URL, without the hash, and fails ("Missing worker bootstrap config"), so the screen's worker
  // must load that one file from the network. The chunks it then imports are precached as usual.
  manifestTransforms: [
    async (entries) => {
      const snapshot = entries.filter((e) => isHospitalSnapshot(e.url));
      return {
        manifest: entries.filter(
          (e) =>
            !e.url.endsWith(".md") && !/\/turbopack-worker-[^/]*\.js$/.test(e.url) && !snapshot.includes(e),
        ),
        // Said at build time if the filter ever stops finding it (a new chunk layout), rather than silently
        // precaching it again.
        warnings:
          snapshot.length === 1
            ? []
            : [`hospital snapshot: ${snapshot.length} precache entries matched, expected 1`],
      };
    },
  ],
  useNativeEsbuild: true,
});
