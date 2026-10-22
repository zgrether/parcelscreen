"use client";
/**
 * Try it (step 12, docs/plans/step-12-raise-the-grade.md §2.2; owner, #281 answer): a drawn line tried as the driveway,
 * with WF6a's reroute and its re-timed drives. The result stays a suggestion: Use it keeps it, Discard drops it. The
 * same block sits under a suggestion and beside "Use as my driveway" in the Easement panel.
 */
import { RAISE_WORDS as W } from "@/lib/report/raise";
import type { Tried } from "@/components/Results/panel/ScreenIt";

export interface TryProps {
  /** The try in hand, whichever line it's for. */
  tried: Tried | null;
  /** The parcel's session is live: the try is a quick reroute, not a whole run. */
  quick: boolean;
  /** The tried line's outcome in words, once it's back. */
  words: string | null;
  /** The session is busy (a reroute or a run): Try it waits. */
  busy?: boolean;
  tryLine(line: string): void;
  useIt(): void;
  discard(): void;
}

export function TryIt({
  line,
  tried,
  quick,
  words,
  busy: sessionBusy = false,
  tryLine,
  useIt,
  discard,
  note = false,
}: TryProps & {
  line: string;
  /** Under a suggestion: say the drives aren't re-timed yet, and what kind of run Try it is. */
  note?: boolean;
}) {
  const mine = tried?.line === line ? tried : null;
  const busy = sessionBusy || (!!tried && tried.phase === "trying");
  if (mine?.phase === "tried")
    return (
      <div className="try-it tried" role="status">
        <p className="try-words">
          <b>{W.tried}</b> {words}
        </p>
        <div className="try-actions">
          <button type="button" className="btn small" onClick={useIt}>
            {W.useIt}
          </button>
          <button type="button" className="btn secondary small" onClick={discard}>
            {W.discard}
          </button>
        </div>
      </div>
    );
  return (
    <div className="try-it">
      {note && !mine && (
        <p className="tiny muted try-note">
          {W.notRetimed} {quick ? W.quick : W.slow}.
        </p>
      )}
      {mine?.phase === "failed" && (
        <p className="tiny text-steep" role="status">
          {W.failed(mine.error ?? "the run stopped")}
        </p>
      )}
      <button type="button" className="btn secondary small" disabled={busy} onClick={() => tryLine(line)}>
        {mine?.phase === "trying" ? W.trying : W.tryIt}
      </button>
    </div>
  );
}
