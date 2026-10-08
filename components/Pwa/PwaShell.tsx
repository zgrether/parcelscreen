"use client";
/**
 * The installable app's runtime (step 17c; plan phase-0-17c-pwa.md):
 * - registers the service worker (production builds only);
 * - shows "Updated — reload" when a new version is waiting, never mid-screen: not while a screen runs, nor
 *   with the ground viewer or Settings open. Tapping it activates the new version and reloads; otherwise the
 *   new version takes over at the next launch;
 * - shows the offline state while the browser is offline.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { OFFLINE_TEXT, shouldRegister, showUpdateToast, UPDATE_TEXT } from "@/lib/client/pwa";

const subscribeOnline = (changed: () => void) => {
  window.addEventListener("online", changed);
  window.addEventListener("offline", changed);
  return () => {
    window.removeEventListener("online", changed);
    window.removeEventListener("offline", changed);
  };
};

/** The ground viewer or a modal dialog (Settings, help) over the map. */
const overlayOpen = () => !!document.querySelector(".ground-layer, dialog[open]");

export function PwaShell({ running }: { running: boolean }) {
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
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
