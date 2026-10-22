/**
 * The household's members (step 6, docs/plans/step-6-household.md §2): the profiles on this device, which on a joined
 * device are the synced space's. Each member's own rubric and the why context of their answers are loaded once the
 * profile has booted, and again whenever another profile changes (an add, a rename, a delete, a sync), so the pages read
 * them synchronously, as they read prefs, and hear RUBRICS_CHANGED.
 *
 * A member "has priorities" when their documents hold their own rubric (their questions or the editor wrote it); one
 * who hasn't gets no grade anywhere.
 */
import type { InterviewDoc } from "@/lib/rubric/interview/doc";
import type { Rubric } from "@/lib/rubric/types";
import type { WhyContext } from "@/lib/rubric/words";
import { withDriveway } from "@/lib/rubric/drivewayAdd";
import { withNewFactors } from "@/lib/rubric/factorsAdd";
import { addedTo } from "./drivewayAdd";
import { factorsAddedTo } from "./factorsAdd";
import { whyContext } from "./myAnswers";
import { getPref, type KeyValueStore } from "./prefs";
import { activeKv } from "./profileKv";
import { currentProfileId, profileStorage } from "./profiles";
import { PROFILES_CHANGED, RUBRICS_CHANGED } from "./profileEvents";

export interface Member {
  id: string;
  name: string;
  /** Their own rubric; null until they've set their priorities. */
  rubric: Rubric | null;
  /** Their answers' why lines, when they've answered. */
  why: WhyContext | null;
}

let list: Member[] = [];

/** Every member, the order they joined (created) in. */
export const members = (): readonly Member[] => list;
/** The members other than the current profile. */
export const otherMembers = (): Member[] => list.filter((m) => m.id !== currentProfileId());
/** A member's name by profile id; null for an id no member has (a deleted profile). */
export const memberName = (id: string | null): string | null =>
  (id && list.find((m) => m.id === id)?.name) || null;

/** A read-only store over one profile's documents, for the prefs module's readers. */
const readOnly = (docs: ReadonlyMap<string, string>): KeyValueStore => ({
  getItem: (k) => docs.get(k) ?? null,
  setItem: () => undefined,
});

export async function loadHousehold(): Promise<void> {
  const s = profileStorage();
  if (!s) return;
  const profiles = (await s.profiles().catch(() => [])).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  const current = currentProfileId();
  const next: Member[] = [];
  for (const p of profiles) {
    const kv =
      p.id === current && activeKv()
        ? activeKv()!
        : readOnly(new Map((await s.docs(p.id).catch(() => [])).map((d) => [d.key, d.value])));
    const rubrics = getPref("ps.rubrics", kv);
    const interview = getPref("ps.interview", kv) as InterviewDoc | null;
    // Step 7 (owner, #216): priorities saved before the Driveway row get it, as their own device will add it.
    const added = addedTo(rubrics, interview?.answers.driveway);
    // Step 11: and its new factors, as their own device will add them.
    const factors = factorsAddedTo(added ?? rubrics, interview?.answers);
    const mine = factors?.rubrics.mine ?? added?.mine ?? rubrics?.mine ?? null;
    const drivewayBase =
      added && interview?.base ? withDriveway(interview.base, interview.answers.driveway) : null;
    const priorBase = drivewayBase ?? interview?.base ?? null;
    const base =
      factors && priorBase ? withNewFactors(priorBase, {}, interview?.answers).rubric : drivewayBase;
    const why = whyContext(base && interview ? { ...interview, base } : interview);
    next.push({ id: p.id, name: p.name, rubric: mine, why });
  }
  list = next;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(RUBRICS_CHANGED));
}

let listening = false;
/** Loads the members, and reloads them whenever a profile changes (once per page). */
export async function startHousehold(): Promise<void> {
  if (!listening && typeof window !== "undefined") {
    listening = true;
    window.addEventListener(PROFILES_CHANGED, () => void loadHousehold());
  }
  await loadHousehold();
}

/** For tests. */
export function setMembersForTests(m: Member[]): void {
  list = m;
}
