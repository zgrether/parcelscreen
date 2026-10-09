/**
 * A route that leaves the parcel is never called legal, or within the limit, without "needs an easement"
 * (owner, #87 review): the driveway card, the map's tooltip, and the site's routed-driveway line.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { drivewayFeatures } from "@/lib/render/resultGeo";
import { drivewayView } from "@/lib/report/driveway";
import { routeLabel } from "@/lib/screen/routeLabel";
import { routedLine } from "@/lib/screen/score";
import type { ScreenResult } from "@/lib/screen/types";
import { FIXTURE_SLUGS } from "@/test/support/fixtures";
import { expectedPath } from "@/test/support/expected";

const run = (slug: string): ScreenResult =>
  (JSON.parse(readFileSync(expectedPath(slug as never), "utf8")) as { run: ScreenResult }).run;

describe("routes that need an easement say so (owner, #87)", () => {
  it.each(FIXTURE_SLUGS)(
    "%s: every route out of the parcel is labelled so on its card and on the map",
    (slug) => {
      const r = run(slug);
      const routes = r.driveway?.routes ?? [];
      const cards = drivewayView(r)?.routes ?? [];
      const tips = drivewayFeatures(r)
        .lines.features.filter((f) => f.properties.kind === "route")
        .map((f) => String(f.properties.tip));
      routes.forEach((rt, i) => {
        const said = [cards[i]!.title, tips[i]!];
        for (const text of said)
          if (rt.needsEasement) expect(text, text).toContain("needs an easement");
          else expect(text, text).not.toContain("needs an easement");
      });
      // Site #1's routed line (it's the recommended route's) says so too.
      const line = (r.sites ?? [])[0]?.why.find((w) => w.startsWith("routed driveway"));
      if (line && routes[0]) expect(line.endsWith(", needs an easement")).toBe(routes[0].needsEasement);
    },
  );

  // Since A4 the site is scored on its route kept to the parcel (lib/screen/a4-driveway.test.ts); the driveway card
  // and the routed line still describe the route within the limit, which crosses neighbouring land.
  it("Grayson's #1 is the case: its driveway card's route crosses neighbouring land", () => {
    const r = run("grayson-mud-creek-6273");
    expect(r.driveway!.routes[0]!.needsEasement).toBe(true);
    expect(drivewayView(r)!.routes[0]!.title).toBe("Recommended — shortest legal — needs an easement");
    expect(r.sites![0]!.why.find((w) => w.startsWith("routed driveway"))).toMatch(
      /^routed driveway: .*, needs an easement$/,
    );
  });

  it("the label and the line, for any route", () => {
    expect(routeLabel({ label: "shortest legal", needsEasement: true })).toBe(
      "shortest legal — needs an easement",
    );
    expect(routeLabel({ label: "shortest legal", needsEasement: false })).toBe("shortest legal");
    const rt = {
      metrics: { lengthFt: 1200.4, switchbacks: 1 },
      maxGrade: 0.1,
      cost: { low: 30_000, high: 56_000 },
    };
    expect(routedLine({ ...rt, needsEasement: true } as never)).toBe(
      "routed driveway: 1200 ft at ≤10%, 1 switchback, ~$30–56k, needs an easement",
    );
    expect(routedLine({ ...rt, needsEasement: false } as never)).not.toContain("easement");
  });
});
