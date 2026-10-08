/**
 * The before/after table every Batch A PR carries (Batch A §1): the base branch's expected.json against this
 * checkout's, for all three fixtures.
 *
 *   pnpm before-after                 against origin/main
 *   BASE=<ref> pnpm before-after      against another ref
 *
 * Writes test-results/before-after.md: one row per headline, a column pair per fixture, then the leaf-diff
 * counts per scenario and every changed path. Both sides are recorded output, so nothing is re-run.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import type { ScreenResult } from "@/lib/screen/types";
import { publicLandView } from "@/lib/report/surroundings";
import { differences } from "../support/compare";
import { EXPECTED, expectedPath, type ExpectedResults } from "../support/expected";
import { FIXTURE_SLUGS, type FixtureSlug } from "../support/fixtures";
import { SCENARIOS } from "../support/scenarios";
import { shortName } from "./diffReport";

const OUT = "test-results/before-after.md";

/** A fixture's expected.json at a git ref, or null where it didn't exist yet. */
function expectedAt(ref: string, slug: FixtureSlug): ExpectedResults | null {
  const path = expectedPath(slug).replace(/\\/g, "/").split("/test/fixtures/")[1];
  try {
    return JSON.parse(
      execFileSync("git", ["show", `${ref}:test/fixtures/${path}`], {
        encoding: "utf8",
        maxBuffer: 1 << 28,
        stdio: ["ignore", "pipe", "ignore"],
      }),
    ) as ExpectedResults;
  } catch {
    return null;
  }
}

const n = (v: number | null | undefined, digits = 1) =>
  v == null || !Number.isFinite(v) ? "—" : v.toFixed(digits);
const mi = (km: number | undefined) => (km == null ? "—" : `${(km * 0.621371).toFixed(1)} mi`);

/** The headline rows, in the plan's order. */
export function headlines(r: ScreenResult | undefined): Record<string, string> {
  if (!r) return {};
  const top = (r.sites ?? []).slice(0, 3);
  // Through the report's own view, so the table and the report agree on what's within the mile (follow-up 23).
  const pl = r.protected ? publicLandView(r) : null;
  const land = pl?.units[0];
  const route = r.driveway?.routes?.[0] ?? r.driveway?.overLimit ?? null;
  return {
    Acres: n(r.acres, 2),
    Verdict: r.verdict ?? "—",
    "Sites (count)": String(r.sites?.length ?? 0),
    "#1 grade, score": top[0] ? `${top[0].grade} ${top[0].score}` : "—",
    "Top 3 (acres)": top.map((s) => n(s.acres, 2)).join(" / ") || "—",
    "Dec 21 direct sun h": n(r.sun?.decDirectH, 2),
    "Dec 21 daylight h": n(r.sun?.decDaylightH, 2),
    "Jun 21 direct sun h": n(r.sun?.junDirectH, 2),
    "Sky mag": n(r.sky?.mag, 2),
    "Public land within a mile": land ? `${land.name}, ${land.where.text}` : "none",
    "Open land beyond a mile":
      pl?.beyond?.replace(/^Nearest public land open to visitors beyond a mile: /, "") ?? "—",
    Trailheads: r.near
      ? `${r.near.trailheadCount ?? 0}${r.near.trailheads?.[0] ? `, nearest ${mi(r.near.trailheads[0].km)}` : ""}`
      : "—",
    "Nearest grocer": r.near?.grocers?.[0]
      ? `${r.near.grocers[0].name}, ${mi(r.near.grocers[0].km)}`
      : "none",
    "#1 driveway": route
      ? `${n(route.metrics.lengthFt, 0)} ft, $${Math.round(route.cost.mid / 1000)}k${r.driveway?.routes?.length ? "" : " (over the limit)"}`
      : "—",
    Flags: String(r.flags?.length ?? 0),
  };
}

describe.runIf(import.meta.env.MODE === "before-after")("before-after", () => {
  it("writes the table", () => {
    const base = process.env.BASE ?? "origin/main";
    const head = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
    const before = new Map(FIXTURE_SLUGS.map((s) => [s, expectedAt(base, s)] as const));
    const after = new Map(
      FIXTURE_SLUGS.map(
        (s) => [s, JSON.parse(readFileSync(expectedPath(s), "utf8")) as ExpectedResults] as const,
      ),
    );

    const rows = Object.keys(headlines(after.get(FIXTURE_SLUGS[0])!.run));
    const cols = FIXTURE_SLUGS.flatMap((s) => [`${shortName(s)} before`, `${shortName(s)} after`]);
    const lines = [
      `Before: \`${base}\`; after: this checkout (\`${head}\`, working tree). Run scenario only; — where a fixture had no expected.json yet.`,
      "",
      `| | ${cols.join(" | ")} |`,
      `|---|${cols.map(() => "---").join("|")}|`,
      ...rows.map((row) => {
        const cells = FIXTURE_SLUGS.flatMap((s) => {
          const b = headlines(before.get(s)?.run)[row] ?? "—",
            a = headlines(after.get(s)!.run)[row] ?? "—";
          return [b, a === b ? a : `**${a}**`];
        });
        return `| ${row} | ${cells.join(" | ")} |`;
      }),
      "",
      "**Leaf diff** (every path, all scenarios; the comparator at its default tolerance):",
      "",
    ];
    const detail: string[] = [];
    for (const s of FIXTURE_SLUGS)
      for (const sc of SCENARIOS[s]) {
        const b = before.get(s)?.[sc],
          a = after.get(s)![sc];
        if (!b) {
          lines.push(`- ${s} ${sc}: new`);
          continue;
        }
        const d = differences(a, b, EXPECTED);
        const removed = d.filter((x) => x.endsWith("missing in actual")).length,
          added = d.filter((x) => x.endsWith("unexpected in actual")).length;
        lines.push(`- ${s} ${sc}: ${d.length - removed - added} changed, ${added} added, ${removed} removed`);
        detail.push(
          ...d.map(
            (x) =>
              `${s} ${sc}: ${x.replace("missing in actual", "removed").replace("unexpected in actual", "added")}`,
          ),
        );
      }
    if (detail.length)
      lines.push(
        "",
        "<details><summary>Every changed path</summary>",
        "",
        "```",
        ...detail,
        "```",
        "",
        "</details>",
      );
    mkdirSync("test-results", { recursive: true });
    writeFileSync(OUT, lines.join("\n") + "\n");
    process.stdout.write(`\n${lines.join("\n")}\n`);
  });
});
