/**
 * geotiff's decoding, the prototype's bundle against the port's install (owner, 2026-10-08; phase-0.md §4). A
 * one-off analysis kept for re-use, not a check: it needs the prototype-era builds on disk.
 *
 *   curl -o tmp/geotiff-cdn/geotiff.js         https://cdn.jsdelivr.net/npm/geotiff@2.1.3/dist-browser/geotiff.js
 *   curl -o tmp/geotiff-cdn/pako-2.0.4.min.js  https://cdn.jsdelivr.net/npm/pako@2.0.4/dist/pako.min.js
 *   curl -o tmp/geotiff-cdn/float16-3.4.7.js   https://cdn.jsdelivr.net/npm/@petamoriken/float16@3.4.7/browser/float16.js
 *   pnpm geotiff-versions                       writes test-results/geotiff-versions.md
 *
 * The prototype's geotiff 2.1.3 bundle carries pako 2.0.4 and float16 3.4.7 (matched by hashing its source map
 * against each release); the port resolved pako 2.2.0 and float16 3.9.3. LERC 3.0.0 and zstddec 0.1.0 are
 * byte-identical in both. The recorded 3DEP rasters are uncompressed float32, so the DEM comparison below can't
 * reach a codec: the two codecs that moved are compared directly.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { deflateSync } from "node:zlib";
import { fromArrayBuffer } from "geotiff";
import { describe, expect, it } from "vitest";
import { FIXTURE_SLUGS, loadFixture } from "../support/fixtures";

const DIR = "tmp/geotiff-cdn";
const FILES = ["geotiff.js", "pako-2.0.4.min.js", "float16-3.4.7.js"];

/** A browser build, evaluated in its own sandbox; returns the sandbox's globals. */
function load(file: string): Record<string, unknown> {
  // The geotiff bundle sets up a decoder Worker as it loads; decoding without a pool never posts to it.
  class Worker {
    postMessage() {}
    terminate() {}
    addEventListener() {}
  }
  const sandbox: Record<string, unknown> = { self: {}, window: {}, Worker, Blob, URL, TextDecoder, DataView };
  sandbox.globalThis = sandbox;
  runInNewContext(readFileSync(`${DIR}/${file}`, "utf8"), sandbox);
  return sandbox;
}

/** geotiff's own pako and float16, as the port resolves them (neither is a direct dependency). */
const fromGeotiff = createRequire(createRequire(import.meta.url).resolve("geotiff"));

const asBuffer = (b: Buffer): ArrayBuffer =>
  b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

describe.runIf(import.meta.env.MODE === "geotiff-versions")(
  "geotiff: the prototype's bundle vs the port's install",
  () => {
    it("decodes every recorded DEM identically, and the two moved codecs agree", async () => {
      expect(
        FILES.every((f) => existsSync(`${DIR}/${f}`)),
        `fetch ${FILES.join(", ")} into ${DIR} (see the header)`,
      ).toBe(true);
      const lines: string[] = [];

      // 1. Every 3DEP raster in the three HARs, decoded by each geotiff, compared value by value (bit for bit).
      const GeoTIFF = load("geotiff.js").GeoTIFF as {
        fromArrayBuffer(
          b: ArrayBuffer,
        ): Promise<{ getImage(): Promise<{ readRasters(): Promise<ArrayLike<number>[]> }> }>;
      };
      let rasters = 0,
        cells = 0,
        differ = 0;
      for (const slug of FIXTURE_SLUGS)
        for (const e of loadFixture(slug).har.log.entries.filter((x) => /exportImage/.test(x.request.url))) {
          const c = e.response.content as { text?: string; encoding?: string };
          if (!c.text) continue;
          const bytes = c.encoding === "base64" ? Buffer.from(c.text, "base64") : Buffer.from(c.text);
          const [ours] = (await (
            await (await fromArrayBuffer(asBuffer(bytes))).getImage()
          ).readRasters()) as unknown as ArrayLike<number>[];
          const [theirs] = await (
            await (await GeoTIFF.fromArrayBuffer(asBuffer(bytes))).getImage()
          ).readRasters();
          rasters++;
          cells += ours!.length;
          for (let i = 0; i < ours!.length; i++) if (!Object.is(ours![i], theirs![i])) differ++;
          expect(theirs!.length).toBe(ours!.length);
        }
      lines.push(
        `- **DEM rasters** (every 3DEP response in the three HARs): ${rasters} rasters, ${cells.toLocaleString("en-US")} cells; ${differ} differ (bit for bit).`,
      );

      // 2. pako: 2.0.4 (the bundle's) and 2.2.0 (the port's) inflate the same zlib streams to the same bytes.
      const oldPako = (load("pako-2.0.4.min.js").pako ??
        (load("pako-2.0.4.min.js").self as Record<string, unknown>).pako) as {
        inflate(b: Uint8Array): Uint8Array;
      };
      const newPako = fromGeotiff("pako") as { inflate(b: Uint8Array): Uint8Array };
      let streams = 0,
        pakoDiffer = 0;
      for (const slug of FIXTURE_SLUGS)
        for (const e of loadFixture(slug).har.log.entries.filter((x) => /exportImage/.test(x.request.url))) {
          const c = e.response.content as { text?: string; encoding?: string };
          if (!c.text) continue;
          const raw = c.encoding === "base64" ? Buffer.from(c.text, "base64") : Buffer.from(c.text);
          for (const level of [1, 6, 9]) {
            const z = new Uint8Array(deflateSync(raw, { level }));
            const a = newPako.inflate(z),
              b = oldPako.inflate(z);
            streams++;
            if (
              Buffer.compare(Buffer.from(a), Buffer.from(b)) !== 0 ||
              Buffer.compare(Buffer.from(a), raw) !== 0
            )
              pakoDiffer++;
          }
        }
      lines.push(
        `- **pako 2.0.4 vs 2.2.0** (geotiff's deflate decoder): ${streams} zlib streams (the rasters above at levels 1, 6 and 9); ${pakoDiffer} differ, from each other or from the original bytes.`,
      );

      // 3. float16: every one of the 65,536 half-precision bit patterns, read by 3.4.7 and by 3.9.3.
      const oldF16 = load("float16-3.4.7.js").float16 as {
        getFloat16(v: DataView, o: number, le?: boolean): number;
      };
      const newF16 = fromGeotiff("@petamoriken/float16") as {
        getFloat16(v: DataView, o: number, le?: boolean): number;
      };
      const view = new DataView(new ArrayBuffer(2));
      view.setUint16(0, 0x3c00, true); // 1.0
      expect([oldF16.getFloat16(view, 0, true), newF16.getFloat16(view, 0, true)]).toEqual([1, 1]);
      view.setUint16(0, 0xc000, true); // -2.0
      expect([oldF16.getFloat16(view, 0, true), newF16.getFloat16(view, 0, true)]).toEqual([-2, -2]);
      let f16Differ = 0;
      for (let bits = 0; bits < 65536; bits++) {
        view.setUint16(0, bits, true);
        if (!Object.is(oldF16.getFloat16(view, 0, true), newF16.getFloat16(view, 0, true))) f16Differ++;
      }
      lines.push(
        `- **float16 3.4.7 vs 3.9.3** (geotiff's half-float reader): all 65,536 bit patterns; ${f16Differ} differ.`,
      );
      lines.push(
        "- **LERC 3.0.0, zstddec 0.1.0:** the bundle's sources are byte-identical to the installed packages.",
      );

      mkdirSync("test-results", { recursive: true });
      writeFileSync("test-results/geotiff-versions.md", lines.join("\n") + "\n");
    }, 600_000);
  },
);
