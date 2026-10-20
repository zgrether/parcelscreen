"use client";
/**
 * The grade note (step 8b, owner on #228): a line's or a mark's edit regrades the card at once (the header's grade and
 * verdict follow it), and while the edit is made in Details the grade itself is out of sight. So when the card changes
 * for the same parcel, screen, site evaluated and rubric, a short line under the header says what moved ("Septic now
 * passes") for about 6 seconds. A tap shows Grade, scrolled to that row. An edit that needs a re-run says so in the
 * grade button instead ("Grade again: lines changed"): no note then.
 */
import { useEffect, useRef, useState } from "react";
import { cardDiff, gradeNote, noteTarget } from "@/lib/report/cardDiff";
import type { Card } from "@/lib/report/card";
import type { PanelKey } from "@/lib/report/cardPanels";
import type { ScreenIt } from "./ScreenIt";

/** How long the note stays, ms. */
export const GRADE_NOTE_MS = 6000;

interface Note {
  text: string;
  target: PanelKey | "answer";
  /** The parcel it's about (state.serial). */
  serial: number;
  /** Each note its own, so a second one restarts the timer. */
  n: number;
}

/** What the card was made from, besides the parcel's lines and marks: a change in any of these isn't an edit's. */
interface Basis {
  serial: number;
  display: unknown;
  rubric: string;
  card: Card;
}

export function GradeNote({ s }: { s: ScreenIt }) {
  const [note, setNote] = useState<Note | null>(null);
  const basis = useRef<Basis | null>(null);
  const count = useRef(0);
  const { card, display, runningHere, stale } = s;
  const serial = s.ctl.state.serial;
  const linesChanged = !!s.fresh?.lines;

  useEffect(() => {
    // Running, stale, or lines drawn since the run (Grade again says so): no note, and the next card starts afresh.
    if (!card || runningHere || stale || linesChanged) {
      basis.current = null;
      return;
    }
    const was = basis.current;
    basis.current = { serial, display, rubric: card.rubric.id, card };
    if (
      !was ||
      was.card === card ||
      was.serial !== serial ||
      was.display !== display ||
      was.rubric !== card.rubric.id
    )
      return;
    const d = cardDiff(was.card, card);
    const text = gradeNote(d);
    if (text) setNote({ text, target: noteTarget(d), n: ++count.current, serial });
  }, [card, display, serial, runningHere, stale, linesChanged]);

  useEffect(() => {
    if (!note) return;
    const timer = window.setTimeout(() => setNote(null), GRADE_NOTE_MS);
    return () => window.clearTimeout(timer);
  }, [note]);

  // Another parcel opened: its note isn't this one's.
  if (!note || note.serial !== serial) return null;
  return (
    <button
      className="grade-note"
      role="status"
      aria-label={`${note.text}. Show it on Grade`}
      onClick={() => {
        setNote(null);
        s.ctl.setInfo(false);
        // Grade renders as this click's update lands; then its row comes into view, briefly marked.
        window.setTimeout(() => {
          const el = document.querySelector<HTMLElement>(`.card [data-card-key="${note.target}"]`);
          el?.scrollIntoView?.({ block: "center" });
          el?.classList.add("card-flash");
          window.setTimeout(() => el?.classList.remove("card-flash"), 1600);
        }, 0);
      }}
    >
      {note.text}
    </button>
  );
}
