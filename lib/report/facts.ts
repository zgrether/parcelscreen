/** The shapes report sections share: facts-table rows, rich list items, and site cards. */

/** A row of a facts table: a label, its value, and an optional small note under the value. */
export interface FactRow {
  label: string;
  value: string;
  /** Bold text after the value ("$12–18k", "… needs an easement"). */
  strong?: string;
  note?: string;
}

/** A list item that may open with a bold lead ("Bottomland: …." then the plain text). */
export interface RichItem {
  strong?: string;
  text: string;
}

/** A grade chip: "A site", "$$ to build", or a garden's bare letter. */
export interface GradeChip {
  text: string;
  /** The grade letter (A–F, styled by grade) or "cost" (outlined). */
  kind: string;
  title?: string;
}

/** A ranked spot: a site, the existing house, or a garden patch (proto L1502, L1509, L1534). */
export interface SiteCard {
  /** The round marker: the rank, "⌖" for the house, "G1" for a garden. */
  marker: { text: string; style: "top" | "alt" | "garden-top" | "garden-alt" };
  title: string;
  chips: GradeChip[];
  /** The muted line after the chips. */
  summary: string;
  /** Sun, aspect, frost, slope, sky points (and the driveway length, for a site). */
  factors: { label: string; value: string }[];
  items: RichItem[];
}

/** The factor points of a scored spot, as the cards show them. */
export function factorsOf(q: { sun: number; aspect: number; frost: number; slope: number; sky: number }) {
  return [
    { label: "sun", value: String(q.sun) },
    { label: "aspect", value: String(q.aspect) },
    { label: "frost", value: String(q.frost) },
    { label: "slope", value: String(q.slope) },
    { label: "sky", value: String(q.sky) },
  ];
}
