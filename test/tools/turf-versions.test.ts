/**
 * Turf 7.1.0 (the prototype's CDN bundle) against 7.4.0 (the port's pinned packages), call by call, on the real
 * inputs (Batch A A1, owner 2026-10-08). A one-off analysis kept for re-use, not a check: it needs the 7.1.0
 * bundle on disk, and tests never download.
 *
 *   curl -o tmp/turf-7.1.0.min.js https://cdn.jsdelivr.net/npm/@turf/turf@7.1.0/turf.min.js
 *   pnpm turf-versions                       every call compared; writes test-results/turf-versions.md
 *   TURF_RUN=7.1.0 pnpm turf-versions        the whole pipeline on 7.1.0 against expected.json;
 *                                            writes test-results/turf-run-7.1.0.md
 *
 * Every function of @turf/turf is wrapped for every module this file loads (lib/screen and lib/geo). In the
 * first mode a call returns 7.4.0's answer, so the run is the port's own, and also calls 7.1.0 with a copy of the
 * same arguments; the largest difference per function is recorded. Both run in the same Node, so a difference
 * is the version, never the engine.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { polygon } from "@turf/turf";
import { describe, expect, it, vi } from "vitest";
import { combineParcels } from "@/lib/geo/combine";
import { splitPieces } from "@/lib/geo/split";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";
import { differences } from "../support/compare";
import { EXPECTED, expectedOf } from "../support/expected";
import { FIXTURE_SLUGS, loadFixture } from "../support/fixtures";
import { fromPrototype } from "../support/fromPrototype";
import { asPrototype, PARITY } from "../support/parity";
import { runScenario, SCENARIOS } from "../support/scenarios";

interface Stat {
  calls: number;
  differing: number;
  structural: number;
  maxAbs: number;
  maxRel: number;
  example: string;
}

const shared = vi.hoisted(() => ({
  active: false,
  run71: false,
  bundle: "" as string,
  stats: new Map<string, Stat>(),
}));

vi.mock("@turf/turf", async (importOriginal) => {
  const real = (await importOriginal()) as Record<string, unknown>;
  if (import.meta.env.MODE !== "turf-versions") return real;
  const { existsSync, readFileSync } = await import("node:fs");
  const { runInNewContext } = await import("node:vm");
  const path = [process.env.TURF71, "tmp/turf-7.1.0.min.js", "tmp/a1/cdn/turf.min.js"].find(
    (p) => p && existsSync(p),
  );
  if (!path) return real; // the test below says how to fetch it
  const sandbox: Record<string, unknown> = { window: {}, self: {} };
  sandbox.globalThis = sandbox;
  runInNewContext(readFileSync(path, "utf8"), sandbox);
  const old = (sandbox.turf ?? (sandbox.window as Record<string, unknown>).turf) as Record<string, unknown>;
  shared.active = true;
  shared.bundle = path;
  shared.run71 = process.env.TURF_RUN === "7.1.0";

  /** Walks two results side by side: the largest numeric gap, and whether the shapes differ. */
  const compare = (
    a: unknown,
    b: unknown,
    at: string,
    out: { abs: number; rel: number; structural: string },
  ) => {
    if (typeof a === "number" && typeof b === "number") {
      if (Number.isNaN(a) && Number.isNaN(b)) return;
      const abs = Math.abs(a - b);
      const scale = Math.max(Math.abs(a), Math.abs(b));
      if (abs > out.abs) out.abs = abs;
      if (scale > 0 && abs / scale > out.rel) out.rel = abs / scale;
      return;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) {
        out.structural ||= `${at || "(root)"}: length ${a.length} vs ${b.length}`;
        return;
      }
      a.forEach((x, i) => compare(x, b[i], `${at}[${i}]`, out));
      return;
    }
    if (a && b && typeof a === "object" && typeof b === "object") {
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
        compare(
          (a as Record<string, unknown>)[k],
          (b as Record<string, unknown>)[k],
          at ? `${at}.${k}` : k,
          out,
        );
      return;
    }
    if (a !== b && !(a == null && b == null))
      out.structural ||= `${at || "(root)"}: ${String(a)} vs ${String(b)}`;
  };

  const wrapped: Record<string, unknown> = { ...real };
  for (const [name, fn] of Object.entries(real)) {
    if (typeof fn !== "function" || typeof old[name] !== "function") continue;
    const oldFn = old[name] as (...a: unknown[]) => unknown;
    wrapped[name] = (...args: unknown[]) => {
      if (shared.run71) return structuredClone(oldFn(...structuredClone(args)));
      const a = (fn as (...a: unknown[]) => unknown)(...args);
      const s = shared.stats.get(name) ?? {
        calls: 0,
        differing: 0,
        structural: 0,
        maxAbs: 0,
        maxRel: 0,
        example: "",
      };
      shared.stats.set(name, s);
      s.calls++;
      const out = { abs: 0, rel: 0, structural: "" };
      try {
        const b = oldFn(...structuredClone(args));
        compare(a, b, "", out);
        // A polygon result with another vertex count: compare what each encloses instead.
        const kind = (x: unknown) => (x as { geometry?: { type?: string } } | null)?.geometry?.type ?? "";
        if (out.structural && /Polygon/.test(kind(a)) && /Polygon/.test(kind(b))) {
          const area = real.area as (x: unknown) => number;
          const aa = area(a),
            ab = area(structuredClone(b));
          out.structural += `; area ${aa.toFixed(3)} vs ${ab.toFixed(3)} m² (rel ${(Math.abs(aa - ab) / Math.max(aa, ab)).toExponential(2)})`;
        }
      } catch (e) {
        out.structural = `7.1.0 threw: ${(e as Error).message}`;
      }
      if (out.structural) {
        s.structural++;
        s.example ||= out.structural;
        if (process.env.TURF_SHAPES) console.log(`SHAPE ${name}: ${out.structural}`);
      }
      if (out.abs > 0 || out.structural) s.differing++;
      if (out.abs > s.maxAbs) s.maxAbs = out.abs;
      if (out.rel > s.maxRel) {
        s.maxRel = out.rel;
        if (!s.example || !out.structural)
          s.example = `rel ${out.rel.toExponential(2)}, abs ${out.abs.toExponential(2)}`;
      }
      return a;
    };
  }
  return wrapped;
});

