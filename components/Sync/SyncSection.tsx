"use client";
/**
 * Settings → Your data → Sync across devices (step 5, docs/plans/step-5-sync.md §1–§3, §9): a row in Your data, and the
 * Sync screen it opens, a dialog over Settings.
 *   - Unjoined: Start syncing this device (the upload, then the code), or Join with a code.
 *   - Showing the code: the QR (its link opens /link#<code>), the code in groups of five with Copy, and the line that
 *     it works like a password.
 *   - Joined: "This device is synced.", the indicator's state, Show code, and Leave sync on this device.
 */
import { useRef, useState, useSyncExternalStore } from "react";
import { groupCode, normalizeCode } from "@/lib/sync/code";
import { initSync, subscribeSync, syncView } from "@/lib/sync/engine";
import { leaveSync, startSyncing, type Progress } from "@/lib/sync/space";
import { isServerConfig } from "@/lib/sync/client";
import { readSyncState } from "@/lib/sync/state";
import {
  SERVER_SETUP,
  JOIN_WITH_CODE,
  JOINED,
  LEAVE,
  LEAVE_QUESTION,
  NOT_SAVED,
  NOT_SAVED_LINE,
  PASSWORD_LEAD,
  PASSWORD_LINE,
  SCAN_LINE,
  START_LINE,
  SHOW_CODE,
  START,
  SYNC_LINE,
  SYNC_TITLE,
  uploading,
  WRONG_CODE,
} from "@/lib/sync/words";
import { JoinConfirm } from "./JoinConfirm";
import { QrCode } from "./QrCode";

type View =
  | { kind: "home" }
  | { kind: "starting"; progress: Progress | null; error?: string }
  | { kind: "code"; code: string }
  | { kind: "join"; error: boolean }
  | { kind: "confirm"; code: string }
  | { kind: "leave" };

/** The row in Settings' Your data. */
export function SyncSection() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<View>({ kind: "home" });
  const joined = readSyncState() !== null;
  const open = () => {
    setView({ kind: "home" });
    dialog.current?.showModal();
  };
  const close = () => dialog.current?.close();
  return (
    <>
      <div className="your-data-row">
        <button className="btn secondary" onClick={open}>
          {SYNC_TITLE}
        </button>
        <span className="tiny muted">{joined ? JOINED : SYNC_LINE}</span>
      </div>
      <dialog
        ref={dialog}
        className="help-dialog sync-dialog"
        aria-labelledby="sync-title"
        onClick={(e) => e.target === e.currentTarget && view.kind !== "starting" && close()}
        onCancel={(e) => view.kind === "starting" && e.preventDefault()}
      >
        <header className="help-head">
          <h2 id="sync-title">{SYNC_TITLE}</h2>
          {view.kind !== "starting" && (
            <button className="btn secondary small" onClick={close}>
              Close
            </button>
          )}
        </header>
        <div className="help-body sync-body">
          <SyncView view={view} setView={setView} joined={joined} />
        </div>
      </dialog>
    </>
  );
}

