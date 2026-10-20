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
/** How long Clear's Undo stays (polish #21); typing ends it sooner. */
const UNDO_MS = 8000;

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
  nameInHeading = true,
  listing = true,
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
  /** "Notes · 52-47A" in the map's panel; just "Notes" where the panel's title already names it (the list's detail). */
  nameInHeading?: boolean;
  /** The listing's facts above the notes, and the "Notes" label; false where they're their own sections (step 8b). */
  listing?: boolean;
}) {
  const [text, setText] = useState(parcel.notes);
  // What Clear took away (polish #21): Undo puts it back, for a few seconds.
  const [cleared, setCleared] = useState<string | null>(null);
  useEffect(() => {
    if (cleared === null) return;
    const t = window.setTimeout(() => setCleared(null), UNDO_MS);
    return () => window.clearTimeout(t);
  }, [cleared]);
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
      {listing && (
        <>
          <ListingFacts
            parcel={parcel}
            derivedName={derivedName}
            acres={acres}
            save={save}
            focusName={focusName}
          />
          <div className="ip-notes-for">Notes {nameInHeading && <span>· {name}</span>}</div>
        </>
      )}
      <textarea
        aria-label={`Notes for ${name}`}
        placeholder="What you learned: the listing, a call with the agent, what to check on the visit…"
        value={text}
        onChange={(e) => {
          setCleared(null);
          change(e.target.value);
        }}
        onFocus={() => document.documentElement.classList.add("note-typing")}
        onBlur={() => {
          flush();
          document.documentElement.classList.remove("note-typing");
        }}
      />
      <div className="ip-notes-foot">
        <span>
          {cleared !== null && !unsaved
            ? "Notes cleared."
            : unsaved
              ? "Saving…"
              : parcel.notesAt
                ? `Saved ${savedAt(parcel.notesAt)}`
                : "Notes save as you type."}
        </span>
        {cleared !== null ? (
          <button
            className="ip-btn sec"
            onClick={() => {
              change(cleared);
              flush();
              setCleared(null);
            }}
          >
            Undo
          </button>
        ) : (
          text !== "" && (
            <button
              className="ip-btn sec"
              onClick={() => {
                setCleared(text);
                change("");
                flush();
              }}
            >
              Clear
            </button>
          )
        )}
      </div>
    </div>
  );
}
