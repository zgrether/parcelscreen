"use client";
/**
 * Boots the current profile before the app renders (roadmap step 1; docs/plans/step-1-profiles-grading.md §3.4): the
 * profile is chosen or created, the browser's pre-profile data moves into it on the first boot, and its documents are
 * loaded, so every page reads the profile's parcels, settings and views synchronously, as it read localStorage. Until
 * then nothing renders. A boot that fails still renders: the prefs then read as defaults.
 *
 * A new profile starts with the interview (step 4, owner Q9): until it's finished or put off with "Not now", any other
 * page sends it to /interview (lib/client/onboarding.ts).
 */
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { owesInterview } from "@/lib/client/onboarding";
import { bootProfiles } from "@/lib/client/profiles";

export function ProfileGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    let alive = true;
    const settle = () => alive && setReady(true);
    bootProfiles().then(settle, settle);
    return () => {
      alive = false;
    };
  }, []);
  const away = ready && pathname !== "/interview" && owesInterview();
  useEffect(() => {
    if (away) router.replace("/interview");
  }, [away, router]);
  if (!ready || away) return null;
  return <>{children}</>;
}
