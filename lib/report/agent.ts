/**
 * Still unknown (step 7 plan §1.5): each Must the screen couldn't settle, as a plain question for the listing agent,
 * ready to copy. A Must that's "check first" or unknown for a reason other than data that didn't load becomes a
 * question; data that didn't load isn't the agent's to answer, so it's listed apart, with Try again. Pure.
 */
import type { GateKey } from "../rubric/types";
import type { Card } from "./card";

/** One question per gate (plan §8): what to ask the agent when the screen can't settle it. */
export const AGENT_QUESTIONS: Record<GateKey, string> = {
  floodplain:
    "Has any part of the land flooded, and is any of it in a county or FEMA flood zone? FEMA hasn't mapped this area.",
  access:
    "How is the land reached legally: frontage on a public road, or a recorded right-of-way? Which deed or plat shows it?",
  easement: "Does the driveway need to cross neighbouring land? If so, is there a recorded easement for it?",
  septic: "Has the land had a perc test or a soil evaluation? Is a conventional septic system possible?",
};

export interface AgentQuestion {
  key: GateKey;
  question: string;
  /** The gate's own reason: why we ask. */
  why: string;
}

/** The questions for this card's Musts, in the card's order. */
export function agentQuestions(card: Card): AgentQuestion[] {
  const R = card.rubric.rubric;
  const must = (k: GateKey) => R.musts.some((m) => m.factor === k && m.threshold === undefined);
  // Floodplain's warn (a mapped zone touching the site or the drive) is measured, not unknown: not a question.
  const open = (g: Card["gates"][number]) =>
    g.status === "unknown" || (g.status === "warn" && g.key !== "floodplain");
  return card.gates
    .filter((g) => must(g.key) && !g.missing && open(g))
    .map((g) => ({ key: g.key, question: AGENT_QUESTIONS[g.key], why: g.reason }));
}

/** Copy all: the questions as a numbered list under the parcel's name. */
export function copyAllText(name: string, qs: readonly AgentQuestion[]): string {
  return [`Questions about ${name}:`, ...qs.map((q, i) => `${i + 1}. ${q.question}`)].join("\n");
}
