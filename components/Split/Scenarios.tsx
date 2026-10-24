"use client";
/**
 * "Keep this, sell that" (step 14, docs/plans/step-14-land-uses.md §5, §8): the open parcel's split scenarios, on Uses.
 * Each scenario's two pieces side by side (stacked on a phone), each with its name and acres, then one row per figure
 * (its grade under the person's own rubric, its cost to camp and to build with no land price, its county check), What you
 * can do here folded, and Add this piece to the list. Rename, Adjust the line (it re-grades) and Remove scenario act on
 * the scenario. While its pieces grade: "Grading piece 1 of 2…" with Cancel; a piece without a screen: "This piece
 * didn't grade", with Try again.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ScreenIt } from "@/components/Results/panel/ScreenIt";
import { UseRow } from "@/components/Parcel/UseRow";
import { useCostSettings } from "@/lib/client/costRates";
import type { Scenario, WorkingParcel } from "@/lib/client/parcelStore";
import { switchLabel } from "@/lib/client/rubrics";
import { readScreen } from "@/lib/client/screenStore";
import { reportCard } from "@/lib/report/card";
import { drawnOf } from "@/lib/report/marks";
import type { NamedRubric } from "@/lib/rubric/types";
import type { PartialScreenResult } from "@/lib/screen/types";
import { pieceCountyCheck } from "@/lib/split/countyCheck";
import { pieceRows } from "@/lib/split/pieceRows";
import { PIECE_SIDES, piecesOf, type Piece, type PieceSide } from "@/lib/split/scenario";
import { SPLIT_WORDS } from "@/lib/split/words";
import { landUses } from "@/lib/uses";
import { usesInputOf } from "@/lib/uses/input";
import { USE_WORDS } from "@/lib/uses/words";
import { useScenarioGradingContext, type ScenarioGrading } from "./useScenarioGrading";

/** "Grading piece 1 of 2…": the left piece is the first. */
const placeOf = (side: PieceSide): number => PIECE_SIDES.indexOf(side) + 1;

/** The kept screens with these ids, read back as they're kept: a result, or null when it's gone or unreadable. */
function useResults(ids: readonly (string | null)[]): ReadonlyMap<string, PartialScreenResult | null> {
  const [found, setFound] = useState<ReadonlyMap<string, PartialScreenResult | null>>(new Map());
  const sig = ids.filter(Boolean).join(",");
  useEffect(() => {
    let alive = true;
    const want = sig ? sig.split(",") : [];
    void Promise.all(
      want.map(async (id): Promise<[string, PartialScreenResult | null]> => {
        const r = await readScreen(id);
        return [id, r.kind === "ok" ? r.record.result : null];
      }),
    ).then((entries) => alive && setFound(new Map(entries)));
    return () => {
      alive = false;
    };
  }, [sig]);
  return found;
}

export function Scenarios({ s }: { s: ScreenIt }) {
  const grading = useScenarioGradingContext();
  const open = s.ctl.state.store.open;
  if (!open?.scenarios.length) return null;
  // Owner, after #312: the pieces grade under the rubric the grade switch shows, as the card does (it was the profile's
  // own, §13 Q7).
  const mine = s.rubric;
  return (
    <section className="scn-list" aria-label={SPLIT_WORDS.section}>
      <h3 className="uses-head">{SPLIT_WORDS.section}</h3>
      {open.scenarios.map((sc) => (
        <ScenarioView
          key={sc.id}
          s={s}
          open={open}
          sc={sc}
          mine={mine}
          grading={grading}
          parentCounty={s.shown?.result.county}
        />
      ))}
    </section>
  );
}