function SyncView({ view, setView, joined }: { view: View; setView(v: View): void; joined: boolean }) {
  const status = useSyncExternalStore(subscribeSync, syncView, syncView);
  const [typed, setTyped] = useState("");

  const start = async () => {
    setView({ kind: "starting", progress: null });
    try {
      const code = await startSyncing((progress) => setView({ kind: "starting", progress }));
      setView({ kind: "code", code });
      await initSync(); // this device is joined now: its changes save from here on
    } catch (e) {
      const msg = isServerConfig(e)
        ? SERVER_SETUP
        : e instanceof Error && !/HTTP|fetch|abort|timeout/i.test(e.message)
          ? e.message
          : null;
      setView({
        kind: "starting",
        progress: null,
        error:
          msg ??
          "Couldn't reach the synced space, so nothing was synced. Check the connection and try again.",
      });
    }
  };

  switch (view.kind) {
    case "home":
      return joined ? (
        <div className="sync-block">
          <p className="sync-line">{JOINED}</p>
          {status.status === "failed" && (
            <p className="sync-line bad">
              {NOT_SAVED}: {NOT_SAVED_LINE}
            </p>
          )}
          <div className="sync-buttons">
            <button
              className="btn secondary"
              onClick={() => setView({ kind: "code", code: readSyncState()!.code })}
            >
              {SHOW_CODE}
            </button>
            <button className="btn secondary" onClick={() => setView({ kind: "leave" })}>
              {LEAVE}
            </button>
          </div>
        </div>
      ) : (
        <div className="sync-block">
          <p className="sync-line">{SYNC_LINE}</p>
          <p className="tiny muted">{START_LINE}</p>
          <div className="sync-buttons">
            <button className="btn" onClick={() => void start()}>
              {START}
            </button>
            <button className="btn secondary" onClick={() => setView({ kind: "join", error: false })}>
              {JOIN_WITH_CODE}
            </button>
          </div>
        </div>
      );
    case "starting":
      return view.error ? (
        <div className="sync-block">
          <p className="sync-line bad" role="alert">
            {view.error}
          </p>
          <div className="sync-buttons">
            <button className="btn" onClick={() => void start()}>
              Try again
            </button>
            <button className="btn secondary" onClick={() => setView({ kind: "home" })}>
              Back
            </button>
          </div>
        </div>
      ) : (
        <p className="sync-line" role="status">
          {view.progress
            ? uploading(view.progress.stage, view.progress.done, view.progress.total)
            : "Making your synced space…"}
        </p>
      );
    case "code":
      return <CodeView code={view.code} done={() => setView({ kind: "home" })} />;
    case "join": {
      const code = normalizeCode(typed);
      return (
        <form
          className="sync-block"
          onSubmit={(e) => {
            e.preventDefault();
            if (code) setView({ kind: "confirm", code });
            else setView({ kind: "join", error: true });
          }}
        >
          <label className="sync-field">
            The code from your other device
            <input
              className="sync-code-input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder={groupCode(PLACEHOLDER)}
              aria-invalid={view.error || undefined}
            />
          </label>
          {view.error && (
            <p className="sync-line bad" role="alert">
              {WRONG_CODE}
            </p>
          )}
          <div className="sync-buttons">
            <button className="btn" type="submit">
              Join
            </button>
            <button className="btn secondary" type="button" onClick={() => setView({ kind: "home" })}>
              Back
            </button>
          </div>
        </form>
      );
    }
    case "confirm":
      return <JoinConfirm code={view.code} onCancel={() => setView({ kind: "join", error: false })} />;
    case "leave":
      return (
        <div className="sync-block">
          <p className="sync-line">{LEAVE_QUESTION}</p>
          <div className="sync-buttons">
            <button className="btn" onClick={() => void leaveSync()}>
              Stop syncing
            </button>
            <button className="btn secondary" onClick={() => setView({ kind: "home" })}>
              Cancel
            </button>
          </div>
        </div>
      );
  }
}

/** A shape for the placeholder, not a code anyone has. */
const PLACEHOLDER = "XXXXXXXXXXXXXXXXXXXXXXXXXX";

/** The code: the warning first, then the QR and the code in groups, with Copy. */
export function CodeView({ code, done }: { code: string; done(): void }) {
  const [copied, setCopied] = useState(false);
  const link = `${location.origin}/link#${code}`;
  return (
    <div className="sync-block">
      <p className="sync-warn" role="note">
        <b>{PASSWORD_LEAD}</b> {PASSWORD_LINE}
      </p>
      <div className="sync-code">
        <QrCode text={link} label="QR code that opens the link to join this synced space" />
        <div className="sync-code-text">
          <code className="sync-code-value" aria-label="The code">
            {/* Breaks only between groups, never inside one. */}
            {groupCode(code)
              .split("-")
              .map((g, i, all) => (
                <span key={i} className="sync-code-group">
                  {g}
                  {i < all.length - 1 ? "-" : ""}
                  <wbr />
                </span>
              ))}
          </code>
          <button
            className="btn secondary"
            onClick={() =>
              void navigator.clipboard?.writeText(groupCode(code)).then(
                () => setCopied(true),
                () => setCopied(false),
              )
            }
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <p className="tiny muted">{SCAN_LINE}</p>
        </div>
      </div>
      <div className="sync-buttons">
        <button className="btn" onClick={done}>
          Done
        </button>
      </div>
    </div>
  );
}
