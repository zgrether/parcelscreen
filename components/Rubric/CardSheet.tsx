"use client";
/**
 * A card's sheet (step 3, docs/plans/step-3-rubric-editor.md §2): what the factor asks and how it's scored (the
 * rulebook's words for it), why the card is where it is, its threshold as a slider (a row's B/C edge, the band moving
 * with it; a minimum's value), and "Move to…" for anyone who can't drag. A dialog: Escape or Close shuts it, and the
 * focus goes back to the card. The night sky reads in what you'd see, with its A–D scale, and mag/arcsec² under it
 * (UX part 2, P-7).
 */
import Link from "next/link";
import { useEffect, useRef } from "react";
import { panelText } from "@/lib/report/cardPanels";
import { VIEW_OPEN_MI } from "@/lib/report/view";
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
  skySight,
  skyWords,
  tierOf,
  limitWhy,
  whyLine,
  WHY_STARTING,
  type WhyContext,
  type LimitKey,
  type Tier,
} from "@/lib/rubric/words";
import type { Bands } from "@/lib/rubric/types";
import { cardName, TIER_NAMES, TIERS } from "./RubricColumns";

/** Each band's slider label, where the unit needs a word. */
const BAND_LABELS: Record<LimitKey, string> = {
  elevationFt: "Build site elevation",
  skyMag: "Sky brightness (mag/arcsec²)",
  roomX: "Gentle ground, × the footprint",
  trailheadMin: "Drive to a trailhead",
  erMin: "Drive to an ER",
  groceryMin: "Drive to groceries",
  gardenAc: "Garden ground",
  drivewayPct: "The driveway at its steepest",
  janLowF: "January lows at least",
  julHighF: "July highs at most",
  privacyFt: "Nearest house at least",
  privacySight: "Houses in sight, at most",
  viewOpenPct: `Horizon open past ${VIEW_OPEN_MI}, at least`,
  airportMin: "Drive to an airport",
  longTrailMin: "Drive to a long trail",
  paddleMin: "Drive to a lake launch",
  dishClearPct: "Dish spot clear, at least",
  sunH: "December sun at the best site",
};

const LIMIT_HINT =
  "A parcel on the wrong side of it is Not for us; one with no number for it is at most a Maybe.";

