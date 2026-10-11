/** The asking price on a History parcel (owner, #101, 2026-10-11): parsed from what's typed, and shown. */

/** "185000", "$185,000", "185k", "1.2m" → dollars; "" → null (cleared); anything else → undefined (not a price). */
export function parsePrice(text: string): number | null | undefined {
  const t = text.replace(/[$,\s]/g, "").toLowerCase();
  if (t === "") return null;
  const m = /^(\d+(?:\.\d+)?)(k|m)?$/.exec(t);
  if (!m) return undefined;
  const v = Number(m[1]) * (m[2] === "k" ? 1_000 : m[2] === "m" ? 1_000_000 : 1);
  return Number.isFinite(v) ? Math.round(v) : undefined;
}

/** The parcel sheet's line: "asking $185,000 as of Oct 11, 2026" (owner's wording). */
export function askingLine(price: number, at: string): string {
  const day = new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `asking $${price.toLocaleString("en-US")} as of ${day}`;
}

/** History's short form: "$185k", "$1.2M". */
export function shortPrice(price: number): string {
  if (price >= 1_000_000) return `$${+(price / 1_000_000).toFixed(2)}M`;
  if (price >= 1_000) return `$${+(price / 1_000).toFixed(1)}k`;
  return `$${price}`;
}
