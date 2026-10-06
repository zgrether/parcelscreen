/**
 * The help (14e): its copy is the prototype's dialog, word for word, and every report section's "?" opens
 * an anchor that's there.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ScreenResult } from "@/lib/screen/types";
import { evaluationPoint } from "@/components/Results/blocks/types";
import { REPORT } from "@/components/Results/report";
import { loadFixture, FIXTURE_SLUGS } from "@/test/support/fixtures";
import { fromPrototype } from "@/test/support/fromPrototype";
import { visibleText } from "@/test/support/prototypeReport";
import { HelpText } from "./HelpText";

const ours = renderToStaticMarkup(<HelpText />);

/** The prototype's help copy: the dialog's content after its title row (proto L289–337). */
function prototypeHelp(): string {
  const html = readFileSync(resolve(import.meta.dirname, "..", "..", "legacy", "parcelscreen.html"), "utf8");
  const dialog = html.slice(
    html.indexOf('<dialog id="help">'),
    html.indexOf("</dialog>", html.indexOf('<dialog id="help">')),
  );
  return dialog.slice(dialog.indexOf('<p class="tiny muted">'));
}

describe("help (14e)", () => {
  it("is the prototype's copy, word for word", () => {
    expect(visibleText(ours)).toBe(visibleText(prototypeHelp()));
  });

  it("has the prototype's anchors, in its order", () => {
    const ids = (html: string) => [...html.matchAll(/<h3 id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids(ours)).toEqual(ids(prototypeHelp()));
  });

  it("has an anchor for every report section's ? link", () => {
    const anchors = new Set([...ours.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
    for (const slug of FIXTURE_SLUGS)
      for (const R of Object.values(loadFixture(slug).goldens)) {
        const result = fromPrototype(R!) as ScreenResult;
        for (const { heading } of REPORT)
          expect(anchors).toContain(heading(result, evaluationPoint(result)).help);
      }
  });
});
