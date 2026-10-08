/**
 * Records the Phase 0 fixtures and goldens by driving the UNMODIFIED prototype against the live services.
 * See docs/plans/phase-0.md §5 and test/fixtures/README.md.
 *
 *   node scripts/record-fixtures.mts            # both parcels
 *   node scripts/record-fixtures.mts macks      # one parcel (slug prefix)
 *
 * The prototype is copied to tmp/harness/ with one injected line just before `} // main` that exposes
 * its closure functions on window.__ps. legacy/parcelscreen.html itself is never modified.
 * Run by hand, never in CI: it hits the public services (about 150 requests per parcel).
 */
import { chromium, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const LEGACY = join(ROOT, "legacy", "parcelscreen.html");
const HARNESS_DIR = join(ROOT, "tmp", "harness");
const FIXTURES = join(ROOT, "test", "fixtures");

interface ParcelSpec {
  slug: string;
  name: string;
  point: { lat: number; lon: number };
  /** Re-evaluate the sun/sky/driveway at site #2 (prototype setFocus). */
  evaluateSite2?: boolean;
  /** Mark a house ~60 m from site #2 at this bearing, capture setHouse, then re-run the screen with it. */
  houseRun?: { distanceM: number; bearingDeg: number };
}

const PARCELS: ParcelSpec[] = [
  {
    slug: "ferney-creek-52-47A",
    name: "Ferney Creek, Floyd County VA, parcel 52-47A",
    point: { lat: 36.8874, lon: -80.45455 },
    houseRun: { distanceM: 60, bearingDeg: 225 },
  },
  {
    slug: "macks-mountain-35-3",
    name: "Macks Mountain, Floyd County VA, parcel 35-3",
    point: { lat: 36.93492, lon: -80.63139 },
    evaluateSite2: true,
  },
  {
    // Batch A, A1 (owner, 2026-10-08): the live screen behind follow-ups 23–29. A two-part county record; the
    // point is inside the first, larger part (29.31 ac of 30.15), which is the part the prototype screens.
    slug: "grayson-mud-creek-6273",
    name: "Mud Creek, Grayson County VA, parcel 6273 (PTM 63-A-62)",
    point: { lat: 36.585425, lon: -81.561989 },
    evaluateSite2: true,
  },
];

// Only the data services go into the HAR; CDNs (Leaflet/turf/geotiff/three) and fonts stay out.
// Case-insensitive: Playwright records hosts lowercased (sdmdataaccess.sc.egov.usda.gov), and a
// case-sensitive "SDMDataAccess" silently dropped every soils request from the first recording.
const HAR_URL_FILTER =
  /elevation\.nationalmap\.gov|elevation-tiles-prod|SDMDataAccess|services\.arcgis\.com|hazards\.fema\.gov|overpass|photon\.komoot\.io|tigerweb\.geo\.census\.gov|djlorenz\.github\.io\/astronomy\/binary_tiles|router\.project-osrm\.org|NC1Map_Parcels|VA_Parcels|Parcels_View/i;
// Basemap and imagery tiles are irrelevant to the screen; don't fetch them at all.
const BLOCKED =
  /USGSImageryOnly|USGSTopo|World_Imagery|World_Street_Map|VBMP_Imagery|Orthoimagery_Latest|image_tiles/;

function buildHarness(): { html: string; buildStamp: string } {
  const src = readFileSync(LEGACY, "utf8");
  const buildStamp = /name="parcelscreen-build" content="([^"]+)"/.exec(src)?.[1] ?? "unknown";
  const marker = "\n} // main";
  const at = src.indexOf(marker);
  if (at < 0 || src.indexOf(marker, at + 1) >= 0)
    throw new Error("expected exactly one `} // main` in the prototype");
  const hook =
    "\nwindow.__ps={pickParcel,setParcel,setHouse,runScreen,setFocus," +
    "get last(){return lastResult},get parcel(){return parcel},get house(){return house}};";
  return { html: src.slice(0, at) + hook + src.slice(at), buildStamp };
}

