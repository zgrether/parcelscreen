import { describe, expect, it } from "vitest";
import type { ScreenResult } from "@/lib/screen/types";
import { loadFixture, type FixtureSlug } from "@/test/support/fixtures";
import { fromPrototype } from "@/test/support/fromPrototype";
import { dayOfYear, skylineAt } from "./ground";
import {
  clockIn,
  domesOf,
  galaxyAt,
  glowAt,
  hazeOf,
  milkyWay,
  milkyWayVisibility,
  nightCaption,
  nightInputs,
  nightSpan,
  nightTicks,
  sunAtInstant,
} from "./night";

const GOLDENS: [FixtureSlug, string][] = [
  ["ferney-creek-52-47A", "run"],
  ["ferney-creek-52-47A", "houseRun"],
  ["macks-mountain-35-3", "run"],
  ["macks-mountain-35-3", "evaluateSite2"],
];
const result = (slug: FixtureSlug, key: string) =>
  fromPrototype((loadFixture(slug).goldens as unknown as Record<string, never>)[key]!) as ScreenResult;

describe.each(GOLDENS)("the night sky on %s %s (plan §3)", (slug, key) => {
  const r = result(slug, key);
  const [lat, lon] = r.point!.ll;

  it("the core's peak altitude over a sidereal day is the report's sky.coreAlt", () => {
    const t0 = Date.UTC(2026, 6, 15);
    let peak = -90;
    for (let m = 0; m < 24 * 60; m++) peak = Math.max(peak, galaxyAt(lat, lon, t0 + m * 60_000).core.alt);
    expect(Math.abs(peak - r.sky!.coreAlt)).toBeLessThan(0.02);
  });

  it("the caption reads the core against the skyline as the engine reads it", () => {
    const n = nightInputs(r)!;
    const ridge = (az: number) => skylineAt(r.sun!.profile, az);
    const up = { az: 180, alt: 20 },
      down = { az: 180, alt: -3 };
    expect(nightCaption(n, down, ridge, 3)).toMatch(
      /core is below the horizon — try summer, late evening\.$/,
    );
    expect(nightCaption(n, up, ridge, 3)).toContain(
      `toward 180° (S); the ridge there is ${ridge(180).toFixed(0)}°`,
    );
    expect(nightCaption(n, up, ridge, 3)).toMatch(/^Sky at zenith \d+\.\d\d mag\/arcsec² \(zone /);
  });
});

describe("the night's span and clock", () => {
  const lat = 36.89,
    lon = -80.45;
  it("runs sunset to the next sunrise, the sun at the horizon at both ends", () => {
    for (const iso of ["2026-12-21", "2026-06-21", "2026-03-20"]) {
      const [, m, d] = iso.split("-").map(Number);
      const doy = dayOfYear(m!, d!);
      const s = nightSpan(iso, doy, lat, lon);
      expect(s.end).toBeGreaterThan(s.start);
      expect(Math.abs(sunAtInstant(lat, lon, doy, s.start).alt)).toBeLessThan(0.05);
      expect(Math.abs(sunAtInstant(lat, lon, doy, s.end).alt)).toBeLessThan(0.05);
      expect(sunAtInstant(lat, lon, doy, (s.start + s.end) / 2).alt).toBeLessThan(-20);
    }
  });
  it("labels whole hours in the chosen time zone", () => {
    const s = nightSpan("2026-12-21", 355, lat, lon);
    const ny = nightTicks(s, "America/New_York").map((t) => t.label);
    expect(ny).toContain("midnight");
    expect(ny[0]).toMatch(/^[56]pm$/);
    const chi = nightTicks(s, "America/Chicago").map((t) => t.label);
    expect(chi[0]).toMatch(/^[45]pm$/);
    expect(clockIn("America/New_York", Date.UTC(2026, 11, 22, 4, 30))).toBe("11:30 pm");
  });
});

describe("the galaxy and the glow (proto L1786–1816)", () => {
  it("the band centres on the core", () => {
    const core = { az: 160, alt: 20 },
      pole = { az: 340, alt: 30 };
    const dots = milkyWay(core, pole, 2, 0.6);
    expect(dots.length).toBeGreaterThan(1000);
    const nearest = dots.reduce((a, d) =>
      Math.hypot(d.az - core.az, d.alt - core.alt) < Math.hypot(a.az - core.az, a.alt - core.alt) ? d : a,
    );
    expect(Math.hypot(nearest.az - core.az, nearest.alt - core.alt)).toBeLessThan(0.7);
  });
  it("the Milky Way fades with sky brightness: gone at 19.6, full at 21.8", () => {
    expect(milkyWayVisibility(19.6)).toBe(0);
    expect(milkyWayVisibility(21.8)).toBe(1);
    expect(milkyWayVisibility(20.7)).toBeCloseTo(Math.pow(0.5, 1.6), 9);
    expect(milkyWayVisibility(22.3)).toBe(1);
  });
  it("the domes sit at the atlas's bright azimuths, blended by maximum", () => {
    const domes = domesOf([
      { az: 135, w: 2.5 },
      { az: 150, w: 0.4 },
      { az: 300, w: 0.01 }, // too faint to draw
    ]);
    expect(domes.map((d) => d.az)).toEqual([135, 150]);
    let best = { az: 0, a: 0 };
    for (let az = 0; az < 360; az++) {
      const g = glowAt(az, 2, hazeOf(0.2), domes);
      if (g.a > best.a) best = { az, a: g.a };
    }
    expect(best.az).toBe(135);
    // Maximum, not sum: between the two domes the glow is no brighter than the stronger alone.
    expect(glowAt(142, 2, 0, domes).a).toBeLessThanOrEqual(glowAt(142, 2, 0, [domes[0]!]).a + 0.02 + 1e-9);
  });
});
