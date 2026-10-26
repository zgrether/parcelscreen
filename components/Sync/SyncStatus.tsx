"use client";
/**
 * What a joined device shows of its sync (step 5, plan §5, §9), and only when it matters:
 *   - **the indicator**, small and quiet: "Synced", or "Not saved" in the warning colour as a button that tries again;
 *     or, for notes and lines changed offline (step 14e), "Saved on this device — syncs when you're back online".
 *     On a desktop it's at the top bar's right, beside ☰; on a phone, in More's sheet under the profile, with a dot on
 *     More while something isn't saved. Nothing at all on an unjoined device.
 *   - **the toast** when a save fails: "Not saved — Try again"; or, when the app opens with changes a closed page
 *     didn't save, "A change on this device wasn't saved." with Try again and Discard.
 */
import { useState, useSyncExternalStore } from "react";
import { discardUnsaved, subscribeSync, syncView, trySaveAgain } from "@/lib/sync/engine";
import {
  DISCARD,
  DISCARD_QUESTION,
  HELD,
  KEPT_HERE,
  NOT_SAVED,
  SYNCED,
  TRY_AGAIN,
  unsavedAtOpen,
} from "@/lib/sync/words";

const useSync = () => useSyncExternalStore(subscribeSync, syncView, syncView);

export function SyncIndicator({ where }: { where: "bar" | "menu" }) {
  const { status } = useSync();
  if (status === "off") return null;
  if (status === "held") return <span className={`sync-ind held ${where}`}>{HELD}</span>;
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
  const { status, atOpen, names } = useSync();
  const [busy, setBusy] = useState(false);
  // Discard asks once: it replaces this device's change with the other devices' copy.
  const [discarding, setDiscarding] = useState(false);
  if (status !== "failed") return null;
  const run = (f: () => Promise<void>) => {
    setBusy(true);
    void f().finally(() => setBusy(false));
  };
  return (
    <div className="sync-toast" role="status">
      {discarding ? (
        <>
          <span>{DISCARD_QUESTION}</span>
          <button disabled={busy} onClick={() => run(discardUnsaved)}>
            {DISCARD}
          </button>
          <button className="quiet" disabled={busy} onClick={() => setDiscarding(false)}>
            Keep it
          </button>
        </>
      ) : (
        <>
          <span>
            {atOpen ? unsavedAtOpen(names ?? []) : `${NOT_SAVED}.`} {KEPT_HERE}
          </span>
          <button disabled={busy} onClick={() => run(trySaveAgain)}>
            {TRY_AGAIN}
          </button>
          {atOpen && (
            <button className="quiet" disabled={busy} onClick={() => setDiscarding(true)}>
              {DISCARD}
            </button>
          )}
        </>
      )}
    </div>
  );
}
