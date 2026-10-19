"use client";
/**
 * What a joined device shows of its sync (step 5, plan §5, §9), and only when it matters:
 *   - **the indicator**, small and quiet: "Synced", or "Not saved" in the warning colour as a button that tries again.
 *     On a desktop it's at the top bar's right, beside ☰; on a phone, in More's sheet under the profile, with a dot on
 *     More while something isn't saved. Nothing at all on an unjoined device.
 *   - **the toast** when a save fails: "Not saved — Try again"; or, when the app opens with changes a closed page
 *     didn't save, "A change on this device wasn't saved." with Try again and Discard.
 */
import { useState, useSyncExternalStore } from "react";
import { discardUnsaved, subscribeSync, syncView, trySaveAgain } from "@/lib/sync/engine";
import { DISCARD, NOT_SAVED, SYNCED, TRY_AGAIN, UNSAVED_AT_OPEN } from "@/lib/sync/words";

const useSync = () => useSyncExternalStore(subscribeSync, syncView, syncView);

export function SyncIndicator({ where }: { where: "bar" | "menu" }) {
  const { status } = useSync();
  if (status === "off") return null;
  return status === "failed" ? (
    <button className={`sync-ind bad ${where}`} onClick={() => void trySaveAgain()} title="Try saving again">
      {NOT_SAVED}
    </button>
  ) : (
    <span className={`sync-ind ${where}`}>{SYNCED}</span>
  );
}

/** Whether something isn't saved: More's dot on a phone. */
export const useUnsaved = (): boolean => useSync().status === "failed";

export function SyncToast() {
  const { status, atOpen } = useSync();
  const [busy, setBusy] = useState(false);
  if (status !== "failed") return null;
  const run = (f: () => Promise<void>) => {
    setBusy(true);
    void f().finally(() => setBusy(false));
  };
  return (
    <div className="sync-toast" role="status">
      <span>{atOpen ? UNSAVED_AT_OPEN : `${NOT_SAVED} —`}</span>
      <button disabled={busy} onClick={() => run(trySaveAgain)}>
        {TRY_AGAIN}
      </button>
      {atOpen && (
        <button className="quiet" disabled={busy} onClick={() => run(discardUnsaved)}>
          {DISCARD}
        </button>
      )}
    </div>
  );
}