function serve(html: string): Promise<{ server: Server; url: string }> {
  mkdirSync(HARNESS_DIR, { recursive: true });
  writeFileSync(join(HARNESS_DIR, "index.html"), html);
  const server = createServer((req, res) => {
    if (req.url === "/" || req.url?.startsWith("/index.html")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((ok) =>
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") throw new Error("no port");
      ok({ server, url: `http://127.0.0.1:${addr.port}/` });
    }),
  );
}

/** Serialize the prototype result: drop _ctx (typed arrays, DEM rasters — never persisted), keep the rest. */
async function snapshot(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const ps = (window as unknown as { __ps: { last: Record<string, unknown> | null } }).__ps;
    const R = ps.last;
    if (!R) return null;
    const dw = R.driveway as { entrances?: { roadsNearestFt?: number } } | undefined;
    const json = JSON.stringify(R, (k, v) => (k === "_ctx" ? undefined : v));
    const out = JSON.parse(json) as Record<string, unknown>;
    // JSON drops non-index properties on arrays; this one feeds the "no frontage" note.
    if (dw?.entrances && out.driveway)
      (out.driveway as Record<string, unknown>)._entrancesRoadsNearestFt =
        dw.entrances.roadsNearestFt ?? null;
    return out;
  });
}

/** The step list as rendered: proves which steps ran/failed and carries any error text. */
function steps(page: Page): Promise<string[]> {
  return page.$$eval("#steps li", (lis) => lis.map((li) => `${li.className || "idle"}: ${li.textContent}`));
}

