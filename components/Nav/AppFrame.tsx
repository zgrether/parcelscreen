"use client";
/**
 * The app's frame (step 4b, docs/plans/step-4b-navigation.md §2–§3): the three places as tabs on every page but the
 * opening redirect and the interview, a bottom tab bar on a phone and a slim top bar on a desktop, with the page between.
 *
 * The map stays mounted behind the other tabs (owner, 10/18): it's mounted the first time the Map tab opens, then only
 * hidden, so coming back is instant and the parcels screened this session keep their overlays. While hidden it pauses
 * (components/Map/pauseMap.ts) and its keyboard shortcuts stand down (lib/client/mapShowing.ts).
 *
 * Settings and the help dialog are here, not in the map, so the menu opens them from any page.
 */
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { ExploreClient } from "@/components/Explore/ExploreClient";
import { HelpProvider } from "@/components/Help/HelpDialog";
import { SettingsProvider } from "@/components/Settings/SettingsDialog";
import { setMapShowing } from "@/lib/client/mapShowing";
import { syncOnNavigate } from "@/lib/sync/engine";
import { placeOf, showsNav } from "@/lib/client/places";
import { loadUserConfig, saveUserConfig } from "@/lib/client/userConfig";
import type { UserConfig } from "@/lib/screen/types";
import { Places } from "./Places";
import { SyncToast } from "@/components/Sync/SyncStatus";

export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const onMap = placeOf(pathname) === "map";
  // Mounted on the first visit to the map, and kept from then on.
  const [mapMounted, setMapMounted] = useState(onMap);
  if (onMap && !mapMounted) setMapMounted(true);
  useLayoutEffect(() => setMapShowing(onMap), [onMap]);
  // A tab switch fetches the synced space's changes (step 5), as opening the app and coming back to it do.
  useEffect(() => syncOnNavigate(), [pathname]);

  // Live (16a): a Settings save is used by the next run, and the open results get "used earlier settings".
  const [config, setConfig] = useState(loadUserConfig);
  const saveConfig = useCallback((c: UserConfig) => {
    saveUserConfig(c);
    setConfig(c);
  }, []);

  return (
    <SettingsProvider config={config} onSave={saveConfig}>
      <HelpProvider>
        <div className="app-frame">
          {showsNav(pathname) && <Places pathname={pathname} />}
          <div className="app-main">
            {mapMounted && (
              <div className="app-map" hidden={!onMap}>
                <ExploreClient />
              </div>
            )}
            {children}
          </div>
          <SyncToast />
        </div>
      </HelpProvider>
    </SettingsProvider>
  );
}
