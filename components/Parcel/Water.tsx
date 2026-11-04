"use client";
/**
 * Uses' Water on the land (docs/plans/water.md §2): one summary line, a tap opening where the water comes from, what
 * it does on the parcel and what the soils hold, then the estimate's honesty line. Outside the grade: no chip, and the
 * Grade tab's tally doesn't count it. A grade from before the measurement shows nothing.
 */
import { useId, useState } from "react";
import { waterView } from "@/lib/uses/water";
import { WATER } from "@/lib/uses/words";
import type { ScreenResult } from "@/lib/screen/types";

export function Water({ water }: { water: ScreenResult["water"] }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const v = waterView(water);
  if (!v) return null;
  return (
    <>
      <h3 className="uses-head">{WATER.section}</h3>
      <div className="use water">
        <button
          type="button"
          className="use-row water-row"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((x) => !x)}
        >
          <span className="water-line">{v.line}</span>
        </button>
        {open && (
          <div id={id} className="use-decides water-detail">
            {v.sections.map((s) => (
              <section key={s.head}>
                <h4 className="uses-sub">{s.head}</h4>
                <ul className="pay-lines">
                  {s.lines.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </section>
            ))}
            {v.soils.length > 0 && (
              <section>
                <h4 className="uses-sub">{WATER.soils}</h4>
                <ul className="water-soils">
                  {v.soils.map((s, i) => (
                    <li key={i}>
                      <span className="water-soil-name">{s.name}</span>
                      <span className="water-soil-facts">{s.facts}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <p className="tiny muted water-note">{WATER.honesty}</p>
          </div>
        )}
      </div>
    </>
  );
}
