"use client";
/**
 * /link#<code> (step 5, plan §1–§2): where the Sync screen's QR leads. The code is in the fragment, which the browser
 * never sends, so it reaches no server log; the page reads it, takes it out of the address bar and the history entry,
 * and asks the join question.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { JoinConfirm } from "@/components/Sync/JoinConfirm";
import { normalizeCode } from "@/lib/sync/code";
import { readSyncState } from "@/lib/sync/state";
import { SYNC_TITLE } from "@/lib/sync/words";

/** The code from the fragment, read once per page load (kept here: the address bar is cleared of it straight away). */
let taken: string | null | undefined;
function takeCode(): string | null {
  if (taken !== undefined) return taken;
  if (typeof location === "undefined") return null;
  let fragment = location.hash.slice(1);
  try {
    fragment = decodeURIComponent(fragment);
  } catch {
    /* not percent-encoded: read as it is */
  }
  taken = normalizeCode(fragment);
  history.replaceState(null, "", "/link");
  return taken;
}

export default function LinkPage() {
  const router = useRouter();
  const [code] = useState(takeCode);
  const already = code !== null && readSyncState()?.code === code;
  return (
    <main className="compare link-page">
      <header className="compare-head">
        <h1>{SYNC_TITLE}</h1>
      </header>
      {!code ? (
        <p className="sync-line">
          This link has no code in it. On your other device, open Settings → Your data → Sync across devices →
          Show code, and scan it again.
        </p>
      ) : already ? (
        <p className="sync-line">This device is already synced with that code.</p>
      ) : (
        <JoinConfirm code={code} backLabel="Go to Your list" onCancel={() => router.replace("/library")} />
      )}
    </main>
  );
}
