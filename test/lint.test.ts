// The repo's lint rule against async predicates in Playwright's waitForFunction (eslint.config.mjs; owner,
// after 18a): it passes at once on a Promise, so such a wait never waits.
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

const eslint = new ESLint();

async function messages(code: string): Promise<string[]> {
  const [r] = await eslint.lintText(code, { filePath: "e2e/lint-sample.spec.ts" });
  return r!.messages.filter((m) => m.ruleId === "no-restricted-syntax").map((m) => m.message);
}

const page = "declare const page: { waitForFunction(f: unknown): Promise<void> };\n";

describe("no async predicate in waitForFunction", () => {
  // The first lint builds typescript-eslint's program for the whole project: seconds alone, about a minute when the
  // full suite runs in parallel (it timed out the first case at 30 s, #126). Built once here, with room for that, so
  // each case below only lints its sample.
  beforeAll(() => messages(`${page}export {};\n`), 180_000);

  it.each([
    [
      "an async arrow",
      "await page.waitForFunction(async () => (await navigator.serviceWorker.ready) !== null);",
    ],
    ["an async function", "await page.waitForFunction(async function () { return false; });"],
    [
      "a Promise from .then",
      "await page.waitForFunction(() => navigator.serviceWorker.ready.then((r) => !!r));",
    ],
  ])(
    "rejects %s",
    async (_, call) => {
      expect(await messages(`${page}export {};\n${call}\n`)).toEqual([
        expect.stringContaining("waitForFunction doesn't await a Promise"),
      ]);
    },
    30_000,
  );

  it("allows a synchronous predicate", async () => {
    expect(
      await messages(
        `${page}export {};\nawait page.waitForFunction(() => !!navigator.serviceWorker.controller);\n`,
      ),
    ).toEqual([]);
  }, 30_000);
});
