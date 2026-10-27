"use client";
/**
 * A split's break-even (step 15, docs/plans/step-15-how-it-could-pay.md §4, §6): under the two pieces, which piece you'd
 * sell, then the price it must fetch to break even and what your piece then effectively costs, then the inputs, each at
 * its default ("assumed") until typed. A blank box goes back to the default. Outside the grade.
 */
import { useState } from "react";
import type { BreakEvenInputs } from "@/lib/client/parcelStore";
import type { ResolvedBreakEven } from "@/lib/split/breakEvenOf";
import type { BreakEvenPatch, PieceSide } from "@/lib/split/scenario";
import { BREAK_EVEN } from "@/lib/pay/words";
import { fmt } from "@/lib/format";

export function BreakEven({
  r,
  pieces,
  save,
}: {
  r: ResolvedBreakEven;
  pieces: readonly { side: PieceSide; word: string }[];
  save(patch: BreakEvenPatch): void;
}) {
  const f = r.figures;
  const field = (
    key: keyof BreakEvenInputs,
    label: string,
    v: { value: number; assumed: boolean } | null,
    d = 0,
  ) => (
    <Field
      key={`${key}:${v?.value ?? ""}:${v?.assumed ?? ""}`}
      label={label}
      value={v ? fmt(v.value, d).replace(/,/g, "") : ""}
      assumed={!!v?.assumed}
      placeholder={key === "price" ? BREAK_EVEN.typePrice : ""}
      save={(n) => save({ [key]: n })}
    />
  );
  return (
    <section className="be" aria-label={BREAK_EVEN.heading}>
      <h5 className="be-head">{BREAK_EVEN.heading}</h5>
      <div className="be-pick" role="group" aria-label={BREAK_EVEN.soldPick}>
        <span className="tiny muted">{BREAK_EVEN.soldPick}</span>
        {pieces.map((p) => (
          <button
            key={p.side}
            type="button"
            className="chip"
            aria-pressed={r.sold.side === p.side}
            onClick={() => r.sold.side !== p.side && save({ soldSide: p.side, sharePct: undefined })}
          >
            {p.word}
          </button>
        ))}
      </div>
      {f ? (
        <div className="be-figures" aria-live="polite">
          <p className="be-sell">{BREAK_EVEN.sell(r.sold.word, f.breakEvenPerAc, f.breakEven)}</p>
          <p className="be-keep">
            {BREAK_EVEN.keep(r.kept.word, f.keep, f.keepPerAc)},{" "}
            {r.soldAtPerAc !== null ? BREAK_EVEN.atSale(r.soldAtPerAc) : BREAK_EVEN.atBreakEven}
            <span className="pay-firm"> · your inputs</span>
          </p>
        </div>
      ) : (
        <p className="be-figures muted">{BREAK_EVEN.typePrice}</p>
      )}
      <div className="be-inputs">
        {field("price", BREAK_EVEN.price, r.price)}
        {field("sharePct", BREAK_EVEN.share, r.sharePct, 1)}
        {field("years", BREAK_EVEN.years, r.years, 1)}
        {field("ratePct", BREAK_EVEN.rate, r.ratePct, 2)}
        {field("survey", BREAK_EVEN.survey, r.survey)}
        {field("legal", BREAK_EVEN.legal, r.legal)}
        {field("road", BREAK_EVEN.road, r.road)}
        <Field
          key={`soldAt:${r.soldAtPerAc ?? ""}`}
          label={BREAK_EVEN.soldAt}
          value={r.soldAtPerAc !== null ? String(r.soldAtPerAc) : ""}
          assumed={false}
          placeholder={BREAK_EVEN.soldAtPlaceholder}
          save={(n) => save({ soldAtPerAc: n })}
        />
      </div>
      <p className="tiny muted be-note">{BREAK_EVEN.notCounted}</p>
    </section>
  );
}

/** A number saved on blur or Enter; blank goes back to the default (undefined), anything unreadable to what it was. */
function Field({
  label,
  value,
  assumed,
  placeholder,
  save,
}: {
  label: string;
  value: string;
  assumed: boolean;
  placeholder: string;
  save(n: number | undefined): void;
}) {
  const [text, setText] = useState(value);
  const keep = () => {
    const t = text.trim().replace(/[$,%]/g, "");
    // Blank: back to the default (a typed value is cleared; a default stays as it was).
    if (t === "") {
      if (!assumed && value !== "") save(undefined);
      else setText(value);
      return;
    }
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) return setText(value);
    // Unchanged (a default left as it was) saves nothing.
    if (t !== value) save(n);
  };
  return (
    <label className="be-field">
      <span>
        {label}
        {assumed && <span className="tiny muted"> ({BREAK_EVEN.assumed})</span>}
      </span>
      <input
        className="field"
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={keep}
        onKeyDown={(e) => {
          if (e.key === "Enter") keep();
        }}
      />
    </label>
  );
}
