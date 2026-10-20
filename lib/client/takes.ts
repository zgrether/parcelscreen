/**
 * Asks and takes (step 6, docs/plans/step-6-household.md §4): the household's shared document, `ps.household`.
 *   - An ask: one member asks another for their take on a parcel, with an optional note. One open ask per parcel and
 *     person; asking again replaces it.
 *   - A take: a member's Yes / Maybe / No on a parcel, with an optional comment. One per parcel and person; changing it
 *     replaces it. A take doesn't need an ask.
 *   - Waiting for you: an ask to me with no take of mine made after it.
 * Each ask and take syncs as a whole record (the later save wins), like a parcel. Pure: tested in Node.
 */
import { z } from "zod";

export type Answer = "yes" | "maybe" | "no";
export const ANSWERS: readonly Answer[] = ["yes", "maybe", "no"];
export const ANSWER_WORD: Record<Answer, string> = { yes: "Yes", maybe: "Maybe", no: "No" };

export const AskSchema = z.object({
  key: z.string(),
  parcel: z.string(),
  from: z.string(),
  to: z.string(),
  note: z.string().max(500).default(""),
  at: z.string(),
});
export const TakeSchema = z.object({
  key: z.string(),
  parcel: z.string(),
  by: z.string(),
  answer: z.enum(["yes", "maybe", "no"]),
  comment: z.string().max(1000).default(""),
  at: z.string(),
});
export type Ask = z.infer<typeof AskSchema>;
export type Take = z.infer<typeof TakeSchema>;

export const HouseholdSchema = z.object({
  v: z.literal(1),
  asks: z.array(AskSchema).default([]),
  takes: z.array(TakeSchema).default([]),
});
export type Household = z.infer<typeof HouseholdSchema>;
export const EMPTY_HOUSEHOLD: Household = { v: 1, asks: [], takes: [] };

export const askKey = (parcel: string, to: string): string => `${parcel}:${to}`;
export const takeKey = (parcel: string, by: string): string => `${parcel}:${by}`;

export function readHousehold(raw: string): Household | null {
  try {
    const r = HouseholdSchema.safeParse(JSON.parse(raw));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

export const takeOf = (h: Household, parcel: string, by: string): Take | null =>
  h.takes.find((t) => t.key === takeKey(parcel, by)) ?? null;
export const askOf = (h: Household, parcel: string, to: string): Ask | null =>
  h.asks.find((a) => a.key === askKey(parcel, to)) ?? null;

/** Asks someone for their take; asking again replaces the open ask. */
export function withAsk(h: Household, a: Omit<Ask, "key">): Household {
  const ask: Ask = { ...a, key: askKey(a.parcel, a.to) };
  return { ...h, asks: [...h.asks.filter((x) => x.key !== ask.key), ask] };
}

/** Gives (or changes) a take. */
export function withTake(h: Household, t: Omit<Take, "key">): Household {
  const take: Take = { ...t, key: takeKey(t.parcel, t.by) };
  return { ...h, takes: [...h.takes.filter((x) => x.key !== take.key), take] };
}

/** A parcel removed from the list takes its asks and takes with it. */
export const withoutParcel = (h: Household, parcel: string): Household => ({
  ...h,
  asks: h.asks.filter((a) => a.parcel !== parcel),
  takes: h.takes.filter((t) => t.parcel !== parcel),
});

/** Whether an ask to me waits for my take: no take of mine, or one made before the ask. */
export function waits(h: Household, a: Ask): boolean {
  const mine = takeOf(h, a.parcel, a.to);
  return !mine || mine.at < a.at;
}

/** The parcels waiting for my take. */
export const waitingFor = (h: Household, me: string): Set<string> =>
  new Set(h.asks.filter((a) => a.to === me && waits(h, a)).map((a) => a.parcel));

/**
 * Both like it (step 6 §3.1): no member's take on it is No, and every member with priorities grades it C or better.
 * `grades` are the members' letters (null: not graded, or no priorities, and left out); at least one must be graded.
 */
export function bothLikeIt(h: Household, parcel: string, grades: readonly (string | null)[]): boolean {
  if (h.takes.some((t) => t.parcel === parcel && t.answer === "no")) return false;
  const graded = grades.filter((g): g is string => g !== null);
  return graded.length > 0 && graded.every((g) => g <= "C");
}

/** The records the sync carries: each ask and take by its key and kind. */
export type HouseholdRecord = { kind: "ask"; record: Ask } | { kind: "take"; record: Take };
export const recordsOf = (h: Household): HouseholdRecord[] => [
  ...h.asks.map((record) => ({ kind: "ask" as const, record })),
  ...h.takes.map((record) => ({ kind: "take" as const, record })),
];
