// Rasterises scripts/icon.svg to the PWA icons (step 17c). Run once when the mark changes:
//   npx tsx scripts/make-icons.mts
// Uses Playwright, already a dev dependency; no image library needed.
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const svg = readFileSync("scripts/icon.svg", "utf8");
const out: [string, number][] = [
  ["public/icons/icon-192.png", 192],
  ["public/icons/icon-512.png", 512],
  ["public/icons/maskable-192.png", 192],
  ["public/icons/maskable-512.png", 512],
  ["app/apple-icon.png", 180],
];
const b = await chromium.launch();
for (const [path, size] of out) {
  const page = await b.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<html><body style="margin:0;background:#1c2620">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`,
  );
  await page.screenshot({ path, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
  console.log(path, size);
}
await b.close();
