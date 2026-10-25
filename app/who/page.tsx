"use client";
/**
 * Who's this? (step 6, docs/plans/step-6-household.md §2): where a device lands after joining a synced space. Each
 * member of the household is a button; picking one makes it this device's current profile (it stays per device, so a
 * phone opens as its person). "I'm new here" makes a new profile in the space and starts its questions, which ask the
 * name first.
 */
import { useEffect, useState } from "react";
import { JOIN_AS_NEW } from "@/lib/sync/words";
import { addProfile, listProfiles, switchProfile } from "@/lib/client/profiles";
import type { Profile } from "@/lib/client/profileStore";

const WHO_TITLE = "Who's this?";
const WHO_LINE =
  "Pick yourself, so this device opens as you: one profile per person, the same on every device. Your list is shared; your priorities are your own.";
const NEW_HERE = "I'm new here";
/** A new member's name until the questions' first screen asks for it. */
const NEW_NAME = "New member";

export default function WhoPage() {
  const [people, setPeople] = useState<Profile[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void listProfiles().then((ps) =>
      setPeople([...ps].sort((a, b) => a.createdAt.localeCompare(b.createdAt))),
    );
  }, []);

  const pick = (id: string) => {
    setBusy(true);
    void switchProfile(id, "/library");
  };
  const fresh = async () => {
    setBusy(true);
    const p = await addProfile(NEW_NAME);
    await switchProfile(p.id, "/interview");
  };
  // Joined from an invite (UX part 2 PR 5b): a new member, straight to their name.
  useEffect(() => {
    let invited = false;
    try {
      invited = sessionStorage.getItem(JOIN_AS_NEW) === "1";
      sessionStorage.removeItem(JOIN_AS_NEW);
      sessionStorage.removeItem("ps.inviteCode");
    } catch {
      /* no session storage: Who's this? as usual */
    }
    // The same as I'm new here, without the button: nothing else on the page is waiting for it.
    if (invited) void addProfile(NEW_NAME).then((p) => switchProfile(p.id, "/interview"));
  }, []);

  return (
    <main className="compare who-page">
      <header className="compare-head">
        <h1>{WHO_TITLE}</h1>
      </header>
      <p className="sync-line">{WHO_LINE}</p>
      {people === null ? (
        <p className="tiny muted" role="status">
          Loading…
        </p>
      ) : (
        <ul className="who-list">
          {people.map((p) => (
            <li key={p.id}>
              <button className="btn secondary who-person" disabled={busy} onClick={() => pick(p.id)}>
                {p.name}
              </button>
            </li>
          ))}
          <li>
            {/* Polish (step 6's review): secondary, so the people already here come first, not a new profile. */}
            <button className="btn secondary who-person who-new" disabled={busy} onClick={() => void fresh()}>
              {NEW_HERE}
            </button>
          </li>
        </ul>
      )}
    </main>
  );
}
