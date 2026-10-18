/**
 * A new profile starts with the interview (step 4, docs/plans/step-4-interview.md §6.1; owner Q9). A profile created
 * on a first visit, or by "Add a profile", is given an interview document marked `onboarding`, in state "new"; until
 * it's finished or put off with "Not now", any page sends it to /interview.
 *
 * Automated browsers (Playwright: `navigator.webdriver`) aren't sent unless they ask with `ps.onboard`, so the e2e that
 * open pages on a fresh profile keep testing those pages. No person's browser sets that flag, so nothing a user sees
 * depends on it. (The plan proposed `ps.debug`; most specs don't set it.)
 */
import { freshDoc, type InterviewDoc } from "@/lib/rubric/interview/doc";
import { getPref } from "./prefs";

/** The flag an e2e sets to be sent to the interview like a person. */
export const ONBOARD_FLAG = "ps.onboard";

/** A new profile's interview document: begun from the start, with "Not now" on every screen. */
export const onboardingDoc = (): InterviewDoc => ({ ...freshDoc("new"), onboarding: true });

/** Whether this browser takes part in onboarding: always, except an automated one that hasn't asked to. */
export function onboardingOn(): boolean {
  if (typeof navigator === "undefined" || !navigator.webdriver) return true;
  try {
    return localStorage.getItem(ONBOARD_FLAG) === "1";
  } catch {
    return false;
  }
}

/** Whether the current profile should be sent to the interview: a new profile's, not yet finished or put off. */
export function owesInterview(doc: InterviewDoc | null = getPref("ps.interview")): boolean {
  return !!doc?.onboarding && (doc.state === "new" || doc.state === "inProgress") && onboardingOn();
}
