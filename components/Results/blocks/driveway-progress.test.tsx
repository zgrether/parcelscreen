/**
 * A4b PR B (owner, 2026-10-10): the driveway step can take seconds on a phone, so the rest of the report shows first
 * and the driveway section says it's routing,
 * with the router's count of searches (lib/client/screen-progress.test.ts: the step times).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREEN_SCHEMA_VERSION } from "@/lib/screen/types";
import type { PartialScreenResult } from "@/lib/screen/types";
import { Driveway } from "./Driveway";

const partial = {
  schemaVersion: SCREEN_SCHEMA_VERSION,
  runAt: "",
  flags: [],
  failed: [],
} as unknown as PartialScreenResult;

describe("the driveway section while the router works", () => {
  it("says it's routing, with the count of searches, until the route arrives", () => {
    const html = renderToStaticMarkup(
      <Driveway
        result={partial}
        point={null}
        variant="panel"
        running={{ step: "driveway", message: "3 route searches done" }}
      />,
    );
    expect(html).toBe('<p class="muted">Routing the driveway… 3 route searches done.</p>');
  });

  it("shows nothing for another step, or with no run in progress (the parcel page, print)", () => {
    expect(
      renderToStaticMarkup(
        <Driveway result={partial} point={null} variant="panel" running={{ step: "rank" }} />,
      ),
    ).toBe("");
    expect(renderToStaticMarkup(<Driveway result={partial} point={null} variant="panel" />)).toBe("");
  });
});
