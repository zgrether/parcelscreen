/**
 * A new profile starts with the interview (step 4 plan §6.1, owner Q9): a first visit's profile and an added one are
 * given an onboarding interview; the app sends a profile there until it's finished or put off; the menu's words.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  freshDoc,
  interviewLabel,
  menuOffersInterview,
  RESULT_AT,
  type InterviewDoc,
} from "@/lib/rubric/interview/doc";
import { onboardingDoc, owesInterview } from "./onboarding";
import { addProfile, bootProfiles, resetProfilesForTests } from "./profiles";
import { memoryProfileStorage } from "./profileStore";

const fakeLs = () => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
};

afterEach(() => {
  resetProfilesForTests();
  vi.unstubAllGlobals();
});

describe("a new profile starts with the interview", () => {
  it("a first visit's profile and an added one hold a new, onboarding interview; an existing one doesn't", async () => {
    const storage = memoryProfileStorage();
    const b = await bootProfiles({ storage, ls: fakeLs() });
    expect(b.created).toBe(true);
    const doc = (await storage.docs(b.profile.id)).find((d) => d.key === "ps.interview");
    expect(JSON.parse(doc!.value)).toEqual(onboardingDoc());
    const added = await addProfile("Profile 2");
    expect((await storage.docs(added.id)).map((d) => d.key)).toEqual(["ps.interview"]);
    // Booted again: not created, so nothing new is written.
    resetProfilesForTests();
    const again = await bootProfiles({ storage, ls: fakeLs() });
    expect(again.created).toBe(false);
  });

  it("an automated browser's first visit isn't marked, unless it asks with ps.onboard", async () => {
    vi.stubGlobal("navigator", { webdriver: true });
    vi.stubGlobal("localStorage", { getItem: () => null });
    const storage = memoryProfileStorage();
    const b = await bootProfiles({ storage, ls: fakeLs() });
    expect(await storage.docs(b.profile.id)).toEqual([]);
    expect(owesInterview(onboardingDoc())).toBe(false);
    vi.stubGlobal("localStorage", { getItem: (k: string) => (k === "ps.onboard" ? "1" : null) });
    expect(owesInterview(onboardingDoc())).toBe(true);
  });

  it("owed until it's finished or put off; never for an interview taken from the menu", () => {
    const begun: InterviewDoc = { ...onboardingDoc(), state: "inProgress", at: 3 };
    expect(owesInterview(onboardingDoc())).toBe(true);
    expect(owesInterview(begun)).toBe(true);
    expect(owesInterview({ ...begun, state: "done" })).toBe(false);
    expect(owesInterview({ ...begun, state: "notNow", onboarding: false })).toBe(false);
    expect(owesInterview(freshDoc())).toBe(false);
    expect(owesInterview(null)).toBe(false);
  });
});

describe("the questions' entry (owner, 10/18)", () => {
  it("the menu offers them only while there are no answers", () => {
    expect(menuOffersInterview(null)).toBe(true);
    expect(menuOffersInterview(freshDoc())).toBe(true);
    expect(menuOffersInterview({ ...freshDoc(), at: 3, answers: { climate: "cool" } })).toBe(false);
    expect(menuOffersInterview({ ...freshDoc(), state: "done", answers: { er: "30" } })).toBe(false);
  });

  it("the priorities page: Answer a few questions, Finish your questions, or Answer the questions again", () => {
    expect(interviewLabel(null)).toBe("Answer a few questions (about 4 min)");
    expect(interviewLabel(freshDoc())).toBe("Answer a few questions (about 4 min)");
    expect(interviewLabel({ ...freshDoc(), at: 5 })).toBe("Finish your questions (6 of 14)");
    expect(interviewLabel({ ...freshDoc(), state: "notNow", at: 13 })).toBe(
      "Finish your questions (14 of 14)",
    );
    expect(interviewLabel({ ...freshDoc(), state: "done", at: RESULT_AT, answers: { er: "30" } })).toBe(
      "Answer the questions again",
    );
  });
});
