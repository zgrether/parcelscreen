"use client";
/**
 * The star (step 8, docs/plans/step-8-favorites.md §2) on each Favorites row, and its words (8c: "Add to list", "★ On
 * your list") on the panel's header and each Recent row. Empty, it opens the name sheet (Add to favorites: the name,
 * prefilled; Add); filled, it asks once before unstarring. Both sheets go to the page's body: the panel and the rows
 * hold transforms and clicks of their own.
 */
import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { ResetConfirm } from "@/components/Rubric/ResetConfirm";

export const STAR_ADD = "Add to list";
export const STAR_IN = "On your list";
/** The header's and Recent's words for the same two states (8c). */
export const LIST_ADD = "Add to list";
export const LIST_IN = "On your list";

/** The unstar confirm's question: back to my Recent list, or to the adder's when that's someone else (plan §11 Q6). */
export const unstarQuestion = (adder: string | null): string =>
  `Remove from Your list? ${adder ? `It goes back to ${adder}'s Recent list.` : "It goes back to your Recent list."}`;

const stop = (e: MouseEvent) => e.stopPropagation();

export function Star({
  on,
  name,
  prefill,
  star,
  unstar,
  adder,
  words = false,
  className = "",
}: {
  on: boolean;
  /** The parcel's name, in the button's label where several stars share a page (the list's rows). */
  name?: string;
  /** What the name sheet starts with (plan §11 Q15), asked for when it opens. */
  prefill(): string;
  star(name: string): void;
  unstar(): void;
  /** Whose Recent list it goes back to when that isn't mine; null for my own. */
  adder: string | null;
  /** Words instead of the star (8c): "Add to list", or "★ On your list". */
  words?: boolean;
  className?: string;
}) {
  const [asking, setAsking] = useState<"name" | "unstar" | null>(null);
  const word = words ? (on ? LIST_IN : LIST_ADD) : on ? STAR_IN : STAR_ADD;
  const close = () => setAsking(null);
  return (
    <>
      {words ? (
        <button
          type="button"
          className={`list-btn${on ? " on" : ""} ${className}`.trim()}
          aria-pressed={on}
          aria-label={name ? `${word}: ${name}` : word}
          title={on ? `${LIST_IN}: tap to remove` : undefined}
          onClick={(e) => {
            stop(e);
            setAsking(on ? "unstar" : "name");
          }}
        >
          {on && <span aria-hidden="true">★ </span>}
          {word}
        </button>
      ) : (
        <button
          type="button"
          className={`star-btn${on ? " on" : ""} ${className}`.trim()}
          aria-pressed={on}
          aria-label={name ? `${word}: ${name}` : word}
          title={on ? `${STAR_IN}: tap to remove` : STAR_ADD}
          onClick={(e) => {
            stop(e);
            setAsking(on ? "unstar" : "name");
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"
              fill={on ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
      {asking === "name" &&
        createPortal(
          <NameSheet
            start={prefill()}
            add={(n) => {
              star(n);
              close();
            }}
            cancel={close}
          />,
          document.body,
        )}
      {asking === "unstar" &&
        createPortal(
          <ResetConfirm
            question={unstarQuestion(adder)}
            action="Remove from Your list"
            keep="Keep"
            reset={() => {
              unstar();
              close();
            }}
            cancel={close}
          />,
          document.body,
        )}
    </>
  );
}

/** Add to favorites: a plain name, prefilled and selected; Add waits for one (plan §9). */
function NameSheet({ start, add, cancel }: { start: string; add(name: string): void; cancel(): void }) {
  const [name, setName] = useState(start);
  const box = useRef<HTMLInputElement>(null);
  const id = useId();
  const ok = name.trim() !== "";
  // Focused and selected once, as it opens: a parent's re-render (a sync) mustn't select over the typing.
  const cancelNow = useRef(cancel);
  useEffect(() => {
    cancelNow.current = cancel;
  });
  useEffect(() => {
    box.current?.focus();
    // Selected with the caret at the start, so a long name shows its beginning (fresh-eyes review).
    box.current?.setSelectionRange(0, box.current.value.length, "backward");
    if (box.current) box.current.scrollLeft = 0;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && cancelNow.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div
      className="rubric-sheet-scrim"
      onClick={(e) => {
        stop(e);
        cancel();
      }}
    >
      <form
        className="rubric-sheet star-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        onClick={stop}
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) add(name);
        }}
      >
        <h2 id={id}>Add to list</h2>
        <label className="star-sheet-name">
          Name
          <input ref={box} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </label>
        <p className="tiny muted star-sheet-hint">Your list is shared with everyone in your household.</p>
        <div className="rubric-confirm-actions">
          <button type="submit" className="btn" disabled={!ok}>
            Add
          </button>
          <button type="button" className="btn secondary" onClick={cancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
