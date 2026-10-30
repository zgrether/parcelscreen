/**
 * Screenshot mode (CLAUDE.md, phase-0.md §9.23): under the screenshot runs' cookie the facts card hides the owner of
 * record and the site address, and every screenshot spec takes its `test` from screenshots/fixtures.ts, whose guard
 * refuses a capture that shows either unmasked. e2e/owner-guard.spec.ts checks the guard in a browser.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ParcelFacts } from "@/components/Explore/ParcelFacts";
import { square } from "@/test/support/parcels";
import { inScreenshots, OWNER_HIDDEN, SCREENSHOT_COOKIE } from "./screenshots";

const record = {
  geo: square(-81.56),
  props: { parno: "1234", ownname: "A. TEST OWNER", siteadd: "1 TEST RD", cntyname: "Ashe" },
  source: "https://services.nconemap.gov/x",
  multiPart: false,
};

afterEach(() => vi.unstubAllGlobals());

describe("screenshot mode", () => {
  it("is on only with the screenshot runs' cookie", () => {
    expect(inScreenshots()).toBe(false); // no document: the server, or Node
    vi.stubGlobal("document", { cookie: "a=1; other=2" });
    expect(inScreenshots()).toBe(false);
    vi.stubGlobal("document", { cookie: `a=1; ${SCREENSHOT_COOKIE}=1` });
    expect(inScreenshots()).toBe(true);
  });

  it("hides the owner of record and the site address in the facts card", () => {
    const shown = renderToStaticMarkup(createElement(ParcelFacts, { parcel: record }));
    expect(shown).toContain("A. TEST OWNER");
    expect(shown).toContain("1 TEST RD");
    vi.stubGlobal("document", { cookie: `${SCREENSHOT_COOKIE}=1` });
    const hidden = renderToStaticMarkup(createElement(ParcelFacts, { parcel: record }));
    expect(hidden).not.toContain("A. TEST OWNER");
    expect(hidden).not.toContain("1 TEST RD");
    expect(hidden.match(new RegExp(OWNER_HIDDEN, "g"))).toHaveLength(2);
    // The rest of the card is unchanged.
    expect(hidden).toContain("1234");
    expect(hidden).toContain("Ashe");
  });

  it("every screenshot spec takes its test from the guarded fixtures, never straight from Playwright", () => {
    const dir = join(process.cwd(), "screenshots");
    const specs = readdirSync(dir).filter((f) => f.endsWith(".spec.ts"));
    expect(specs.length).toBeGreaterThan(0);
    for (const f of specs) {
      const src = readFileSync(join(dir, f), "utf8");
      expect(src, f).toMatch(/import \{[^}]*\btest\b[^}]*\} from "\.\/fixtures";/);
      expect(src, f).not.toMatch(/import \{[^}]*\b(test|expect)\b[^}]*\} from "@playwright\/test";/);
    }
  });
});
