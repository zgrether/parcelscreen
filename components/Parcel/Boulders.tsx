"use client";
/**
 * Uses' Boulders block (docs/plans/boulders.md §2): one line leading with the likely acres ("Likely boulders (for
 * bouldering): 2.6 ac; possible boulder ground: 233 ac more (…)"), a tap opening the likely acres, the flagged soils,
 * the rough patches and any stony units apart, then the estimate's honesty line. Outside the grade: no chip, and the
 * Grade tab's tally doesn't count it. A grade from before the measurement shows nothing.
 */
import { useId, useState } from "react";
import { bouldersView } from "@/lib/uses/boulders";
import { BOULDERS } from "@/lib/uses/words";
import type { ScreenResult } from "@/lib/screen/types";

export function Boulders({ boulders }: { boulders: ScreenResult["boulders"] }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const v = bouldersView(boulders);
  if (!v) return null;
  return (
    <>
      <h3 className="uses-head">{BOULDERS.section}</h3>
      <div className="use boulders">
        <button
          type="button"
          className="use-row boulders-row"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((x) => !x)}
        >
          <span className="boulders-line">{v.line}</span>
        </button>
        {open && (
          <div id={id} className="use-decides boulders-detail">
            <ul className="pay-lines">
              {v.lines.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
            <p className="tiny muted boulders-note">{BOULDERS.honesty}</p>
          </div>
        )}
      </div>
    </>
  );
}
