/**
 * Serves the service worker built from app/sw.ts with its precache manifest injected (step 17c; Serwist's
 * Turbopack integration, so the app's build stays on Turbopack). The page registers /serwist/sw.js.
 */
import { spawnSync } from "node:child_process";
import { createSerwistRoute } from "@serwist/turbopack";

// The app shell's revision: a new deploy re-fetches /explore. Vercel gives the commit; locally, git.
const revision =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() ||
  crypto.randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: "app/sw.ts",
  additionalPrecacheEntries: [{ url: "/explore", revision }],
  // Left out: notes in public/ (fonts/README.md) aren't app assets; and Turbopack's Web Worker entry, which
  // reads its bootstrap config from its own URL's #params= hash. A worker started from a cached response gets
  // the cache's URL, without the hash, and fails ("Missing worker bootstrap config"), so the screen's worker
  // must load that one file from the network. The chunks it then imports are precached as usual.
  manifestTransforms: [
    async (entries) => ({
      manifest: entries.filter((e) => !e.url.endsWith(".md") && !/\/turbopack-worker-[^/]*\.js$/.test(e.url)),
      warnings: [],
    }),
  ],
  useNativeEsbuild: true,
});
