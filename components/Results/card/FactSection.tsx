"use client";
/**
 * "Is this a fact about the parcel?" (J-5, UX part 2 PR 3c; docs/plans/ux-part-2.md §5): at the top of Adjust on the
 * rows a document can settle. A fact is marked once for the household, and every member's grade, the cost and the
 * print read it; anything else stays the person's own adjustment, below.
 *   - Floodplain: a flood letter (an elevation certificate or a LOMA), marked here.
 *   - Satellite internet: service confirmed at the address (internet, and power for the cost), marked here.
 *   - Septic: the septic permit, marked on the map where it was tested (the mark that exists).
 *   - Legal road access, Driveway on your land: the easement, drawn on the map with where it's recorded.
 */
import { useState } from "react";
import { FLOOD_LETTERS, type Facts, type FloodLetter } from "@/lib/report/marks";
import type { Factor } from "@/lib/rubric/types";

export type FactRow = "floodplain" | "internet" | "septic" | "access" | "easement";
export const isFactRow = (f: Factor): f is FactRow =>
  f === "floodplain" || f === "internet" || f === "septic" || f === "access" || f === "easement";

export const FACT_WORDS = {
  question: "Is this a fact about the parcel?",
  what: {
    floodplain: "An elevation certificate or a Letter of Map Amendment (LOMA) settles it.",
    internet: "A provider's letter, or a service already at the address, settles it.",
    septic: "A septic permit settles it.",
    access: "A recorded right-of-way settles it.",
    easement: "A recorded right-of-way settles it.",
  } satisfies Record<FactRow, string>,
  yes: "Mark it for everyone",
  forEveryone: "Marked once, it counts in every member's grade, the cost and the report.",
  orYours: "Or, as your own view:",
  letter: { elevation: "Elevation certificate", loma: "LOMA" } satisfies Record<FloodLetter, string>,
  letterOnFile: (k: FloodLetter) =>
    `On file for everyone: ${k === "loma" ? "a LOMA" : "an elevation certificate"}.`,
  internet: "Internet",
  power: "Power",
  serviceOnFile: (s: NonNullable<Facts["service"]>) =>
    `On file for everyone: ${[s.internet ? "internet" : null, s.power ? "power" : null].filter(Boolean).join(" and ")} service confirmed at the address.`,
  septicHow: "Mark the permit on the map where the ground was tested; every member's Septic passes with it.",
  septicGo: "Mark the septic permit",
  easementHow: "Draw the easement on the map, and say where it's recorded; every member's grade reads it.",
  easementGo: "Draw the easement",
  mark: "Mark it",
  cancel: "Cancel",
  remove: "Remove",
};

export interface FactProps {
  row: FactRow;
  facts: Facts | undefined;
  saveFacts(f: Facts): void;
  /** Starts the map's tool for a mark that's a place: the septic permit, or an easement. */
  draw(choice: "septic" | "easement"): void;
}

const now = () => new Date().toISOString();

export function FactSection({ row, facts, saveFacts, draw }: FactProps) {
  const [open, setOpen] = useState(false);
  const f = facts ?? {};
  const on = row === "floodplain" ? f.floodLetter : row === "internet" ? f.service : undefined;
  if (on) {
    const without: Facts = { ...f };
    if (row === "floodplain") delete without.floodLetter;
    else delete without.service;
    return (
      <div className="fact fact-on" role="group" aria-label={FACT_WORDS.question}>
        <p>
          {row === "floodplain"
            ? FACT_WORDS.letterOnFile(f.floodLetter!.kind)
            : FACT_WORDS.serviceOnFile(f.service!)}
        </p>
        <button type="button" className="btn secondary small" onClick={() => saveFacts(without)}>
          {FACT_WORDS.remove}
        </button>
      </div>
    );
  }
  return (
    <div className="fact" role="group" aria-label={FACT_WORDS.question}>
      <p>
        <b>{FACT_WORDS.question}</b> {FACT_WORDS.what[row]}
      </p>
      {!open ? (
        <button type="button" className="btn secondary" onClick={() => setOpen(true)}>
          {FACT_WORDS.yes}
        </button>
      ) : row === "floodplain" ? (
        <LetterForm
          cancel={() => setOpen(false)}
          mark={(kind) => {
            setOpen(false);
            saveFacts({ ...f, floodLetter: { kind, at: now() } });
          }}
        />
      ) : row === "internet" ? (
        <ServiceForm
          cancel={() => setOpen(false)}
          mark={(internet, power) => {
            setOpen(false);
            saveFacts({ ...f, service: { internet, power, at: now() } });
          }}
        />
      ) : (
        <div className="fact-form">
          <p className="tiny muted">{row === "septic" ? FACT_WORDS.septicHow : FACT_WORDS.easementHow}</p>
          <div className="adjust-actions">
            <button
              type="button"
              className="btn"
              onClick={() => draw(row === "septic" ? "septic" : "easement")}
            >
              {row === "septic" ? FACT_WORDS.septicGo : FACT_WORDS.easementGo}
            </button>
            <button type="button" className="btn secondary" onClick={() => setOpen(false)}>
              {FACT_WORDS.cancel}
            </button>
          </div>
        </div>
      )}
      <p className="tiny muted">{open ? FACT_WORDS.forEveryone : FACT_WORDS.orYours}</p>
    </div>
  );
}

function LetterForm({ mark, cancel }: { mark(k: FloodLetter): void; cancel(): void }) {
  const [kind, setKind] = useState<FloodLetter | null>(null);
  return (
    <div className="fact-form">
      <div className="ip-chips" role="group" aria-label="Which letter">
        {FLOOD_LETTERS.map((k) => (
          <button key={k} type="button" className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>
            {FACT_WORDS.letter[k]}
          </button>
        ))}
      </div>
      <div className="adjust-actions">
        <button type="button" className="btn" disabled={!kind} onClick={() => kind && mark(kind)}>
          {FACT_WORDS.mark}
        </button>
        <button type="button" className="btn secondary" onClick={cancel}>
          {FACT_WORDS.cancel}
        </button>
      </div>
    </div>
  );
}

function ServiceForm({ mark, cancel }: { mark(internet: boolean, power: boolean): void; cancel(): void }) {
  const [internet, setInternet] = useState(true);
  const [power, setPower] = useState(false);
  return (
    <div className="fact-form">
      <div className="ip-chips" role="group" aria-label="Service confirmed">
        <button type="button" className="chip" aria-pressed={internet} onClick={() => setInternet((x) => !x)}>
          {FACT_WORDS.internet}
        </button>
        <button type="button" className="chip" aria-pressed={power} onClick={() => setPower((x) => !x)}>
          {FACT_WORDS.power}
        </button>
      </div>
      <div className="adjust-actions">
        <button
          type="button"
          className="btn"
          disabled={!internet && !power}
          onClick={() => mark(internet, power)}
        >
          {FACT_WORDS.mark}
        </button>
        <button type="button" className="btn secondary" onClick={cancel}>
          {FACT_WORDS.cancel}
        </button>
      </div>
    </div>
  );
}
