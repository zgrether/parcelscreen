/**
 * The refresh PR's summary (step 13 plan §3.6, §10): it renders the brief's own example, skips moves under their
 * thresholds, ignores the run's own dates, and says nothing changed when nothing did (no PR).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { refreshSummary } from "./summary";
import { AreaFileSchema, type AreaFile } from "./types";

const file = (id: string): AreaFile =>
  AreaFileSchema.parse(
    JSON.parse(readFileSync(join(process.cwd(), "public", "areas", "v1", `${id}.json`), "utf8")),
  );
const withMedians = (f: AreaFile, m: Partial<AreaFile["medians"]>): AreaFile => ({
  ...f,
  medians: { ...f.medians, ...m },
});

describe("the refresh summary", () => {
  const dan = file("meadows-of-dan");
  const floyd = file("floyd");

  it("renders the brief's example: Meadows of Dan: ER 41 → 18 min", () => {
    const s = refreshSummary(
      [withMedians(dan, { erMin: 41 }), floyd],
      [withMedians(dan, { erMin: 18 }), floyd],
      "2026-11-03",
    );
    expect(s.changed).toBe(true);
    expect(s.markdown).toContain("## Area catalog refresh, 2026-11-03");
    expect(s.markdown).toContain("- Meadows of Dan: ER 41 → 18 min");
    expect(s.markdown).toContain("1 area unchanged.");
  });

  it("each unit once, and the miles for public land", () => {
    const s = refreshSummary(
      [withMedians(dan, { elevFt: 2800, openLandFt: 5280, skyMag: 21.2 })],
      [withMedians(dan, { elevFt: 2900, openLandFt: 10_560, skyMag: 21.4 })],
      "2026-11-03",
    );
    expect(s.markdown).toContain("Meadows of Dan: Elevation 2,800 → 2,900 ft");
    expect(s.markdown).toContain("Meadows of Dan: Public land 1.0 → 2.0 mi");
    expect(s.markdown).toContain("Meadows of Dan: Night sky 21.20 → 21.40 mag");
  });

  it("a move under its threshold isn't worth a line; nothing moved, no PR", () => {
    const s = refreshSummary(
      [withMedians(dan, { elevFt: 2800 })],
      [withMedians(dan, { elevFt: 2830 })],
      "2026-11-03",
    );
    expect(s.changed).toBe(false);
    expect(s.markdown).toContain("Nothing moved.");
  });

  it("a new edition of a source is listed; the run's own date isn't", () => {
    const after = {
      ...dan,
      sources: {
        ...dan.sources,
        er: "CMS Hospital General Information, 2026-10-22",
        drives: "OSRM, 2026-11-03",
      },
    };
    const s = refreshSummary([dan], [after], "2026-11-03");
    expect(s.changed).toBe(true);
    expect(s.markdown).toContain(`- er: ${dan.sources.er} → CMS Hospital General Information, 2026-10-22`);
    expect(s.markdown).not.toContain("drives:");
  });

  it("an area that's new, gone, or thin now", () => {
    const thin = { ...dan, thin: true };
    const s = refreshSummary([dan, floyd], [thin, file("sparta")], "2026-11-03");
    expect(s.markdown).toContain("Meadows of Dan: now thin");
    expect(s.markdown).toContain("Sparta: profiled for the first time");
    expect(s.markdown).toContain("Floyd: no longer in the catalog");
  });
});