async function recordParcel(spec: ParcelSpec, harnessUrl: string, buildStamp: string): Promise<void> {
  const dir = join(FIXTURES, spec.slug);
  mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    recordHar: { path: join(dir, "network.har"), content: "embed", urlFilter: HAR_URL_FILTER },
    viewport: { width: 1400, height: 900 },
  });
  await context.route(BLOCKED, (route) => route.abort());
  // Default config (empty ps.cfg). Parcel lines off so pan/zoom queries don't pollute the HAR.
  await context.addInitScript(() => {
    if (!sessionStorage.getItem("__seeded")) {
      localStorage.clear();
      localStorage.setItem("ps.lines", "0");
      sessionStorage.setItem("__seeded", "1");
    }
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error(`[${spec.slug}] page error:`, e.message));
  // Every request to a data service must land in the HAR (guards the filter above; see the SDA miss).
  const dataRequests = new Set<string>();
  const NOT_DATA =
    /^http:\/\/127\.0\.0\.1|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|fonts\.(googleapis|gstatic)\.com/;
  page.on("request", (req) => {
    const u = req.url();
    if (!NOT_DATA.test(u) && !BLOCKED.test(u) && !u.startsWith("data:")) dataRequests.add(u);
  });

  const startedAt = new Date().toISOString();
  console.log(`[${spec.slug}] ${startedAt} loading harness`);
  await page.goto(harnessUrl);
  await page.waitForFunction(() => "__ps" in window, null, { timeout: 60_000 });

  // 1. Look up the parcel at the reference point, exactly as a tap would.
  await page.evaluate(
    ({ lat, lon }) =>
      (
        window as unknown as { __ps: { pickParcel(ll: { lat: number; lng: number }): Promise<void> } }
      ).__ps.pickParcel({ lat, lng: lon }),
    spec.point,
  );
  const parcel = await page.evaluate(() => (window as unknown as { __ps: { parcel: unknown } }).__ps.parcel);
  if (!parcel) throw new Error(`[${spec.slug}] no parcel found at ${spec.point.lat}, ${spec.point.lon}`);

  // 2. Run the screen.
  const runAt = new Date().toISOString();
  console.log(`[${spec.slug}] ${runAt} running screen`);
  await page.evaluate(
    () => (window as unknown as { __ps: { runScreen(): Promise<void> } }).__ps.runScreen(),
    null,
  );
  const run = await snapshot(page);
  const runSteps = await steps(page);
  const goldens: Record<string, unknown> = { run };
  const stepLog: Record<string, string[]> = { run: runSteps };
  const extra: Record<string, unknown> = {};

  // 3a. Re-evaluate at site #2 (prototype setFocus → our evaluateAt).
  if (spec.evaluateSite2) {
    const ll = await page.evaluate(() => {
      const R = (window as unknown as { __ps: { last: { sites?: { ll: [number, number] }[] } } }).__ps.last;
      return R.sites?.[1]?.ll ?? null;
    });
    if (!ll) throw new Error(`[${spec.slug}] no site #2 to evaluate`);
    await page.evaluate((p) => {
      const ps = (
        window as unknown as {
          __ps: { last: unknown; setFocus(R: unknown, ll: unknown, l: string): Promise<void> };
        }
      ).__ps;
      return ps.setFocus(ps.last, p, "site #2");
    }, ll);
    goldens.evaluateSite2 = await snapshot(page);
    extra.evaluateSite2 = { ll, label: "site #2" };
  }

  // 3b. Mark a house near site #2: capture setHouse on the existing result, then a full run with the house.
  if (spec.houseRun) {
    const placed = await page.evaluate(({ distanceM, bearingDeg }) => {
      type T = {
        destination(p: number[], d: number, b: number, o: object): { geometry: { coordinates: number[] } };
        booleanPointInPolygon(p: number[], g: unknown): boolean;
      };
      const turf = (window as unknown as { turf: T }).turf;
      const ps = (
        window as unknown as {
          __ps: { last: { sites?: { ll: [number, number] }[] }; parcel: { geo: unknown } };
        }
      ).__ps;
      const s2 = ps.last.sites?.[1]?.ll;
      if (!s2) return null;
      // ~60 m SW of site #2; step in toward the site if that lands outside the boundary.
      for (let d = distanceM; d >= 10; d -= 5) {
        const c = turf.destination([s2[1], s2[0]], d / 1000, bearingDeg, { units: "kilometers" }).geometry
          .coordinates;
        if (turf.booleanPointInPolygon(c, ps.parcel.geo))
          return { ll: [+c[1]!.toFixed(6), +c[0]!.toFixed(6)] as [number, number], distanceM: d, site2: s2 };
      }
      return null;
    }, spec.houseRun);
    if (!placed) throw new Error(`[${spec.slug}] could not place the house inside the polygon near site #2`);
    await page.evaluate(
      (ll) => (window as unknown as { __ps: { setHouse(ll: [number, number]): void } }).__ps.setHouse(ll),
      placed.ll,
    );
    // setHouse fires assessHouse → setFocus without returning the promise; wait for it to land.
    await page.waitForFunction(
      () => {
        const R = (window as unknown as { __ps: { last: { house?: unknown; focus?: { label: string } } } })
          .__ps.last;
        return (
          !!R.house &&
          R.focus?.label === "the existing house" &&
          document.getElementById("hint")?.textContent === ""
        );
      },
      null,
      { timeout: 120_000 },
    );
    goldens.setHouse = await snapshot(page);
    console.log(`[${spec.slug}] ${new Date().toISOString()} re-running screen with the house`);
    await page.evaluate(
      () => (window as unknown as { __ps: { runScreen(): Promise<void> } }).__ps.runScreen(),
      null,
    );
    goldens.houseRun = await snapshot(page);
    stepLog.houseRun = await steps(page);
    extra.house = {
      ...placed,
      bearingDeg: spec.houseRun.bearingDeg,
      note: "synthetic house for assessHouse coverage",
    };
  }

  const finishedAt = new Date().toISOString();
  await context.close(); // flushes the HAR
  await browser.close();

  const p = parcel as { geo: unknown; props: unknown; source: string };
  writeFileSync(
    join(dir, "input.json"),
    JSON.stringify(
      {
        name: spec.name,
        point: spec.point,
        polygon: p.geo,
        props: p.props,
        source: p.source,
        ...extra,
        prototypeBuild: buildStamp,
        config: "prototype DEFAULTS (empty localStorage)",
        recorded: { startedAt, runAt, finishedAt },
        steps: stepLog,
      },
      null,
      1,
    ),
  );
  writeFileSync(join(dir, "golden.json"), JSON.stringify(goldens));
  const failed = Object.entries(goldens).flatMap(([k, g]) =>
    ((g as { failed?: string[] } | null)?.failed ?? []).map((f) => `${k}: ${f}`),
  );
  const size = (f: string) => (statSync(join(dir, f)).size / 1048576).toFixed(2);
  console.log(
    `[${spec.slug}] ${finishedAt} done — har ${size("network.har")} MB, golden ${size("golden.json")} MB` +
      (failed.length ? `\n  FAILED STEPS: ${failed.join("; ")}` : ""),
  );
  if (failed.length) process.exitCode = 1;

  const harUrls = new Set(
    (
      JSON.parse(readFileSync(join(dir, "network.har"), "utf8")) as {
        log: { entries: { request: { url: string } }[] };
      }
    ).log.entries.map((e) => e.request.url),
  );
  const missing = [...dataRequests].filter((u) => !harUrls.has(u));
  if (missing.length) {
    console.error(`[${spec.slug}] NOT IN HAR (${missing.length}):\n  ${missing.join("\n  ")}`);
    process.exitCode = 1;
  } else console.log(`[${spec.slug}] all ${dataRequests.size} data requests are in the HAR`);
}

const only = process.argv[2];
const { html, buildStamp } = buildHarness();
const { server, url } = await serve(html);
console.log(`prototype ${buildStamp}, harness at ${url}`);
try {
  for (const spec of PARCELS.filter((p) => !only || p.slug.startsWith(only)))
    await recordParcel(spec, url, buildStamp);
} finally {
  server.close();
}