function ScenarioView({
  s,
  open,
  sc,
  mine,
  grading,
  parentCounty,
}: {
  s: ScreenIt;
  open: WorkingParcel;
  sc: Scenario;
  mine: NamedRubric;
  grading: ScenarioGrading;
  parentCounty: PartialScreenResult["county"];
}) {
  const ctl = s.ctl;
  const serial = ctl.state.serial;
  const { pieces: parts, markup, house, drivewayLine } = open;
  const pieces = useMemo(
    () => piecesOf(open, sc),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- what a piece is graded with: the parts, marks, house, line
    [parts, markup, house, drivewayLine, sc.a, sc.b],
  );
  const results = useResults([sc.screens.left, sc.screens.right]);
  const box = useRef<HTMLElement>(null);
  const [renaming, setRenaming] = useState(false);
  const mineNow = grading.grading?.id === sc.id ? grading.grading : null;
  // A grade starting here brings the scenario into view (after Uses has scrolled to its top).
  const startedHere = mineNow !== null;
  useEffect(() => {
    if (!startedHere) return;
    const raf = requestAnimationFrame(() => box.current?.scrollIntoView?.({ block: "start" }));
    return () => cancelAnimationFrame(raf);
  }, [startedHere]);

  const save = (name: string) => {
    setRenaming(false);
    ctl.renameScenario(sc.id, name, serial);
  };
  return (
    <article ref={box} className="scn" aria-label={sc.name}>
      <div className="scn-head">
        {renaming ? (
          <input
            className="field scn-rename"
            aria-label={SPLIT_WORDS.rename}
            defaultValue={sc.name}
            autoFocus
            onBlur={(e) => save(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save(e.currentTarget.value);
              if (e.key === "Escape") {
                e.preventDefault();
                setRenaming(false);
              }
            }}
          />
        ) : (
          <h4 className="scn-name">{sc.name}</h4>
        )}
        <span className="scn-actions">
          <button type="button" className="btn small secondary" onClick={() => setRenaming(true)}>
            {SPLIT_WORDS.rename}
          </button>
          <button type="button" className="btn small secondary" onClick={() => ctl.startSplit(sc.id)}>
            {SPLIT_WORDS.adjust}
          </button>
          <button
            type="button"
            className="btn small secondary scn-remove"
            onClick={() => {
              if (mineNow) grading.cancel();
              ctl.removeScenario(sc.id, serial);
            }}
          >
            {SPLIT_WORDS.remove}
          </button>
        </span>
      </div>
      {pieces ? (
        <div className="scn-pieces">
          {pieces.map((piece) => {
            const id = sc.screens[piece.side];
            return (
              <PieceView
                key={piece.side}
                s={s}
                sc={sc}
                piece={piece}
                result={id ? (results.get(id) ?? null) : null}
                reading={!!id && !results.has(id)}
                mine={mine}
                parentCounty={parentCounty}
                grading={
                  mineNow?.sides.includes(piece.side)
                    ? mineNow.current === piece.side
                      ? "now"
                      : "next"
                    : null
                }
                cancel={grading.cancel}
              />
            );
          })}
        </div>
      ) : (
        <p className="muted scn-note">
          The cut no longer crosses the boundary (a part it went through was taken out), so it&apos;s left
          off.
        </p>
      )}
    </article>
  );
}

function PieceView({
  s,
  sc,
  piece,
  result,
  reading,
  mine,
  parentCounty,
  grading,
  cancel,
}: {
  s: ScreenIt;
  sc: Scenario;
  piece: Piece;
  result: PartialScreenResult | null;
  /** Its screen is being read back. */
  reading: boolean;
  mine: NamedRubric;
  parentCounty: PartialScreenResult["county"];
  /** Being graded now, waiting its turn, or neither. */
  grading: "now" | "next" | null;
  cancel(): void;
}) {
  const ctl = s.ctl;
  const costs = useCostSettings();
  const open = ctl.state.store.open;
  const deedRestrictions = open?.deedRestrictions ?? "",
    hoa = open?.hoa ?? "unknown";
  const g = piece.parcel;
  const shown = grading === null ? result : null;
  const view = useMemo(() => {
    if (!shown) return null;
    // No land price (§13 Q7): the costs read "plus the land".
    const drawn = drawnOf(g.markup, g.drivewayLine, { askingPrice: null, ...costs });
    const card = reportCard(shown, mine, drawn);
    const check = pieceCountyCheck(shown, parentCounty);
    const uses = landUses(usesInputOf(shown, card, drawn, { markup: g.markup, deedRestrictions, hoa }));
    return { rows: pieceRows(card, check, switchLabel(mine)), uses };
  }, [shown, g, costs, mine, parentCounty, deedRestrictions, hoa]);

  const title = SPLIT_WORDS.piece(piece.word, piece.acres);
  return (
    <section className="scn-piece" aria-label={title}>
      <h5 className="scn-piece-name">{title}</h5>
      {grading === "now" ? (
        <p className="scn-status" role="status">
          <span>{SPLIT_WORDS.grading(placeOf(piece.side))}</span>
          <button type="button" className="btn small secondary" onClick={cancel}>
            Cancel
          </button>
        </p>
      ) : grading === "next" || reading ? (
        <ul className="scn-rows" aria-busy="true">
          <li className="scn-row loading">
            <span className="use-bar" />
          </li>
        </ul>
      ) : view ? (
        <>
          <ul className="scn-rows">
            {view.rows.map((r) => (
              <li key={r.key} className={`scn-row${r.tone ? ` ${r.tone}` : ""}`} data-row={r.key}>
                <span className="scn-label">{r.label}</span>
                <span className="scn-value">
                  {r.grade !== undefined && (
                    <span className={`card-grade small g-${r.grade ?? "none"}`}>{r.grade ?? "–"}</span>
                  )}{" "}
                  {r.value}
                </span>
              </li>
            ))}
          </ul>
          <details className="scn-uses">
            <summary>{USE_WORDS.section}</summary>
            <ul className="uses-list">
              {view.uses.uses.map((u) => (
                <UseRow key={u.key} name={u.name} a={u.answer} />
              ))}
            </ul>
          </details>
        </>
      ) : (
        <p className="scn-status">
          <span>{SPLIT_WORDS.failed}</span>
          <button
            type="button"
            className="btn small secondary"
            onClick={() => ctl.regradePieces(sc.id, [piece.side])}
          >
            {SPLIT_WORDS.tryAgain}
          </button>
        </p>
      )}
      {/* Once it's graded (or didn't grade): a piece added mid-grade would come without its screen. */}
      {grading === null && (
        <button type="button" className="btn small scn-add" onClick={() => ctl.addPiece(sc.id, piece.side)}>
          {SPLIT_WORDS.add}
        </button>
      )}
    </section>
  );
}
