"use client";
/**
 * A card's sheet (step 3, docs/plans/step-3-rubric-editor.md §2): what the factor asks and how it's scored (the
 * rulebook's words for it), why the card is where it is, its threshold as a slider (a row's B/C edge, the band moving
 * with it; a minimum's value), and "Move to…" for anyone who can't drag. A dialog: Escape or Close shuts it, and the
 * focus goes back to the card.
 */
import { useEffect, useRef } from "react";
import { panelText } from "@/lib/report/cardPanels";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";
import {
  columnsOf,
  hasMinimum,
  removeMinimum,
  setBandEdge,
  setMinimum,
  type EditorCard,
} from "@/lib/rubric/edit";
import type { Rubric, RowKey } from "@/lib/rubric/types";
import {
  bandLine,
  bandValue,
  bcEdge,
  cardLine,
  EDITOR_TITLES,
  isGate,
  MINIMUM_BAND,
  minimumLine,
  ROW_BANDS,
  tierOf,
  limitWhy,
  whyLine,
  type WhyContext,
  type LimitKey,
  type Tier,
} from "@/lib/rubric/words";
import { cardName, TIER_NAMES, TIERS } from "./RubricColumns";

/** Each band's slider label, where a row has two (Town and hospital) or the unit needs a word. */
const BAND_LABELS: Record<LimitKey, string> = {
  elevationFt: "Build site elevation",
  skyMag: "Sky brightness (mag/arcsec²)",
  roomX: "Gentle ground, × the footprint",
  trailheadMin: "Drive to a trailhead",
  erMin: "Drive to an ER",
  groceryMin: "Drive to groceries",
  gardenAc: "Garden ground",
  drivewayPct: "The driveway at its steepest",
  sunH: "December sun at the best site",
};

export function CardSheet({
  card,
  rubric,
  apply,
  move,
  close,
  why,
}: {
  card: EditorCard;
  rubric: Rubric;
  /** The interview's list and its why lines, when the profile has answered (step 4). */
  why?: WhyContext | null;
  apply(next: Rubric, message?: string | null): void;
  move(card: EditorCard, to: Tier, index?: number): void;
  close(): void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const f = card.factor;
  const text = panelText(f, SCREEN_CONSTANTS.card, SCREEN_CONSTANTS.build, { rubric });
  const here: Tier = card.kind === "minimum" ? "must" : tierOf(rubric, f);
  const columns = columnsOf(rubric);
  const list = columns[here];
  const at = list.findIndex((c) => c.kind === card.kind && c.factor === f);
  const ranked = here === "should" || here === "could";
  const canGo = (tier: Tier): boolean => {
    if (tier === here) return false;
    if (card.kind === "minimum") return tier === "wont";
    if (isGate(f)) return tier === "must" || tier === "wont";
    if (tier === "must") return MINIMUM_BAND[f] !== null && !hasMinimum(rubric, f);
    return true;
  };

  return (
    <div className="rubric-sheet-scrim" onClick={close}>
      <div
        ref={dialog}
        className="rubric-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={cardName(card)}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="rubric-sheet-head">
          <h2>{card.kind === "minimum" ? `${EDITOR_TITLES[f]}: limit` : EDITOR_TITLES[f]}</h2>
          <button type="button" className="btn secondary small" onClick={close}>
            Close
          </button>
        </header>
        <p className="rubric-sheet-words">
          {card.kind === "minimum"
            ? minimumLine(rubric.musts.find((m) => m.factor === f && m.threshold !== undefined)!)
            : cardLine(rubric, f)}
        </p>
        <p className="tiny muted">
          {TIER_NAMES[here]}
          {ranked && `, #${rubric.ranked.findIndex((c) => c.factor === f) + 1} in the list`} · Why:{" "}
          {card.kind === "minimum" ? limitWhy(rubric, f as RowKey, why) : whyLine(rubric, f, why)}
        </p>

        {card.kind === "factor" && !isGate(f) && ROW_BANDS[f].length > 0 && (
          <div className="rubric-sliders">
            {ROW_BANDS[f].map((band) => (
              <BandSlider
                key={band}
                label={BAND_LABELS[band]}
                band={band}
                value={bcEdge(rubric.bands, band)}
                hint={`How this item is graded: ${bandLine(rubric.bands, band)}`}
                onChange={(v) => apply(setBandEdge(rubric, band, v))}
              />
            ))}
          </div>
        )}
        {card.kind === "minimum" && MINIMUM_BAND[f as keyof typeof MINIMUM_BAND] && (
          <div className="rubric-sliders">
            <BandSlider
              label={`Your limit: ${BAND_LABELS[MINIMUM_BAND[f as keyof typeof MINIMUM_BAND]!].toLowerCase()}`}
              band={MINIMUM_BAND[f as keyof typeof MINIMUM_BAND]!}
              value={rubric.musts.find((m) => m.factor === f && m.threshold !== undefined)!.threshold!}
              hint="A parcel on the wrong side of it is a Pass; one with no number for it is at most a Maybe."
              onChange={(v) => apply(setMinimum(rubric, f as keyof typeof MINIMUM_BAND, v))}
            />
          </div>
        )}
        {isGate(f) && (
          <p className="tiny muted">
            A dealbreaker passes, warns or fails by its own rule: a fail is a Pass, and a Contender has at
            most one warning (&ldquo;verify the easement&rdquo; is a warning).
          </p>
        )}
        {f === "homesite" && card.kind === "factor" && (
          <p className="tiny muted">
            Graded by the site&apos;s quality: it has no number to set. Move it to Must have to set a limit on
            its December sun.
          </p>
        )}

        <div className="rubric-moveto" role="group" aria-label="Move to">
          <span className="tiny muted">Move to…</span>
          {TIERS.map((tier) => (
            <button key={tier} type="button" disabled={!canGo(tier)} onClick={() => move(card, tier)}>
              {TIER_NAMES[tier]}
            </button>
          ))}
          {ranked && (
            <>
              <button type="button" disabled={at <= 0} onClick={() => move(card, here, at - 1)}>
                Up
              </button>
              <button
                type="button"
                disabled={at < 0 || at >= list.length - 1}
                onClick={() => move(card, here, at + 1)}
              >
                Down
              </button>
            </>
          )}
          {card.kind === "minimum" && (
            <button
              type="button"
              onClick={() => {
                apply(
                  removeMinimum(rubric, f as keyof typeof MINIMUM_BAND),
                  `${EDITOR_TITLES[f]}: limit removed.`,
                );
                close();
              }}
            >
              Remove the limit
            </button>
          )}
        </div>

        <details className="rubric-sheet-more">
          <summary>{text.question}</summary>
          <p className="tiny">{text.howScored}</p>
        </details>
      </div>
    </div>
  );
}

function BandSlider({
  label,
  band,
  value,
  hint,
  onChange,
}: {
  label: string;
  band: LimitKey;
  value: number;
  hint: string;
  onChange(v: number): void;
}) {
  const r = SCREEN_CONSTANTS.card.editor[band];
  return (
    <label className="rubric-slider">
      <span>
        {label}: <strong>{bandValue(band, value)}</strong>
      </span>
      <input
        type="range"
        min={r.min}
        max={r.max}
        step={r.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="tiny muted">{hint}</span>
    </label>
  );
}
