"use client";
/**
 * The parcel's standing (WF2, docs/plans/parcel-workflow.md §4), under its name in the Info panel: for a favorite,
 * Archive, which asks why (the quick picks "Not for us", "Sold", "Rejected: …", or the household's words); Restore;
 * and the Walked and Offered milestones, each with its date. Archiving keeps everything; Remove is the only delete.
 * Step 8: the star (the panel's header, the list's rows) makes a favorite; In progress and Saved are gone.
 */
import { useRef, useState } from "react";
import { ARCHIVE_PICKS, reasonGiven, type Milestone, type WorkingParcel } from "@/lib/client/parcelStore";
import { localDay, MILESTONE_WORD, MILESTONES, statusLine } from "@/lib/client/parcelStatus";

/** What the controls change: the explorer's open parcel, or a parcel on the list (WF2b). */
export interface StandingActions {
  archive(reason: string): void;
  restore(): void;
  setMilestone(which: Milestone, date: string | null): void;
}

export function ParcelStanding({ parcel: open, act }: { parcel: WorkingParcel; act: StandingActions }) {
  const [asking, setAsking] = useState(false);
  return (
    <div className="ip-standing" role="group" aria-label="Status">
      {open.status === "archived" ? (
        <div className="ip-chips">
          <span className="ip-note">{statusLine(open)}</span>
          <button className="ip-btn sec" onClick={act.restore}>
            Restore
          </button>
        </div>
      ) : asking ? (
        <ArchiveReason
          archive={(reason) => {
            act.archive(reason);
            setAsking(false);
          }}
          cancel={() => setAsking(false)}
        />
      ) : (
        // Archived is a favorite's state (step 8, plan §2): a parcel only in someone's History has no Archive.
        open.status === "saved" && (
          <div className="ip-chips">
            <button className="ip-btn sec" onClick={() => setAsking(true)}>
              Archive…
            </button>
          </div>
        )
      )}
      <div className="ip-chips" role="group" aria-label="Milestones">
        {MILESTONES.map((m) => {
          const date = open.milestones[m];
          if (date === null)
            return (
              <button
                key={m}
                className="chip"
                aria-pressed={false}
                onClick={() => act.setMilestone(m, localDay(new Date()))}
              >
                + {MILESTONE_WORD[m]}
              </button>
            );
          return (
            <span key={m} className="ip-milestone">
              <label>
                {MILESTONE_WORD[m]}{" "}
                <input
                  type="date"
                  aria-label={`${MILESTONE_WORD[m]} on`}
                  value={date}
                  onChange={(e) => e.target.value && act.setMilestone(m, e.target.value)}
                />
              </label>
              <button
                className="ip-milestone-x"
                aria-label={`Clear ${MILESTONE_WORD[m]}`}
                onClick={() => act.setMilestone(m, null)}
              >
                ×
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** Why it's archived: a quick pick fills the box ("Rejected: " leaves it open for the rest); blank can't archive. */
function ArchiveReason({ archive, cancel }: { archive(reason: string): void; cancel(): void }) {
  const [reason, setReason] = useState("");
  const box = useRef<HTMLInputElement>(null);
  const ok = reasonGiven(reason);
  return (
    <div className="ip-archive">
      <div className="ip-chips" role="group" aria-label="Why">
        {ARCHIVE_PICKS.map((p) => (
          <button
            key={p}
            className="chip"
            aria-pressed={reason === p}
            onClick={() => {
              setReason(p);
              // "Rejected: " is only the start: the box takes the rest.
              if (p === "Rejected: ") box.current?.focus();
            }}
          >
            {p === "Rejected: " ? "Rejected: …" : p}
          </button>
        ))}
      </div>
      <input
        ref={box}
        aria-label="Why it's archived"
        placeholder="Why: sold, not for us, rejected because…"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && ok) archive(reason);
          if (e.key === "Escape") cancel();
        }}
      />
      <div className="ip-chips">
        <button className="ip-btn danger" disabled={!ok} onClick={() => archive(reason)}>
          Archive
        </button>
        <button className="ip-btn sec" onClick={cancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