/** The night sky's sheet (UX part 2, P-7). */
export const SKY_WORDS = {
  howDark: "How dark it has to be at the house site",
  measured: (mag: string, forB: boolean) =>
    `Measured as sky brightness overhead: ${mag} mag/arcsec²${forB ? " for a B" : ""}. Lower zones are darker.`,
  whatThatMeans: "What that means",
} as const;

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
  const minimum = rubric.musts.find((m) => m.factor === f && m.threshold !== undefined);
  const canGo = (tier: Tier): boolean => {
    if (tier === here) return false;
    if (card.kind === "minimum") return tier === "wont";
    if (isGate(f)) return tier === "must" || tier === "wont";
    // Within budget (step 10) is a Must without a number, as a dealbreaker is.
    if (f === "budget") return true;
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
        {/* The sky's words are its slider's own, under it (P-7). */}
        {f !== "sky" && (
          <p className="rubric-sheet-words">
            {card.kind === "minimum" ? minimumLine(minimum!) : cardLine(rubric, f)}
          </p>
        )}
        <p className="tiny muted">
          {TIER_NAMES[here]}
          {ranked && `, #${rubric.ranked.findIndex((c) => c.factor === f) + 1} in the list`} · Why:{" "}
          {startingWords(
            card.kind === "minimum" ? limitWhy(rubric, f as RowKey, why) : whyLine(rubric, f, why),
          )}
        </p>

        {card.kind === "factor" && !isGate(f) && ROW_BANDS[f].length > 0 && (
          <div className="rubric-sliders">
            {ROW_BANDS[f].map((band) =>
              band === "skyMag" ? (
                <SkySlider
                  key={band}
                  label={SKY_WORDS.howDark}
                  value={bcEdge(rubric.bands, band)}
                  bands={rubric.bands}
                  onChange={(v) => apply(setBandEdge(rubric, band, v))}
                />
              ) : (
                <BandSlider
                  key={band}
                  label={BAND_LABELS[band]}
                  band={band}
                  value={bcEdge(rubric.bands, band)}
                  hint={`How this item is graded: ${bandLine(rubric.bands, band)}`}
                  forB
                  onChange={(v) => apply(setBandEdge(rubric, band, v))}
                />
              ),
            )}
          </div>
        )}
        {card.kind === "minimum" && f === "sky" && (
          <div className="rubric-sliders">
            <SkySlider
              label={`Your limit: ${SKY_WORDS.howDark.toLowerCase()}`}
              value={minimum!.threshold!}
              onChange={(v) => apply(setMinimum(rubric, "sky", v))}
            />
            <span className="tiny muted">{LIMIT_HINT}</span>
          </div>
        )}
        {card.kind === "minimum" && f !== "sky" && MINIMUM_BAND[f as keyof typeof MINIMUM_BAND] && (
          <div className="rubric-sliders">
            <BandSlider
              label={`Your limit: ${BAND_LABELS[MINIMUM_BAND[f as keyof typeof MINIMUM_BAND]!].toLowerCase()}`}
              band={MINIMUM_BAND[f as keyof typeof MINIMUM_BAND]!}
              value={minimum!.threshold!}
              hint={LIMIT_HINT}
              onChange={(v) => apply(setMinimum(rubric, f as keyof typeof MINIMUM_BAND, v))}
            />
          </div>
        )}
        {isGate(f) && (
          <p className="tiny muted">
            A dealbreaker passes, warns or fails by its own rule: a fail makes it Not for us, and a Contender
            has at most one warning (&ldquo;verify the easement&rdquo; is a warning).
          </p>
        )}
        {f === "budget" && (
          <p className="tiny muted">
            Graded on Ready to camp and Ready to build against your budgets.{" "}
            <Link href="/interview">Change them in the questions</Link>
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
  forB = false,
  onChange,
}: {
  label: string;
  band: LimitKey;
  value: number;
  hint: string;
  /** A row's slider sets its B/C edge: says so, beside a scale that starts at A (polish #41). */
  forB?: boolean;
  onChange(v: number): void;
}) {
  const r = SCREEN_CONSTANTS.card.editor[band];
  return (
    <label className="rubric-slider">
      <span>
        {label}: <strong>{bandValue(band, value)}</strong>
        {forB && " for a B"}
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

/**
 * The night sky's slider: what you'd see at the limit, the A–D scale in the same words when it's a row's (its bands
 * move with the slider), and mag/arcsec² under it, with Help's Night sky behind "What that means".
 */
function SkySlider({
  label,
  value,
  bands,
  onChange,
}: {
  label: string;
  value: number;
  /** A row's bands, for its scale; a minimum has none. */
  bands?: Bands;
  onChange(v: number): void;
}) {
  const r = SCREEN_CONSTANTS.card.editor.skyMag;
  return (
    <div className="rubric-slider sky-slider">
      <label>
        <span>{label}:</span>
        <input
          type="range"
          min={r.min}
          max={r.max}
          step={r.step}
          value={value}
          aria-valuetext={skyWords(value)}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </label>
      <strong>{skyWords(value)}</strong>
      {bands && (
        <ol className="sky-scale" aria-label="How this item is graded">
          {bands.skyMag.map((m, i) => (
            <li key={i} className={`g-${"ABCD"[i]}`}>
              {"ABCD"[i]} · {skySight(m)}
            </li>
          ))}
        </ol>
      )}
      <span className="tiny muted">
        {SKY_WORDS.measured(bandValue("skyMag", value), !!bands)}{" "}
        <Link href="/help#h-sky">{SKY_WORDS.whatThatMeans}</Link>
      </span>
    </div>
  );
}

/** Polish 2 (W5): "On the starting list." explained nothing to a first-time reader (the household panel's fix, #240). */
const startingWords = (why: string): string =>
  why === WHY_STARTING ? "it's where the starting list puts it." : why;
