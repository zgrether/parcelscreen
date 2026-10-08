/**
 * The expected-guard rule (Batch A §1, owner 2026-10-08): a PR may add or change a fixture's expected.json
 * only if its description declares a numbers change and includes the `pnpm diff:prototype` output. Pure: the
 * CI job (test/tools/expected-guard.test.ts, --mode guard) feeds it the changed files, the description and
 * the summary line of a fresh diff:prototype run on the PR's head.
 */

export interface GuardInput {
  /** Paths changed by the PR, relative to the repo root. */
  changedFiles: readonly string[];
  /** The PR description. */
  body: string;
  /** The summary line of `pnpm diff:prototype` on the PR's head, or null if it didn't run. */
  summary: string | null;
}

export interface GuardResult {
  ok: boolean;
  message: string;
}

const EXPECTED_FILE = /^test\/fixtures\/[^/]+\/expected\.json$/;
const DECLARATION = /^\s*(?:[-*]\s*)?(?:\*\*)?Numbers change:/im;

export function checkExpectedGuard({ changedFiles, body, summary }: GuardInput): GuardResult {
  const changed = changedFiles.map((f) => f.trim()).filter((f) => EXPECTED_FILE.test(f));
  if (!changed.length) return { ok: true, message: "No expected.json changed." };
  const files = changed.join(", ");
  const problems: string[] = [];
  if (!DECLARATION.test(body))
    problems.push('the description has no "Numbers change:" line declaring what moved and why');
  if (!summary) problems.push("pnpm diff:prototype produced no summary line");
  else if (!body.split(/\r?\n/).some((l) => l.trim() === summary))
    problems.push(
      `the description doesn't include this head's pnpm diff:prototype output; its summary line is:\n  ${summary}`,
    );
  return problems.length
    ? { ok: false, message: `${files} changed, but ${problems.join("; and ")}.` }
    : {
        ok: true,
        message: `${files} changed, with a numbers-change declaration and the current diff:prototype output.`,
      };
}
