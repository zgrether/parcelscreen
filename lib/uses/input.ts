/**
 * The uses' input as the panel and the report build it (step 14 §3, §6, §7): the card's facts at the card's own site
 * (cardFacts, not the Card, so a person's adjustments don't change what the land can do), the parcel's marks, lines and
 * listing. And the tally the Grade tab's shortcut line says. Pure.
 */
import { cardFacts, type Card } from "../report/card";
import type { Drawn } from "../report/marks";
import { SCREEN_CONSTANTS } from "../screen/config";
import type { PartialScreenResult } from "../screen/types";
import type { LineMarkup, Markup, WorkingParcel } from "../client/parcelStore";
import type { LandUses } from "./index";
import type { Answer, UseLine, UsesInput } from "./types";

/** What the uses read from the parcel itself (parcelStore's WorkingParcel). */
export type UsesParcel = Pick<WorkingParcel, "markup" | "deedRestrictions" | "hoa"> &
  Partial<Pick<WorkingParcel, "listingAcres" | "fromOriginal" | "facts">>;

const isLine = (m: Markup): m is LineMarkup => m.shape === "line";

export function usesInputOf(
  result: PartialScreenResult,
  card: Pick<Card, "at" | "rubric">,
  drawn: Drawn,
  parcel: UsesParcel,
): UsesInput {
  const R = card.rubric.rubric;
  const K = { ...SCREEN_CONSTANTS.card, rows: R.bands };
  return {
    result,
    facts: cardFacts(result, K, SCREEN_CONSTANTS.build, drawn, card.at, R.budgets),
    marks: drawn.marks,
    lines: parcel.markup.filter(isLine).map((l): UseLine => ({
      id: l.id,
      name: l.name,
      kind: l.kind,
      easementType: l.easementType ?? null,
      recordedIn: l.recordedIn,
    })),
    listing: {
      deedRestrictions: parcel.deedRestrictions,
      hoa: parcel.hoa,
      listingAcres: parcel.listingAcres ?? null,
      survey: parcel.facts?.survey ?? null,
      ...(parcel.fromOriginal?.length ? { fromOriginal: parcel.fromOriginal } : {}),
    },
  };
}

/** How many uses answer Yes, Maybe and No. */
export function tallyOf(v: LandUses): Record<Answer, number> {
  const t: Record<Answer, number> = { yes: 0, maybe: 0, no: 0 };
  for (const u of v.uses) t[u.answer.answer] += 1;
  return t;
}
