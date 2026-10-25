"use client";
/**
 * /join#<token> (UX part 2 PR 5b; the audit's P-8): where an invite link leads. The token is in the fragment, which the
 * browser never sends; the page takes it out of the address bar, uses the invite (once: the server marks it), opens
 * the space's code from what the server kept, and asks the join question. Joining makes this device's person a new
 * member: they type their name next, with their own priorities.
 */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { JoinConfirm } from "@/components/Sync/JoinConfirm";
import { redeemInvite } from "@/lib/sync/client";
import { inviteKeyOf, unsealCode } from "@/lib/sync/invite";
import { JOIN_AS_NEW, INVITE_WORDS } from "@/lib/sync/words";

/** The token from the fragment, read once per page load (the address bar is cleared of it straight away). */
let taken: string | null | undefined;
function takeToken(): string | null {
  if (taken !== undefined) return taken;
  if (typeof location === "undefined") return null;
  const t = location.hash.slice(1).trim();
  taken = /^[0-9A-Z]{26}$/.test(t) ? t : null;
  history.replaceState(null, "", "/join");
  return taken;
}

/** An invite used on this tab and not joined yet: its code, so a reload here still works (the invite is spent). */
const KEPT = "ps.inviteCode";

type State = { kind: "opening" } | { kind: "code"; code: string } | { kind: "spent" } | { kind: "offline" };

export default function JoinPage() {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "opening" });
  useEffect(() => {
    let alive = true;
    const kept = sessionStorage.getItem(KEPT);
    const token = takeToken();
    void (async () => {
      if (!token) return kept ? { kind: "code", code: kept } : { kind: "spent" };
      const sealed = await redeemInvite(await inviteKeyOf(token));
      const code = sealed ? await unsealCode(sealed, token) : null;
      if (!code) return kept ? { kind: "code", code: kept } : { kind: "spent" };
      sessionStorage.setItem(KEPT, code);
      return { kind: "code", code };
    })()
      .then((s) => alive && setState(s as State))
      .catch(() => alive && setState({ kind: "offline" }));
    return () => {
      alive = false;
    };
  }, []);
  return (
    <main className="compare link-page">
      <header className="compare-head">
        <h1>{INVITE_WORDS.joinTitle}</h1>
      </header>
      {state.kind === "opening" ? (
        <p className="sync-line" role="status">
          {INVITE_WORDS.opening}
        </p>
      ) : state.kind === "spent" ? (
        <p className="sync-line">{INVITE_WORDS.spent}</p>
      ) : state.kind === "offline" ? (
        <p className="sync-line">{INVITE_WORDS.offline}</p>
      ) : (
        <div
          // Joining from an invite makes a new member: Who's this? opens their name at once.
          onClickCapture={() => sessionStorage.setItem(JOIN_AS_NEW, "1")}
        >
          <JoinConfirm
            code={state.code}
            backLabel="Go to Your list"
            onCancel={() => router.replace("/library")}
          />
        </div>
      )}
    </main>
  );
}
