/**
 * The diff:prototype report's text, and its summary line (Batch A §1). Pure, so the guard and its tests can
 * use it without running a screen.
 */
import { createHash } from "node:crypto";

/** Where pnpm diff:prototype writes its report (gitignored). */
export const REPORT_FILE = "test-results/diff-prototype.txt";

/** The fixture's short name in the summary: its slug up to the first hyphen ("ferney", "macks", "grayson"). */
export const shortName = (slug: string): string => slug.split("-")[0]!;

/**
 * One section per fixture, then the summary as the last line:
 *   diff:prototype <hash>: <n> differences (ferney <a>, macks <b>, grayson <c>)
 * The hash (12 hex digits of SHA-256) covers everything above the summary, so a pasted summary from an older
 * run doesn't match.
 */
export function prototypeDiffReport(perFixture: ReadonlyMap<string, readonly string[]>): string {
  const body = [...perFixture]
    .map(([slug, lines]) =>
      [
        `${slug}: ${lines.length} difference${lines.length === 1 ? "" : "s"}`,
        ...lines.map((l) => `  ${l}`),
      ].join("\n"),
    )
    .join("\n");
  const total = [...perFixture.values()].reduce((n, l) => n + l.length, 0);
  const counts = [...perFixture].map(([slug, lines]) => `${shortName(slug)} ${lines.length}`).join(", ");
  const hash = createHash("sha256").update(body).digest("hex").slice(0, 12);
  return `${body}\n${summaryLine(hash, total, counts)}\n`;
}

export const summaryLine = (hash: string, total: number, counts: string): string =>
  `diff:prototype ${hash}: ${total} difference${total === 1 ? "" : "s"} (${counts})`;

/** The summary line of a report: its last line starting "diff:prototype ". */
export function summaryOf(report: string): string | null {
  const lines = report.split(/\r?\n/).filter((l) => l.startsWith("diff:prototype "));
  return lines.at(-1) ?? null;
}
