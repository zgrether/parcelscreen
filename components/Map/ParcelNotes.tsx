"use client";
/**
 * A parcel's notes, with its listing's facts above them (WF1): the Info panel's Notes tab, and a parcel's detail on the
 * list (owner, after #133), the same component. The notes save as you type: the box keeps its own text, and a save
 * changes only the "Saved" line, so nothing redraws under the cursor. On phones the sheet and the toolbar step aside
 * while the box has focus.
 */
import { useEffect, useRef, useState } from "react";
import type { WorkingParcel } from "@/lib/client/parcelStore";
import { ListingFacts, type ListingSaves } from "./ListingFacts";

/** Notes save this long after the last keystroke (and at once when the box loses focus). */
const NOTES_DEBOUNCE_MS = 600;

const savedAt = (iso: string) =>
  new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export interface NotesSaves extends ListingSaves {
  notes(text: string): void;
}

export function ParcelNotes({
  parcel,
  name,
  derivedName,
  acres,
  save,
  focusName,
}: {
  parcel: WorkingParcel;
  /** The parcel's name as shown: the typed one, else the derived one. */
  name: string;
  /** The name it has until one is typed. */
  derivedName: string;
  acres: number | null;
  save: NotesSaves;
  /** Bumped to unfold the listing and put the cursor in Name. */
  focusName?: number;
}) {
  const [text, setText] = useState(parcel.notes);
  // The latest save: a debounced one that lands after the parcel changed is the caller's to drop (by its serial).
  const pending = useRef({ save, text, timer: null as number | null });
  useEffect(() => {
    pending.current.save = save;
  });
  const flush = () => {
    const s = pending.current;
    if (s.timer === null) return;
    window.clearTimeout(s.timer);
    s.timer = null;
    s.save.notes(s.text);
  };
  const change = (v: string) => {
    setText(v);
    const s = pending.current;
    s.text = v;
    if (s.timer !== null) window.clearTimeout(s.timer);
    s.timer = window.setTimeout(flush, NOTES_DEBOUNCE_MS);
  };
  // Leaving the tab or the panel saves what's pending; so does leaving the box (onBlur).
  useEffect(
    () => () => {
      flush();
      document.documentElement.classList.remove("note-typing");
    },
    [],
  );

  const unsaved = text !== parcel.notes;
  return (
    <div className="ip-notes">
      <ListingFacts
        parcel={parcel}
        derivedName={derivedName}
        acres={acres}
        save={save}
        focusName={focusName}
      />
      <div className="ip-notes-for">
        Notes <span>· {name}</span>
      </div>
      <textarea
        aria-label={`Notes for ${name}`}
        placeholder="What you learned: the listing, a call with the agent, what to check on the visit…"
        value={text}
        onChange={(e) => change(e.target.value)}
        onFocus={() => document.documentElement.classList.add("note-typing")}
        onBlur={() => {
          flush();
          document.documentElement.classList.remove("note-typing");
        }}
      />
      <div className="ip-notes-foot">
        <span>
          {unsaved
            ? "Saving…"
            : parcel.notesAt
              ? `Saved ${savedAt(parcel.notesAt)}`
              : "Notes save as you type."}
        </span>
        {text !== "" && (
          <button
            className="ip-link"
            onClick={() => {
              change("");
              flush();
            }}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