/** Grayson's county record, both parts, from its HAR (the parcel query's answer). */
function graysonParts(): Feature<Polygon>[] {
  const entry = loadFixture("grayson-mud-creek-6273").har.log.entries.find((e) =>
    /VA_Parcels/.test(e.request.url),
  )!;
  const c = entry.response.content as { text: string; encoding?: string };
  const body = c.encoding === "base64" ? Buffer.from(c.text, "base64").toString() : c.text;
  const geo = (JSON.parse(body) as { features: Feature<MultiPolygon>[] }).features[0]!.geometry;
  return geo.coordinates.map((rings) => polygon(rings));
}

const fmt = (v: number) => (v === 0 ? "0" : v.toExponential(2));

describe.runIf(import.meta.env.MODE === "turf-versions")("Turf 7.1.0 vs 7.4.0", () => {
  it("runs every scenario and the parcel tools, and writes the report", async () => {
    expect(
      shared.active,
      "put the 7.1.0 bundle at tmp/turf-7.1.0.min.js (see the header) or set TURF71",
    ).toBe(true);
    mkdirSync("test-results", { recursive: true });

    if (shared.run71) {
      const lines = [
        `The whole pipeline on Turf 7.1.0 (\`${shared.bundle}\`) against expected.json (7.4.0), default tolerance:`,
        "",
      ];
      for (const slug of FIXTURE_SLUGS)
        for (const scenario of SCENARIOS[slug]) {
          const d = differences(await runScenario(slug, scenario), expectedOf(slug, scenario), EXPECTED);
          lines.push(
            `- ${slug} ${scenario}: ${d.length} difference${d.length === 1 ? "" : "s"}`,
            ...d.map((x) => `  - \`${x}\``),
          );
        }
      // The port on the prototype's Turf against the prototype's goldens at the default tolerance, with none of
      // PARITY's road widenings: whatever remains is the engines (Chromium recorded, Node here), or the port.
      lines.push(
        "",
        "The same run against the prototype's goldens (Chromium), default tolerance, no road widenings:",
        "",
      );
      for (const slug of FIXTURE_SLUGS)
        for (const scenario of SCENARIOS[slug]) {
          const golden = loadFixture(slug).goldens[scenario]!;
          const r = await runScenario(slug, scenario);
          const d = differences(asPrototype(r, golden), fromPrototype(golden), { ignore: PARITY.ignore });
          lines.push(
            `- ${slug} ${scenario}: ${d.length} difference${d.length === 1 ? "" : "s"}`,
            ...d.map((x) => `  - \`${x}\``),
          );
        }
      writeFileSync("test-results/turf-run-7.1.0.md", lines.join("\n") + "\n");
      return;
    }

    for (const slug of FIXTURE_SLUGS)
      for (const scenario of SCENARIOS[slug]) await runScenario(slug, scenario);
    // lib/geo on real parcels: each fixture split north–south at its centre and combined back, and Grayson's two
    // parts combined across their 12.1 m gap (union, then the two buffers that bridge it).
    const limits = SCREEN_CONSTANTS.combine;
    for (const slug of FIXTURE_SLUGS) {
      const p = loadFixture(slug).input.polygon;
      const ring = p.geometry.coordinates[0]!;
      const lat = ring.reduce((s, c) => s + c[1]!, 0) / ring.length,
        lon = ring.reduce((s, c) => s + c[0]!, 0) / ring.length;
      const cut = splitPieces(p, [lat + 0.05, lon], [lat - 0.05, lon]);
      if (cut.left && cut.right) combineParcels([cut.left, cut.right], limits);
    }
    combineParcels(graysonParts(), limits);

    const rows = [...shared.stats].sort(([a], [b]) => a.localeCompare(b));
    const lines = [
      `Turf 7.1.0 (\`${shared.bundle}\`) against 7.4.0, every call made by the 7 fixture scenarios and the parcel tools, same Node:`,
      "",
      "| Function | Calls | Differing | Shape differs | Largest abs | Largest rel | Example |",
      "|---|---:|---:|---:|---:|---:|---|",
      ...rows.map(
        ([n, s]) =>
          `| \`${n}\` | ${s.calls} | ${s.differing} | ${s.structural} | ${fmt(s.maxAbs)} | ${fmt(s.maxRel)} | ${s.example.replace(/\|/g, "\\|").slice(0, 90)} |`,
      ),
    ];
    writeFileSync("test-results/turf-versions.md", lines.join("\n") + "\n");
  }, 600_000);
});
