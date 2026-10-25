"use client";
/**
 * The parcel's standing (WF2, docs/plans/parcel-workflow.md §4), in Details' Status: Not for us (P-4, UX part 2: Archive
 * became Rule out), on any parcel, asking why with optional reasons and a note; Move back; and the Walked and Offered
 * milestones, each with its date. Ruling out keeps everything; Remove is the only delete. The header gets Not for us
 * too (PR 3).
 */
import { useRef, useState } from "react";
import {
  RULE_OUT_REASONS,
  ruleOutReason,
  type Milestone,
  type WorkingParcel,
} from "@/lib/client/parcelStore";
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
            Move back
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
        // Any parcel can be ruled out (P-4): one only in Recent joins Your list as Ruled out.
        <div className="ip-chips">
          <button className="ip-btn sec" onClick={() => setAsking(true)}>
            Not for us…
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

/** Why it's not for us (§9 Q5): a reason and a note, both optional; Rule it out keeps whichever were given. */
function ArchiveReason({ archive, cancel }: { archive(reason: string): void; cancel(): void }) {
  const [chip, setChip] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const box = useRef<HTMLInputElement>(null);
  const done = () => archive(ruleOutReason(chip, note));
  return (
    <div
      className="ip-archive"
      onKeyDown={(e) => {
        // Esc anywhere in it (a chip, the box) cancels this, not the parcel (the UX audit's B-4).
        if (e.key !== "Escape") return;
        e.preventDefault();
        cancel();
      }}
    >
      <p className="tiny muted">
        It moves to Ruled out on Your list, with your reason, and the map shows it greyed. Move back undoes
        it.
      </p>
      <div className="ip-chips" role="group" aria-label="Why (optional)">
        {RULE_OUT_REASONS.map((r) => (
          <button
            key={r}
            className="chip"
            aria-pressed={chip === r}
            onClick={() => {
              setChip(chip === r ? null : r);
              if (r === "Other") box.current?.focus();
            }}
          >
            {r}
          </button>
        ))}
      </div>
      <input
        ref={box}
        aria-label="A note for later (optional)"
        placeholder="A note for later (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") done();
        }}
      />
      <div className="ip-chips">
        <button className="ip-btn danger" onClick={done}>
          Rule it out
        </button>
        <button className="ip-btn sec" onClick={cancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
