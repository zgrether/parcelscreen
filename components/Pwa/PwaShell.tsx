"use client";
/**
 * The installable app's runtime (step 17c; plan phase-0-17c-pwa.md):
 * - registers the service worker (production builds only);
 * - shows "Updated — reload" when a new version is waiting, never mid-screen: not while a screen runs, nor
 *   with the ground viewer or Settings open. Tapping it activates the new version and reloads; otherwise the
 *   new version takes over at the next launch;
 * - shows the offline state while the browser is offline, and says so when the basemap is Esri's, whose tiles aren't
 *   kept (step 14e), and when the open parcel is saved on this device (polish 2);
 * - asks for persistent storage once the app is installed (step 14e, plan §3.4).
 */
import { useEffect, useRef, useState } from "react";
import { useOnline } from "@/lib/client/useOnline";
import { OFFLINE_TEXT, shouldRegister, showUpdateToast, UPDATE_TEXT } from "@/lib/client/pwa";
import { isInstalled, requestPersist } from "@/lib/client/storage";
import { BASEMAPS_NOT_KEPT } from "@/components/Map/offlineLayers";
import { useMapLayerPrefs } from "@/components/Map/useMapLayerPrefs";
import { OFFLINE_WORDS } from "@/lib/offline/words";
import { useSavedParcels } from "@/components/Offline/SaveOffline";

/** The ground viewer or a modal dialog (Settings, help) over the map. */
const overlayOpen = () => !!document.querySelector(".ground-layer, dialog[open]");

export function PwaShell({ running, open }: { running: boolean; open: string | null }) {
  const online = useOnline();
  const saved = useSavedParcels();
  const openSaved = open !== null && saved.some((p) => p.parcel === open);
  const { base } = useMapLayerPrefs();
  const reg = useRef<ServiceWorkerRegistration | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [overlay, setOverlay] = useState(false);

  useEffect(() => {
    if (!shouldRegister(process.env.NODE_ENV, "serviceWorker" in navigator)) return;
    let gone = false;
    navigator.serviceWorker.register("/serwist/sw.js", { scope: "/" }).then(
      (r: ServiceWorkerRegistration | undefined) => {
        // No registration: Playwright's serviceWorkers: "block" resolves with nothing (the e2e).
        if (gone || !r) return;
        reg.current = r;
        // A waiting worker is an update only when an older one controls this page.
        const check = () => setWaiting(!!r.waiting && !!navigator.serviceWorker.controller);
        check();
        r.addEventListener("updatefound", () => r.installing?.addEventListener("statechange", check));
      },
      () => {
        /* registration refused (private mode, blocked): the app runs without it */
      },
    );
    return () => {
      gone = true;
    };
  }, []);

  // Installed: the device's offline data is the point, so ask the browser to keep it (Chrome grants it silently).
  useEffect(() => {
    if (isInstalled()) void requestPersist();
  }, []);

  // While a version waits, watch for the viewer or a dialog opening over the map.
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => setOverlay(overlayOpen()), 1000);
    return () => clearInterval(t);
  }, [waiting]);

  const reload = () => {
    const w = reg.current?.waiting;
    if (!w) return window.location.reload();
    navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), {
      once: true,
    });
    w.postMessage({ type: "SKIP_WAITING" });
  };

  return (
    <>
      {!online && (
        <div className="pwa-offline" role="status">
          {OFFLINE_TEXT}
          {openSaved && <span className="pwa-offline-line">{OFFLINE_WORDS.thisSaved}</span>}
          {BASEMAPS_NOT_KEPT.has(base) && (
            <span className="pwa-offline-esri">{OFFLINE_WORDS.esriOffline}</span>
          )}
        </div>
      )}
      {showUpdateToast({ waiting, running, overlayOpen: overlay }) && (
        <button className="pwa-update" onClick={reload}>
          {UPDATE_TEXT}
        </button>
      )}
    </>
  );
}
