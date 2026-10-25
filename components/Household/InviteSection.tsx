"use client";
/**
 * Invite someone (UX part 2 PR 5b; the audit's P-8), in Household: a one-use link for a person. On a device not synced
 * yet, sync starts first (the household's list has to be on the server for them to join it). The link holds a fresh
 * token, never the code (lib/sync/invite.ts).
 */
import { useState } from "react";
import { createInvite } from "@/lib/sync/client";
import { inviteKeyOf, inviteLink, newInviteToken, sealCode } from "@/lib/sync/invite";
import { initSync } from "@/lib/sync/engine";
import { startSyncing } from "@/lib/sync/space";
import { readSyncState } from "@/lib/sync/state";
import { INVITE_WORDS as W } from "@/lib/sync/words";

type State =
  { kind: "idle" } | { kind: "busy"; line: string } | { kind: "link"; link: string } | { kind: "failed" };

export function InviteSection() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [copied, setCopied] = useState(false);
  const make = async () => {
    try {
      let code = readSyncState()?.code ?? null;
      if (!code) {
        setState({ kind: "busy", line: W.startingFirst });
        code = await startSyncing(() => undefined);
        await initSync(); // this device is joined now: its changes save, and the household's arrive, from here on
      }
      setState({ kind: "busy", line: W.making });
      const token = newInviteToken();
      await createInvite(code, await inviteKeyOf(token), await sealCode(code, token));
      setState({ kind: "link", link: inviteLink(location.origin, token) });
    } catch {
      setState({ kind: "failed" });
    }
  };
  return (
    <section className="invite" aria-label={W.title}>
      <h3>{W.title}</h3>
      <p className="tiny muted">{W.line}</p>
      {state.kind === "link" ? (
        <>
          <label className="settings-field">
            {W.linkLabel}
            <input readOnly value={state.link} onFocus={(e) => e.target.select()} />
          </label>
          <div className="settings-buttons invite-buttons">
            <button
              className="btn"
              onClick={() =>
                void navigator.clipboard.writeText(state.link).then(
                  () => setCopied(true),
                  () => undefined,
                )
              }
            >
              {copied ? W.copied : W.copy}
            </button>
            {typeof navigator !== "undefined" && "share" in navigator && (
              <button
                className="btn secondary"
                onClick={() =>
                  void navigator.share({ title: W.title, url: state.link }).catch(() => undefined)
                }
              >
                {W.share}
              </button>
            )}
          </div>
          <p className="tiny muted">{W.sendOnly}</p>
        </>
      ) : state.kind === "busy" ? (
        <p className="tiny muted" role="status">
          {state.line}
        </p>
      ) : (
        <>
          {state.kind === "failed" && (
            <p className="tiny" role="alert">
              {W.failed}
            </p>
          )}
          <button className="btn secondary" onClick={() => void make()}>
            {W.make}
          </button>
        </>
      )}
    </section>
  );
}
