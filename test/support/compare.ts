/**
 * The parity comparator (plan §7a, "Engine rounding" in §5). Computed numbers match within a relative
 * tolerance; strings, booleans, array lengths and object keys match exactly. `null` on either side stands
 * for a non-finite value (NaN/Infinity serialize as null), so null ≡ NaN.
 *
 * Renames between prototype and port never happen here: they live in fromPrototype.ts.
 */

export interface Tolerance {
  /** Relative tolerance on numbers (default 1e-9). */
  rel?: number;
  /** Absolute floor, for values near zero (default 1e-9). */
  abs?: number;
}

export interface CompareOptions extends Tolerance {
  /** Per-path tolerances, by exact path ("sun.decDirectH") or path prefix ending in "." ("sky."). */
  paths?: Record<string, Tolerance>;
  /** Paths to skip entirely (e.g. "runAt"). */
  ignore?: string[];
}

const isNonFinite = (v: unknown) => v === null || (typeof v === "number" && !Number.isFinite(v));

/** Every difference between `actual` and `expected`, as "path: detail" lines. Empty means they match. */
export function differences(
  actual: unknown,
  expected: unknown,
  opts: CompareOptions = {},
  path = "",
): string[] {
  if (opts.ignore?.some((p) => path === p || path.startsWith(p + ".") || path.startsWith(p + "["))) return [];
  const here = path || "(root)";

  if (isNonFinite(actual) || isNonFinite(expected)) {
    return isNonFinite(actual) && isNonFinite(expected)
      ? []
      : [`${here}: ${String(actual)} vs ${String(expected)}`];
  }
  if (typeof expected === "number" || typeof actual === "number") {
    if (typeof actual !== "number" || typeof expected !== "number")
      return [`${here}: ${typeof actual} vs number`];
    const t = toleranceFor(path, opts);
    const diff = Math.abs(actual - expected);
    const ok = diff <= Math.max(t.abs, t.rel * Math.max(Math.abs(actual), Math.abs(expected)));
    return ok ? [] : [`${here}: ${actual} vs ${expected} (diff ${diff.toExponential(2)})`];
  }
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(actual) || !Array.isArray(expected)) return [`${here}: array vs non-array`];
    if (actual.length !== expected.length) return [`${here}: length ${actual.length} vs ${expected.length}`];
    return actual.flatMap((a, i) => differences(a, expected[i], opts, `${path}[${i}]`));
  }
  if (expected && typeof expected === "object") {
    if (!actual || typeof actual !== "object") return [`${here}: ${String(actual)} vs object`];
    const a = actual as Record<string, unknown>,
      e = expected as Record<string, unknown>;
    const out: string[] = [];
    for (const k of new Set([...Object.keys(a), ...Object.keys(e)])) {
      const sub = path ? `${path}.${k}` : k;
      if (opts.ignore?.includes(sub)) continue;
      if (a[k] === undefined && e[k] === undefined) continue;
      if (a[k] === undefined) out.push(`${sub}: missing in actual`);
      else if (e[k] === undefined) out.push(`${sub}: unexpected in actual`);
      else out.push(...differences(a[k], e[k], opts, sub));
    }
    return out;
  }
  return actual === expected ? [] : [`${here}: ${JSON.stringify(actual)} vs ${JSON.stringify(expected)}`];
}

function toleranceFor(path: string, opts: CompareOptions): Required<Tolerance> {
  const base = { rel: opts.rel ?? 1e-9, abs: opts.abs ?? 1e-9 };
  const plain = path.replace(/\[\d+\]/g, "");
  let best: Tolerance | undefined,
    bestLen = -1;
  for (const [p, t] of Object.entries(opts.paths ?? {})) {
    const hit = p.endsWith(".") ? plain.startsWith(p) : plain === p;
    if (hit && p.length > bestLen) {
      best = t;
      bestLen = p.length;
    }
  }
  return { ...base, ...best };
}
