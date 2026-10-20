"use client";
/**
 * The join question (step 5, plan §2), for a code from the QR's link (/link) or one pasted on the Sync screen. It checks
 * the code first: one no space has says so and changes nothing. A device with no data of its own just asks; one with
 * data says plainly that joining replaces it, and offers Export first. Nothing is merged.
 */
import { useEffect, useState } from "react";
import { useSettings } from "@/components/Settings/SettingsDialog";
import { downloadExport } from "@/components/Settings/YourData";
import { holdsData, joinSpace, localData, peekSpace, type LocalData } from "@/lib/sync/space";
import type { Changes } from "@/lib/sync/wire";
import { GETTING, JOIN_EMPTY, joinReplaces, WRONG_CODE } from "@/lib/sync/words";

type Phase =
  | { kind: "checking" }
  | { kind: "wrong" }
  | { kind: "offline" }
  | { kind: "ask"; space: Changes; local: LocalData }
  | { kind: "joining" }
  | { kind: "failed" };

export function JoinConfirm({
  code,
  onCancel,
  backLabel = "Back",
}: {
  code: string;
  onCancel(): void;
  /** Where Back goes, said plainly: "Back" in the Sync screen (to the code field), "Go to Your list" on /link. */
  backLabel?: string;
}) {
  const settings = useSettings();
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });

  useEffect(() => {
    let alive = true;
    void Promise.all([peekSpace(code), localData()])
      .then(([space, local]) => alive && setPhase(space ? { kind: "ask", space, local } : { kind: "wrong" }))
      .catch(() => alive && setPhase({ kind: "offline" }));
    return () => {
      alive = false;
    };
  }, [code]);

  const join = async (space: Changes) => {
    setPhase({ kind: "joining" });
    try {
      await joinSpace(code, space);
    } catch {
      setPhase({ kind: "failed" });
    }
  };

  switch (phase.kind) {
    case "checking":
      return (
        <p className="sync-line" role="status">
          Checking the code…
        </p>
      );
    case "wrong":
      return (
        <div className="sync-block">
          <p className="sync-line bad" role="alert">
            {WRONG_CODE}
          </p>
          <div className="sync-buttons">
            <button className="btn secondary" onClick={onCancel}>
              {backLabel}
            </button>
          </div>
        </div>
      );
    case "offline":
    case "failed":
      return (
        <div className="sync-block">
          <p className="sync-line bad" role="alert">
            {phase.kind === "offline"
              ? "Couldn't reach the synced space. Check the connection and try again."
              : "Joining didn't finish. Nothing on the synced space changed; try again."}
          </p>
          <div className="sync-buttons">
            <button className="btn secondary" onClick={onCancel}>
              {backLabel}
            </button>
          </div>
        </div>
      );
    case "joining":
      return (
        <p className="sync-line" role="status">
          {GETTING}
        </p>
      );
    case "ask": {
      const { space, local } = phase;
      const replaces = holdsData(local);
      return (
        <div className="sync-block">
          <p className="sync-line">{replaces ? joinReplaces(local.profiles, local.parcels) : JOIN_EMPTY}</p>
          <div className="sync-buttons">
            {replaces && (
              <button className="btn secondary" onClick={() => void downloadExport(settings.config)}>
                Export first
              </button>
            )}
            <button className={`btn${replaces ? " danger" : ""}`} onClick={() => void join(space)}>
              {replaces ? "Replace and join" : "Join"}
            </button>
            <button className="btn secondary" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      );
    }
  }
}
