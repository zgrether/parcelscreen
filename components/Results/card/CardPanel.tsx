"use client";
/**
 * A card line's slide-in panel (value-ranking.md §6.2; VR5): a side panel on desktop, a sheet from the bottom on
 * phones, over the results column. It opens with the plain question (a), this parcel's reading, and the
 * "How it's scored" line (d); below, under "From the report", the report sections that moved here (§6.1), word for
 * word, each with its own heading and "?" help link.
 */
import { behindTabs } from "@/lib/client/mapShowing";
import { costSummary, summaryText } from "@/lib/report/costLines";
import { CostBreakdown } from "./CostBreakdown";
import { length, lineString } from "@turf/turf";
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { useHelp } from "@/components/Help/HelpDialog";
import { KIND_NAME, type LineMarkup } from "@/lib/client/parcelStore";
import { fmt } from "@/lib/format";
import { digCost, foundationAt, soilUnder } from "@/lib/report/derived";
import { DEFAULT_USER_CONFIG, SCREEN_CONSTANTS } from "@/lib/screen/config";
import { BOTTOMLAND_LEAD, bottomland } from "@/lib/screen/soils";
import type { Card, GateStatus } from "@/lib/report/card";
import { panelText, rulebookHref, type PanelKey } from "@/lib/report/cardPanels";
import { routeChoices } from "@/lib/report/driveway";
import { lineOutcome, type LineNames } from "@/lib/report/lines";
import { meaningsFor } from "@/lib/report/meanings";
import { scalesFor, type Scale } from "@/lib/report/scales";
import { flagsOf } from "@/lib/screen/flags";
import type { Flag, PartialScreenResult, ScreenResult, Step, UserConfig } from "@/lib/screen/types";
import { M2FT } from "@/lib/screen/util";
import { Facts } from "../blocks/shared";
import type { EvaluationPoint } from "../blocks/types";
import { panelSections } from "./panelBlocks";
import { AdjustSection, type AdjustProps } from "./AdjustSection";
import { TryIt, type TryProps } from "./TryIt";
import { SET_ASIDE_READING } from "@/lib/report/adjustWords";

export const FROM_THE_REPORT_NOTE =
  "The original report, kept for reference. Its 'overall' score mixes site quality with build cost; the card above grades quality only.";

const STATUS: Record<GateStatus, string> = {
  pass: "Pass",
  warn: "Warning",
  fail: "Fail",
  unknown: "Unknown",
};

/**
 * Where each step's flags go (owner, #110; v4 records the step): the row or gate they're about. The Grade and verdict
 * panel keeps the full list, in the Verdict section.
 */
const FLAG_PANEL: Record<Step, PanelKey> = {
  dem: "verdict",
  terrain: "homesite",
  soils: "septic",
  sun: "homesite",
  sky: "sky",
  flood: "floodplain",
  padus: "trails",
  near: "easement",
  // Step 11: the drive times' flags go with the ER, which the starting list grades (Town, the groceries, is Don't care).
  drive: "hospital",
  rank: "homesite",
  driveway: "easement",
};

/** A flag's panel: its step's, except the bottomland note, which is about where the house can't go (owner, #114). */
const panelOfFlag = (f: { step: Step | null; t: string }): PanelKey | null =>
  f.t.startsWith(BOTTOMLAND_LEAD) ? "homesite" : f.step ? FLAG_PANEL[f.step] : null;

/** This parcel's reading on the panel's line of the card. */
function reading(key: PanelKey, card: Card): { mark: string; tone: string; text: string } {
  if (key === "verdict")
    return { mark: card.grade ?? "–", tone: `v-${card.verdict.toLowerCase()}`, text: card.reason };
  if (key === "cost") {
    // Step 10: the two lines, as the Grade section shows them.
    const s = costSummary(card.cost, card.rubric.rubric.budgets);
    const text = !s
      ? "Not priced yet."
      : s.kind === "noWay"
        ? `${s.text}.`
        : `${s.lines.map(summaryText).join("; ")}.`;
    // No letter or mark of its own: the lines carry their budgets' marks.
    return { mark: "", tone: "g-none", text };
  }
  // Step 12: set aside on this parcel, with its reason.
  const aside = card.setAside?.find((x) => x.key === key);
  if (aside) return { mark: "–", tone: "g-none", text: SET_ASIDE_READING(aside.reason) };
  const gate = card.gates.find((g) => g.key === key);
  if (gate) return { mark: STATUS[gate.status], tone: `gate ${gate.status}`, text: `${gate.reason}.` };
  const row = card.rows.find((r) => r.key === key);
  // A Don't care row isn't on the card, but its panel can still open (from the URL, or the rulebook's link).
  if (!row) return { mark: "–", tone: "g-none", text: "Don't care: not part of this grade." };
  const note = row.panelNote ? `; ${row.panelNote}` : "";
  return { mark: row.grade ?? "–", tone: `g-${row.grade ?? "none"}`, text: `${row.detail}${note}.` };
}

