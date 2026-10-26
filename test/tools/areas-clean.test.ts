/**
 * The areas job's clean-up (scripts/areas-clean-old.sh, run by .github/workflows/places.yml): it removes the older
 * versions' area files directly inside their folders, and never a file in a subfolder. #350's run took all 60 of
 * public/areas/v1/samples/ with a bare pathspec; this fails if a sample file would go.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = join(process.cwd(), "scripts", "areas-clean-old.sh");
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

/** A scratch repository holding these files, committed. */
function repo(files: readonly string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "areas-clean-"));
  dirs.push(dir);
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: dir });
  git("init", "-q");
  for (const f of files) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    writeFileSync(join(dir, f), "{}\n");
  }
  git("add", ".");
  git("commit", "-qm", "files");
  return dir;
}
const tracked = (dir: string) =>
  execFileSync("git", ["ls-files"], { cwd: dir }).toString().trim().split("\n").sort();

describe("the areas job's clean-up", () => {
  it("removes an older version's area files, and nothing in a subfolder", () => {
    const dir = repo([
      "public/areas/v1/ashe.json",
      "public/areas/v1/samples/ashe-1.json",
      "public/areas/v1/samples/ashe-2.json",
      "public/areas/v2/ashe.json",
      "public/areas/v2/index.json",
    ]);
    execFileSync(SCRIPT, ["2"], { cwd: dir });
    expect(tracked(dir)).toEqual([
      "public/areas/v1/samples/ashe-1.json",
      "public/areas/v1/samples/ashe-2.json",
      "public/areas/v2/ashe.json",
      "public/areas/v2/index.json",
    ]);
  });

  it("keeps the samples when the older folder has no area files left (#350's case)", () => {
    const dir = repo(["public/areas/v1/samples/ashe-1.json", "public/areas/v2/ashe.json"]);
    execFileSync(SCRIPT, ["2"], { cwd: dir });
    expect(tracked(dir)).toEqual(["public/areas/v1/samples/ashe-1.json", "public/areas/v2/ashe.json"]);
  });

  it("is what the places workflow's areas job runs", () => {
    expect(readFileSync(join(process.cwd(), ".github/workflows/places.yml"), "utf8")).toContain(
      'scripts/areas-clean-old.sh "$v"',
    );
  });
});
