"use client";
/**
 * Boots the current profile before the app renders (roadmap step 1; docs/plans/step-1-profiles-grading.md §3.4): the
 * profile is chosen or created, the browser's pre-profile data moves into it on the first boot, and its documents are
 * loaded, so every page reads the profile's parcels, settings and views synchronously, as it read localStorage. Until
 * then nothing renders. A boot that fails still renders: the prefs then read as defaults.
 *
 * A new profile starts with the interview (step 4, owner Q9): until it's finished or put off with "Not now", any other
 * page sends it to /interview (lib/client/onboarding.ts), except /link, which joins a synced space (step 5) whose
 * profiles replace this one.
 *
 * On a device joined to a synced space (step 5), the sync starts once the profile has booted: the page shows the
 * device's copy at once, and the space's changes follow.
 */
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { owesInterview } from "@/lib/client/onboarding";
import { bootProfiles } from "@/lib/client/profiles";
import { initSync } from "@/lib/sync/engine";
import { readSyncState } from "@/lib/sync/state";
import { RUBRICS_CHANGED } from "@/lib/client/profileEvents";
import { startHousehold } from "@/lib/client/household";
import { addDrivewayOnce } from "@/lib/client/drivewayAdd";
import { addFactorsOnce } from "@/lib/client/factorsAdd";
import { sortIntoHistory } from "@/lib/client/favoritesStore";

export function ProfileGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    let alive = true;
    // Step 7 (owner, #216): the Driveway row added once to this profile's saved priorities; step 11 (plan §1): then its
    // new factors, once. True when either wrote.
    const addOnce = (): boolean => {
      try {
        const driveway = addDrivewayOnce();
        return addFactorsOnce() || driveway;
      } catch {
        return false; // a profile's documents unreadable: nothing added, the rest boots
      }
    };
    // On a synced device they wait for the space's copy, with the sync listening (the UX audit's B-1): added before
    // it, they changed this device's copy only, which the sync then took as agreed and never sent, so one profile
    // graded differently on each device. Off sync they come first, so the first render grades with them.
    const synced = readSyncState() !== null;
    // The household's members load before the first render (step 6): the list and the card grade with their rubrics.
    const settle = () => {
      if (!synced) addOnce();
      // Step 8 (plan §6): In progress parcels with no adder go to this profile's History (idempotent).
      try {
        sortIntoHistory();
      } catch {
        /* the shared store unreadable: nothing sorted, the rest boots */
      }
      return void startHousehold()
        .catch(() => undefined)
        .then(() => {
          if (!alive) return;
          setReady(true);
          void initSync().then(() => {
            // The space's changes are in (or the fetch failed, and the device's copy stands): added now, the
            // additions are saved to the space like any edit, and the pages re-read the priorities.
            if (alive && synced && addOnce()) dispatchEvent(new Event(RUBRICS_CHANGED));
          });
        });
    };
    bootProfiles().then(settle, settle);
    return () => {
      alive = false;
    };
  }, []);
  const away =
    ready &&
    pathname !== "/interview" &&
    pathname !== "/link" &&
    pathname !== "/join" &&
    pathname !== "/who" &&
    owesInterview();
  useEffect(() => {
    if (away) router.replace("/interview");
  }, [away, router]);
  if (!ready || away) return null;
  return <>{children}</>;
}