export function CardPanel({
  panel,
  card,
  result,
  point,
  running,
  noteFor,
  dw = DEFAULT_USER_CONFIG.dw,
  vetoPct = DEFAULT_USER_CONFIG.roadVetoGradePct,
  about,
  lines,
  lineNames,
  adjust = null,
  onClose,
}: {
  panel: PanelKey;
  card: Card;
  result: ScreenResult | PartialScreenResult;
  point: EvaluationPoint | null;
  running?: { step: Step; message?: string };
  /** A note to show above a section (the re-evaluation's), by its slug. */
  noteFor?(slug: string): ReactNode;
  /** The Settings' earthwork rates, for the dig cost; the defaults when absent. */
  dw?: UserConfig["dw"];
  /** The Settings' driveway veto, for the Easement panel's comparison (WF5); the default when absent. */
  vetoPct?: number;
  /** Which parcel, where several are in view (the comparison table, VR6). */
  about?: string;
  /** The parcel's drawn lines, for the Easement panel's "Your lines" (owner, A); the explorer's, not Compare's. */
  lines?: YourLines;
  /** The parcel's names for its drawn lines, for the report's sentences (owner, 2026-10-14); `card` uses the same. */
  lineNames?: LineNames;
  /** Step 12: Adjust for this parcel, where it applies (AdjustSection.tsx adjustPropsFor). */
  adjust?: AdjustProps | null;
  onClose(): void;
}) {
  const help = useHelp();
  const close = useRef<HTMLButtonElement>(null);
  // The viewer's own bands and weight, as the card grades them (step 11: a new factor weighs 0 on the starting list,
  // so the starting list's numbers misled).
  const t = panelText(panel, { ...SCREEN_CONSTANTS.card, rows: card.rubric.rubric.bands }, undefined, {
    rubric: card.rubric.rubric,
    rubrics: [card.rubric],
  });
  const r = reading(panel, card);

  // Esc closes; focus goes to the close button, and back to what opened the panel afterwards.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      // Not the map's panel while another tab is showing (step 4b): Compare's and the list's still close.
      if (e.key === "Escape" && !behindTabs(close.current)) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      before?.focus?.();
    };
  }, [panel, onClose]);

  return (
    <div className="card-panel" role="dialog" aria-labelledby="card-panel-title" data-panel={panel}>
      <header className="card-panel-head">
        <h2 id="card-panel-title">
          {t.title}
          {about && <small className="card-panel-about"> · {about}</small>}
        </h2>
        <button ref={close} className="icon-btn" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </header>
      <div className="card-panel-body">
        <p className="panel-question">{t.question}</p>
        <p className="panel-reading">
          {r.mark && <span className={`card-grade small ${r.tone}`}>{r.mark}</span>} {r.text}
        </p>
        {/* Each scale with its own sentences under it (owner, #113 review). */}
        {scalesFor(panel, result, card).map((sc) => (
          <div key={sc.name} className="scale-group">
            <ScaleBar scale={sc} />
            <WhatItMeans scale={sc} />
          </div>
        ))}
        {panel === "homesite" && <BuildingHere result={result} dw={dw} />}
        {panel === "septic" && <BottomlandHere result={result} />}
        {(panel === "cost" || panel === "budget") && <CostBreakdown cost={card.cost} />}
        {panel === "easement" && (
          <YourRouteChoice
            result={result}
            names={lineNames}
            scored={card.drivewayLine ?? null}
            vetoPct={vetoPct}
            choose={lines?.choose}
            tryIt={lines?.tryIt}
          />
        )}
        {panel === "easement" && lines && lines.markup.length > 0 && (
          <YourLinesList
            result={result}
            lines={lines}
            chosen={card.drivewayLine ?? null}
            routing={!!running && !result.driveway}
          />
        )}
        <PanelFlags flags={flagsOf(result).filter((f) => panel !== "verdict" && panelOfFlag(f) === panel)} />
        {adjust && <AdjustSection key={panel} {...adjust} />}
        <p className="tiny muted panel-scored">
          {/* To this panel's section of the rulebook, in the app: Back returns to the map with the report open. */}
          <Link href={rulebookHref(panel)}>How it&apos;s scored</Link>: {t.howScored}
          {/* Step 3: after the weight line, where to change it (added, rule 7). */}
          {panel !== "verdict" && panel !== "cost" && (
            <>
              {" "}
              <Link href="/priorities">Change it in What matters to you</Link>
            </>
          )}
        </p>
        {panelSections(panel).length > 0 && (
          <>
            <h3 className="panel-from">From the report</h3>
            {/* Owner's wording (#111): added above the moved sections, nothing replaced. */}
            <p className="tiny muted panel-from-note">{FROM_THE_REPORT_NOTE}</p>
          </>
        )}
        {panelSections(panel).map(({ Block, heading }) => {
          const body = Block({
            result,
            point,
            variant: "panel",
            running,
            lineNames,
            drivewayLine: card.drivewayLine ?? null,
            ...(card.paving ? { paving: card.paving } : {}),
          });
          if (body === null) return null;
          const h = heading(result, point);
          return (
            <section key={h.slug} className="block panel-block" data-key={h.slug}>
              <h3>
                {h.title}
                {h.sub && <small>{h.sub}</small>}
                <button
                  className="help-link"
                  title="What does this mean?"
                  aria-label={`What does ${h.title} mean?`}
                  onClick={() => help(h.help)}
                >
                  ?
                </button>
              </h3>
              {noteFor?.(h.slug)}
              {body}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** A banded scale (§6.2 (b)): the bands in a row, this parcel's lit, and its value under it. The rulebook reuses it. */
export function ScaleBar({ scale }: { scale: Scale }) {
  const n = scale.bands.length;
  return (
    <figure className="scale" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
      <figcaption className="scale-name">{scale.name}</figcaption>
      {scale.bands.map((b, i) => (
        <span
          key={b}
          className={i === scale.at ? "scale-band on" : "scale-band"}
          aria-current={i === scale.at}
        >
          {b}
        </span>
      ))}
      {scale.at !== null && (
        <div className="scale-mark" style={{ gridColumn: scale.at + 1 }}>
          ▲ {scale.value}
        </div>
      )}
      {scale.note && <div className="scale-note">{scale.note}</div>}
      {scale.marks && (
        // Where each grade starts along the scale (#118 review).
        <div className="scale-marks" aria-label="Grades">
          {scale.marks.map((m) => (
            <span key={m.label} className="scale-tick" style={{ left: `${(m.at / n) * 100}%` }}>
              {m.label}
            </span>
          ))}
        </div>
      )}
    </figure>
  );
}

/** "What it means for you" (§6.2 (c)): a scale's sentences for this parcel's band, by what they touch. */
function WhatItMeans({ scale }: { scale: Scale }) {
  const lines = meaningsFor(scale.id, scale.at);
  if (!lines.length) return null;
  return (
    <section className="panel-meaning" aria-label={`What ${scale.name.toLowerCase()} means for you`}>
      <h4>What it means for you</h4>
      <ul>
        {lines.map((l, i) => (
          <li key={i}>
            {l.for && <b>{l.for}: </b>}
            {l.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * At site #1 (value-ranking.md §5.1–5.2; VR3b): the foundation the ground calls for, and what a basement would cost
 * to dig at the Settings' rates, in soil and with the rock where NRCS puts it. Stage 3 (VR4) prices both.
 */
function BuildingHere({ result, dw }: { result: ScreenResult | PartialScreenResult; dw: UserConfig["dw"] }) {
  const site = result.sites?.[0];
  if (!site) return null;
  const soil = soilUnder(result, site.ll);
  const f = foundationAt(site.slopeDeg, soil);
  const dig = digCost(soil, dw);
  const rockLine =
    dig.rockCm === null
      ? "NRCS doesn't give the depth to rock here"
      : dig.withRock > dig.allSoil
        ? `about $${fmt(dig.withRock)} with the rock at ${fmt(dig.rockCm)} cm, $${fmt(dig.withRock - dig.allSoil)} more`
        : `the rock is below it (${fmt(dig.rockCm)} cm)`;
  return (
    <section className="panel-derived">
      <p>
        <b>Foundation at site #1:</b> {f.type.toLowerCase()}
        {f.shallowRock && ` (rock within ${SCREEN_CONSTANTS.foundationType.shallowRockCm} cm)`}
        {f.engineered && "; engineered design, since NRCS rates this soil very limited for houses"}.
      </p>
      <p>
        <b>A basement there</b>
        {` (${fmt(SCREEN_CONSTANTS.basement.footprintSqFt)} sq ft, ${SCREEN_CONSTANTS.basement.depthFt} ft deep): `}
        {`about $${fmt(dig.allSoil)} to dig in soil; ${rockLine}.`}
      </p>
    </section>
  );
}

/** The Septic panel's pointer when the build site's own soil is bottomland (owner, #114). */
function BottomlandHere({ result }: { result: ScreenResult | PartialScreenResult }) {
  const h = result.house;
  const ll = h && !("outside" in h) ? h.ll : result.sites?.[0]?.ll;
  const soil = ll ? soilUnder(result, ll) : null;
  const why = soil ? bottomland(soil) : null;
  return why ? (
    <p className="panel-derived">The build site&apos;s own soil is bottomland ({why}): see Best homesite.</p>
  ) : null;
}

/** The flags this row's step raised (owner, #110), as the Verdict section shows them. */
function PanelFlags({ flags }: { flags: Flag[] }) {
  if (!flags.length) return null;
  return (
    <section className="panel-flags verdict">
      {flags.map((f, i) => (
        <div key={i} className={`flag ${f.lvl}`}>
          {f.t}
        </div>
      ))}
    </section>
  );
}

/** The parcel's drawn lines, with what can be done to each (owner, A). Its markers (WF4) aren't lines: not listed. */
export interface YourLines {
  markup: readonly LineMarkup[];
  onEdit(id: string): void;
  onDelete(id: string): void;
  /** Scores a line's route as the driveway, or the app's pick again (null) (WF5). */
  choose?(lineId: string | null): void;
  /** Step 12 (owner, #281 answer): Try it beside Use as my driveway, for every drawn line. */
  tryIt?: TryProps;
}

/**
 * "Your route and the app's pick" (owner, WF5; docs/plans/parcel-workflow.md §3.4): side by side (stacked on a phone),
 * with a button under each to score it, where the parcel's lines can be changed. Nothing when no drawn line has a route.
 */
function YourRouteChoice({
  result,
  names,
  scored,
  vetoPct,
  choose,
  tryIt,
}: {
  result: ScreenResult | PartialScreenResult;
  names?: LineNames;
  scored: string | null;
  vetoPct: number;
  choose?(lineId: string | null): void;
  tryIt?: TryProps;
}) {
  const cols = routeChoices(result, names, scored, vetoPct);
  if (!cols) return null;
  return (
    <section className="block panel-block route-choice">
      <h3>Your route and the app&apos;s pick</h3>
      <div className="route-choice-cols">
        {cols.map((c) => (
          <div key={c.line ?? "pick"} className={c.scored ? "route-choice-col scored" : "route-choice-col"}>
            <b>{c.title}</b>
            <Facts rows={c.rows} />
            {c.scored ? (
              <span className="tiny muted">Scored on the card</span>
            ) : (
              choose && (
                <button className="btn small" onClick={() => choose(c.line)}>
                  {c.line ? "Use as my driveway" : "Use the app's pick"}
                </button>
              )
            )}
            {/* Step 12: the line tried as the driveway, its drives re-timed; kept only with Use it. */}
            {c.line && tryIt && <TryIt line={c.line} {...tryIt} />}
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * "Your lines" (owner, A, 2026-10-13): each drawn line by name (#127), with its kind, condition and length, what the run made of it
 * (lineOutcome: used, or considered and why not), and Edit (selects it in the Layers tree) and Delete.
 */
/** "Your lines" while a run is still routing the driveway (owner, #127 testing). */
export const WAITING_FOR_THE_DRIVEWAY = "Waiting for the driveway route…";

function YourLinesList({
  result,
  lines,
  chosen,
  routing,
}: {
  result: ScreenResult | PartialScreenResult;
  lines: YourLines;
  /** The line whose route the card scores (WF5): its outcome is "used". */
  chosen: string | null;
  /** A run is in progress and hasn't routed the driveway yet: no outcome to say. */
  routing: boolean;
}) {
  return (
    <section className="block panel-block your-lines">
      <h3>Your lines</h3>
      <ul>
        {lines.markup.map((m) => {
          const at = result.lines?.findIndex((l) => l.id === m.id) ?? -1;
          const outcome = at >= 0 ? lineOutcome(result, at, m.name, chosen) : null;
          const ft = length(lineString(m.line.map(([lat, lon]) => [lon, lat])), { units: "meters" }) * M2FT;
          return (
            <li key={m.id}>
              <div className="your-line-head">
                <span>
                  <b>{m.name}</b>{" "}
                  <span className="tiny">
                    {KIND_NAME[m.kind]}, {m.condition}, {Math.round(ft).toLocaleString()} ft
                  </span>
                </span>
                <span>
                  <button className="btn small secondary" onClick={() => lines.onEdit(m.id)}>
                    Edit
                  </button>{" "}
                  <button className="btn small secondary" onClick={() => lines.onDelete(m.id)}>
                    Delete
                  </button>
                </span>
              </div>
              <p className="tiny">
                {routing
                  ? WAITING_FOR_THE_DRIVEWAY
                  : (outcome ?? "Drawn after this screen: run again to see what the app makes of it.")}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
