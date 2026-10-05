// MapLibre 6's module build loads its web worker from a file next to itself, which a bundled app doesn't
// serve. Copy the worker (and the shared chunk it imports) from the installed package into public/, so the
// served files always match the installed version; components/Map/MapView.tsx points MapLibre at them.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve("maplibre-gl/package.json")) + "/dist";
const out = resolve(import.meta.dirname, "..", "public", "maplibre");
mkdirSync(out, { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"])
  copyFileSync(join(dist, f), join(out, f));
console.log(`maplibre worker copied to ${out}`);
