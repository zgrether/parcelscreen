/**
 * My order (WF3, docs/plans/parcel-workflow.md §5): the household's own ranking of the list, kept on each parcel as a
 * fractional index, a string that sorts between its neighbours. A move writes one parcel, not all of them, which
 * matters once the list syncs (Phase 1, `list_rank`). A new parcel goes to the bottom. Other sorts are views: they
 * never rewrite it. Pure.
 */
import type { ParcelStore, WorkingParcel } from "./parcelStore";

/** A rank's digits, in the order JavaScript compares strings ("0" < "9" < "A" < "Z" < "a" < "z"). */
const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** A well-formed rank: base-62 digits, never ending in the lowest one (so there's always room before it). */
export const RANK_PATTERN = /^[0-9A-Za-z]*[1-9A-Za-z]$/;

/** The digits after "0.", strictly between a and b (b null: no upper bound). Two ranks never meet: a < b. */
function midpoint(a: string, b: string | null): string {
  if (b !== null) {
    // The common prefix (a padded with the lowest digit) stays; the rest is split below it.
    let n = 0;
    while ((a[n] ?? DIGITS[0]) === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const da = a ? DIGITS.indexOf(a[0]!) : 0;
  const db = b !== null ? DIGITS.indexOf(b[0]!) : DIGITS.length;
  if (db - da > 1) return DIGITS[Math.round((da + db) / 2)]!;
  // Neighbouring first digits: b's first digit alone, when b goes on past it; else a's, then a midpoint further down.
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return DIGITS[da]! + midpoint(a.slice(1), null);
}

/** A rank after `a` and before `b`; null for either end. */
export function rankBetween(a: string | null, b: string | null): string {
  if (a !== null && b !== null && a >= b) throw new Error(`no rank between ${a} and ${b}`);
  return midpoint(a ?? "", b);
}

/** Lower rank first; a tie (two browsers' ranks, before withRanks runs) by key, so the order is the same everywhere. */
export const byRank = (
  a: Pick<WorkingParcel, "rank" | "key">,
  b: Pick<WorkingParcel, "rank" | "key">,
): number =>
  a.rank === b.rank
    ? (a.key ?? "").localeCompare(b.key ?? "")
    : a.rank === null
      ? 1
      : b.rank === null
        ? -1
        : a.rank < b.rank
          ? -1
          : 1;

/** The highest rank in History, or null when nothing has one. */
export const lastRank = (built: readonly WorkingParcel[]): string | null =>
  built.reduce<string | null>((m, p) => (p.rank !== null && (m === null || p.rank > m) ? p.rank : m), null);

/**
 * Every History parcel with a rank of its own: one without (kept before WF3, or imported) goes to the bottom, in
 * History's order (oldest first), and one sharing another's rank moves just after it. Unchanged when all are ranked
 * apart (the same store back), so it's cheap to run on every read.
 */
export function withRanks(s: ParcelStore): ParcelStore {
  const ranked = s.built
    .map((p, i) => ({ p, i }))
    .filter((x) => x.p.rank !== null)
    .sort((x, y) => byRank(x.p, y.p) || x.i - y.i);
  const given = new Map<number, string>();
  let prev: string | null = null;
  ranked.forEach(({ p, i }, j) => {
    const r = p.rank!;
    if (prev === null || r > prev) prev = r;
    else {
      const after: string = prev;
      const next = ranked.slice(j + 1).find((x) => x.p.rank! > after)?.p.rank ?? null;
      prev = rankBetween(after, next);
      given.set(i, prev);
    }
  });
  s.built.forEach((p, i) => {
    if (p.rank !== null) return;
    prev = rankBetween(prev, null);
    given.set(i, prev);
  });
  if (!given.size) return s;
  const built = s.built.map((p, i) => (given.has(i) ? { ...p, rank: given.get(i)! } : p));
  const open = s.open?.key ? (built.find((b) => b.key === s.open!.key) ?? s.open) : s.open;
  return { ...s, built, open };
}

/**
 * The rank that puts `key` at `to` among the parcels shown (the list's rows in My order, filters applied), as a drag
 * or Move up / Move down leaves it. Among every History parcel: just after the shown row it lands under, or just
 * before the one it lands above when it goes to the top, so parcels the filters hide keep their places. Null when it
 * doesn't move.
 */
export function rankForMove(
  all: readonly Pick<WorkingParcel, "rank" | "key">[],
  shown: readonly string[],
  key: string,
  to: number,
): string | null {
  const from = shown.indexOf(key);
  if (from < 0 || to < 0 || to >= shown.length || to === from) return null;
  const rest = shown.filter((k) => k !== key);
  const above = rest[to - 1] ?? null,
    below = rest[to] ?? null;
  const order = all.filter((p) => p.key !== key && p.rank !== null).sort(byRank);
  const at = (k: string) => order.findIndex((p) => p.key === k);
  if (above !== null) {
    const i = at(above);
    return rankBetween(order[i]!.rank, order[i + 1]?.rank ?? null);
  }
  const i = at(below!);
  return rankBetween(order[i - 1]?.rank ?? null, order[i]!.rank);
}
