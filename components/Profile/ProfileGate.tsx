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
import { startHousehold } from "@/lib/client/household";
import { addDrivewayOnce } from "@/lib/client/drivewayAdd";

export function ProfileGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    let alive = true;
    // The household's members load before the first render (step 6): the list and the card grade with their rubrics.
    // Step 7 (owner, #216): first, the Driveway row is added once to this profile's saved priorities.
    const settle = () => {
      try {
        addDrivewayOnce();
      } catch {
        /* a profile's documents unreadable: nothing added, the rest boots */
      }
      return void startHousehold()
        .catch(() => undefined)
        .then(() => {
          if (!alive) return;
          setReady(true);
          void initSync();
        });
    };
    bootProfiles().then(settle, settle);
    return () => {
      alive = false;
    };
  }, []);
  const away =
    ready && pathname !== "/interview" && pathname !== "/link" && pathname !== "/who" && owesInterview();
  useEffect(() => {
    if (away) router.replace("/interview");
  }, [away, router]);
  if (!ready || away) return null;
  return <>{children}</>;
}
