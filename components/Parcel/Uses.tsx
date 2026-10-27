"use client";
/**
 * Uses, the parcel panel's third segment (step 14, docs/plans/step-14-land-uses.md §6 B, §8; ux-audit P-3): What you can
 * do here, each use's name, its Yes / Maybe / No and its reason, a tap opening What decides it in place; then What
 * limits you; then the one not-advice line. Outside the grade: it reads the card's facts and changes nothing on it.
 * Divide's Try a split starts the split tool; the splits tried, "Keep this, sell that", come after What limits you (§5).
 */
import { useEffect, useRef } from "react";
import type { ScreenIt } from "@/components/Results/panel/ScreenIt";
import { Scenarios } from "@/components/Split/Scenarios";
import { USE_ORDER } from "@/lib/uses";
import { DIVIDE, USE_NAME, USE_WORDS } from "@/lib/uses/words";
import { PAY_WORDS } from "@/lib/pay/words";
import { HowItCouldPay } from "./HowItCouldPay";
import { Facts, UseRow } from "./UseRow";

export function Uses({ s }: { s: ScreenIt }) {
  const box = useRef<HTMLElement>(null);
  // The panel's scroll is shared with Grade and Details: Uses starts at its top.
  useEffect(() => {
    box.current?.closest(".explore-scroll")?.scrollTo?.({ top: 0 });
  }, []);
  const open = s.ctl.state.store.open;
  const graded = !!open?.screenIds.length;
  const v = s.uses;
  if (!v && !s.runningHere && !(graded && !s.display && !s.error))
    return (
      <>
        <p className="muted parcel-ungraded">{USE_WORDS.notGraded}</p>
        {/* A split tried from the toolbar on a parcel not graded yet still shows its pieces (§5). */}
        {!!open?.scenarios.length && (
          <section ref={box} className="uses" aria-label={USE_WORDS.tab}>
            <Scenarios s={s} />
          </section>
        )}
      </>
    );
  return (
    <section ref={box} className="uses" aria-label={USE_WORDS.tab}>
      <h3 className="uses-head">{USE_WORDS.section}</h3>
      {v ? (
        <ul className="uses-list">
          {v.uses.map((u) => (
            <UseRow
              key={u.key}
              name={u.name}
              a={u.answer}
              // Divide's Try a split (§5.1, §8): where it says Yes or Maybe, the split tool, to grade both pieces.
              action={
                u.key === "divide" && u.answer.answer !== "no" ? (
                  <button
                    type="button"
                    className="btn small secondary use-action"
                    onClick={() => s.ctl.startSplit()}
                  >
                    {DIVIDE.trySplit}
                  </button>
                ) : null
              }
            />
          ))}
        </ul>
      ) : (
        // Grading, or the kept grade still loading: the rows by name, their answers to come.
        <ul className="uses-list" aria-busy="true">
          {USE_ORDER.map((k) => (
            <li key={k} className="use loading">
              <div className="use-row">
                <span className="use-name">{USE_NAME[k]}</span>
                <span className="use-chip">…</span>
                <span className="use-reason use-bar" />
              </div>
            </li>
          ))}
        </ul>
      )}
      {v && (
        <>
          <h3 className="uses-head">{USE_NAME.limits}</h3>
          <Facts facts={v.limits} />
        </>
      )}
      {/* Step 15: How it could pay, Uses' second panel, directly under What limits you (plan §6, §12 Q2). */}
      <HowItCouldPay options={s.pay} />
      <Scenarios s={s} />
      {/* One not-advice line for both panels (§12 Q1): Panel 1's sentence, then Panel 2's. */}
      <p className="uses-advice tiny muted">
        {USE_WORDS.notAdvice} {PAY_WORDS.notAdvice}
      </p>
    </section>
  );
}
