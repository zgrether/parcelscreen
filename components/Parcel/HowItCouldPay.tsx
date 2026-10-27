"use client";
/**
 * How it could pay, Uses' second panel (step 15, docs/plans/step-15-how-it-could-pay.md §6, §7): each option's name,
 * Eligible / Maybe / Not eligible and its reason, a tap opening its detail in place (what decides it, the number with
 * its source, date and confidence word, what it costs you, and the question to ask). Virginia's easement has the credit
 * slider, at $0 until it's moved. Outside the grade: it reads the options and changes nothing on the card.
 */
import { useId, useState } from "react";
import { STATE_EASEMENT } from "@/lib/config/programs";
import { PAY_ORDER, type Eligibility, type PayLine, type PayOption } from "@/lib/pay";
import { creditFor } from "@/lib/pay/credit";
import { sliderLine } from "@/lib/pay/easement";
import { ELIGIBILITY_WORD, money, NUMBER, PAY_NAME, PAY_WORDS } from "@/lib/pay/words";
import { Facts } from "./UseRow";

/** The gate colours (§7): Eligible as pass, Maybe as warn, Not eligible as fail; the word is always said too. */
const TONE: Record<Eligibility, string> = { eligible: "pass", maybe: "warn", no: "fail" };

export function HowItCouldPay({ options }: { options: readonly PayOption[] | null }) {
  return (
    <>
      <h3 className="uses-head">{PAY_WORDS.section}</h3>
      {options ? (
        <ul className="uses-list pay-list">
          {options.map((o) => (
            <PayRow key={o.key} o={o} />
          ))}
        </ul>
      ) : (
        // Grading: the rows by name, their answers to come.
        <ul className="uses-list pay-list" aria-busy="true">
          {PAY_ORDER.map((k) => (
            <li key={k} className="use loading">
              <div className="use-row pay-row">
                <span className="use-name">{PAY_NAME[k]}</span>
                <span className="use-chip">…</span>
                <span className="use-reason use-bar" />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function PayRow({ o }: { o: PayOption }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <li className="use" data-pay={o.key}>
      <button
        type="button"
        className="use-row pay-row"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="use-name">{o.name}</span>
        <span className={`use-chip ${TONE[o.eligibility]}`}>{ELIGIBILITY_WORD[o.eligibility]}</span>
        <span className="use-reason">{o.reason}</span>
      </button>
      {open && (
        <div id={id} className="use-decides pay-detail">
          {o.signals.length > 0 && (
            <>
              <h4 className="uses-sub">{PAY_WORDS.signals}</h4>
              <Facts facts={o.signals} />
            </>
          )}
          {(o.number.length > 0 || o.slider) && (
            <>
              <h4 className="uses-sub">{PAY_WORDS.number}</h4>
              {o.slider && <CreditSlider max={o.slider.max} step={o.slider.step} />}
              <ul className="pay-lines">
                {o.number.map((l, i) => (
                  <Line key={i} l={l} />
                ))}
              </ul>
            </>
          )}
          {o.link && (
            <p className="pay-link">
              <a href={o.link.href} target="_blank" rel="noreferrer">
                {o.link.label} ↗
              </a>
            </p>
          )}
          <h4 className="uses-sub">{PAY_WORDS.costs}</h4>
          <p className="pay-text">{o.cost}</p>
          <h4 className="uses-sub">
            {PAY_WORDS.ask} {o.ask.who}
          </h4>
          <p className="pay-text">{o.ask.question}</p>
        </div>
      )}
    </li>
  );
}

/** A figure's line: its words, then its confidence word and its source with its date, muted. */
function Line({ l }: { l: PayLine }) {
  return (
    <li>
      {l.text}
      {l.firmness && <span className="pay-firm"> · {l.firmness}</span>}
      {(l.source || l.asOf) && (
        <span className="use-source tiny muted">
          {l.source && <SourceLink href={l.source} />}
          {l.source && l.asOf && ", "}
          {l.asOf}
          {l.confidence === "to confirm" && ` (${PAY_WORDS.toConfirm})`}
        </span>
      )}
    </li>
  );
}

function SourceLink({ href }: { href: string }) {
  let host = href;
  try {
    host = new URL(href).hostname.replace(/^www\./, "");
  } catch {
    /* not a URL: shown as it is */
  }
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {host}
    </a>
  );
}

/**
 * Virginia's Land Preservation Tax Credit as a slider (§2.1): "If the easement's appraised value were $X → a state
 * credit of $Y". It starts at $0, so no figure shows before it's moved.
 */
function CreditSlider({ max, step }: { max: number; step: number }) {
  const credit = STATE_EASEMENT.VA.credit!;
  const [value, setValue] = useState(0);
  const id = useId();
  return (
    <div className="pay-slider">
      <label htmlFor={id} className="pay-slider-label">
        {NUMBER.sliderLabel} <strong>{money(value)}</strong>
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={max}
        step={step}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        aria-valuetext={money(value)}
      />
      <p className="pay-credit" aria-live="polite">
        {value > 0 ? sliderLine(value, credit, creditFor(value, credit)) : PAY_WORDS.sliderHint}
      </p>
    </div>
  );
}
