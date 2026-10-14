"use client";
/**
 * The parcel's standing (WF2, docs/plans/parcel-workflow.md §4), under its name in the Info panel: In progress or
 * Saved; Archive, which asks why (the quick picks "Not for us", "Sold", "Rejected: …", or the household's words);
 * Restore; and the Walked and Offered milestones, each with its date. Archiving keeps everything; Remove is the only
 * delete.
 */
import { useRef, useState } from "react";
import type { ExploreController } from "@/components/Explore/useExploreController";
import { ARCHIVE_PICKS, reasonGiven, type ActiveStatus } from "@/lib/client/parcelStore";
import { localDay, MILESTONE_WORD, MILESTONES, STATUS_WORD, statusLine } from "@/lib/client/parcelStatus";

const ACTIVE: ActiveStatus[] = ["inProgress", "saved"];

export function ParcelStanding({ ctl }: { ctl: ExploreController }) {
  const open = ctl.state.store.open!;
  const serial = ctl.state.serial;
  const [asking, setAsking] = useState(false);
  return (
    <div className="ip-standing" role="group" aria-label="Status">
      {open.status === "archived" ? (
        <div className="ip-chips">
          <span className="ip-note">{statusLine(open)}</span>
          <button className="ip-btn sec" onClick={() => ctl.restore(serial)}>
            Restore
          </button>
        </div>
      ) : asking ? (
        <ArchiveReason
          archive={(reason) => {
            ctl.archive(reason, serial);
            setAsking(false);
          }}
          cancel={() => setAsking(false)}
        />
      ) : (
        <div className="ip-chips">
          {ACTIVE.map((st) => (
            <button
              key={st}
              className="chip"
              aria-pressed={open.status === st}
              onClick={() => ctl.setStatus(st, serial)}
            >
              {STATUS_WORD[st]}
            </button>
          ))}
          <button className="ip-btn sec" onClick={() => setAsking(true)}>
            Archive…
          </button>
        </div>
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
                onClick={() => ctl.setMilestone(m, localDay(new Date()), serial)}
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
                  onChange={(e) => e.target.value && ctl.setMilestone(m, e.target.value, serial)}
                />
              </label>
              <button
                className="ip-milestone-x"
                aria-label={`Clear ${MILESTONE_WORD[m]}`}
                onClick={() => ctl.setMilestone(m, null, serial)}
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
