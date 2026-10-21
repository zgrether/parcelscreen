/**
 * Best homesite and the alternatives (step 7 plan §1.2–§1.3): the site the person's grade is taken at, with the four
 * or five numbers that matter most to their rubric among the rows that differ from site to site; up to two real
 * alternatives (within 10 points, 100 m apart); the rest behind "N more sites". Tapping a site evaluates it on the map,
 * as its pin does. A marked house is the build site, so it shows here instead.
 *
 * Polish (8b's review): one word, "sites"; the best site's name flies the map to its pin (#3); each other site shows its
 * place in the person's order apart from its pin's number, and the same numbers as every other site (#8).
 */
"use client";
import { useState } from "react";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";
import type { Card, Row } from "@/lib/report/card";
import type { PanelKey } from "@/lib/report/cardPanels";
import { choicesBeside, metresBetween, SITE_ROWS, type RankedSite } from "@/lib/report/sites";
import { evaluationPoint } from "@/lib/report/point";
import { weightsOf } from "@/lib/rubric/weights";
import type { RowKey } from "@/lib/rubric/types";
import type { LatLon } from "@/lib/geo/types";
import type { PartialScreenResult } from "@/lib/screen/types";

/** Each site number's name, short. */
export const SITE_NUMBER: Record<RowKey, string> = {
  elevation: "Elevation",
  homesite: "Winter sun",
  sky: "Night sky",
  room: "Room to build",
  driveway: "Driveway",
  trails: "Trails",
  town: "Town",
  garden: "Garden",
  budget: "Budget",
};

const label = (rank: number) => `site #${rank}`;
const title = (rank: number) => `Site #${rank}`;

/** The value as the number shows it: the row's short value; the driveway with its length. */
const valueOf = (r: Row): string => (r.key === "driveway" ? r.detail : (r.short ?? r.detail));

/**
 * The numbers that matter most to this rubric (plan §1.2): the site rows it ranks, heaviest first, up to `n`; fewer
 * than four, and the others fill in, in the card's order, without their letter.
 */
export function topNumbers(rows: readonly Row[], card: Card, n = SCREEN_CONSTANTS.card.sites.numbers) {
  const w = weightsOf(card.rubric.rubric);
  const counts = (k: RowKey) => card.rubric.rubric.ranked.some((c) => c.factor === k) && w[k] > 0;
  const site = rows.filter((x) => SITE_ROWS.includes(x.key));
  const ranked = site
    .filter((x) => counts(x.key))
    .sort((a, b) => w[b.key] - w[a.key] || SITE_ROWS.indexOf(a.key) - SITE_ROWS.indexOf(b.key))
    .slice(0, n);
  const fill = ranked.length < 4 ? site.filter((x) => !counts(x.key)).slice(0, 4 - ranked.length) : [];
  return [...ranked.map((row) => ({ row, graded: true })), ...fill.map((row) => ({ row, graded: false }))];
}

/** The numbers every other site shows, the same for each (polish #8): the best's graded ones, heaviest first, up to 3. */
function sharedKeys(best: readonly Row[], card: Card): RowKey[] {
  return topNumbers(best, card)
    .filter((x) => x.graded)
    .slice(0, 3)
    .map((x) => x.row.key);
}

/** 2 → "2nd": a site's place in the person's order. */
export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const end = teen ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${end}`;
}

function Numbers({ rows, card, onOpen }: { rows: readonly Row[]; card: Card; onOpen(key: PanelKey): void }) {
  return (
    <ul className="site-numbers">
      {topNumbers(rows, card).map(({ row, graded }) => (
        <li key={row.key}>
          <button className="site-number" onClick={() => onOpen(row.key)}>
            {graded && (
              <span className={`card-grade small g-${row.grade ?? "none"}`}>{row.grade ?? "–"}</span>
            )}
            <span className="sn-name">{SITE_NUMBER[row.key]}</span>
            <span className="sn-value">{valueOf(row)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function SiteRow({
  s,
  place,
  behind,
  keys,
  pick,
}: {
  s: RankedSite;
  /** Its place in the person's order: 2 for the second best. */
  place: number;
  behind: number | null;
  keys: readonly RowKey[];
  pick(s: RankedSite): void;
}) {
  const rows = keys.map((k) => s.rows.find((x) => x.key === k)).filter((x): x is Row => !!x);
  return (
    <li>
      <button className="site-row" onClick={() => pick(s)} aria-label={`Show ${label(s.rank)} on the map`}>
        <span className="spot-head">
          <span className="spot-choice">{ordinal(place)}</span>
          <span className="spot-name">{title(s.rank)}</span>
          {behind !== null && (
            <span className="spot-behind">
              {behind <= 0 ? "as good" : `${behind} ${behind === 1 ? "point" : "points"} behind`}
            </span>
          )}
        </span>
        <span className="spot-numbers">
          {rows.map((r) => (
            <span key={r.key} className="spot-number">
              <span className={`card-grade small g-${r.grade ?? "none"}`}>{r.grade ?? "–"}</span>
              {SITE_NUMBER[r.key]} {valueOf(r)}
            </span>
          ))}
        </span>
      </button>
    </li>
  );
}

export interface SitePick {
  ll: LatLon;
  label: string;
}

export function BestHomesite({
  card,
  result,
  running,
  showing,
  onOpen,
  pick,
  back,
  show,
}: {
  card: Card;
  result: PartialScreenResult;
  running: boolean;
  /** The site the map is showing when it isn't the best (an evaluation's label, "site #5"), else null. */
  showing: string | null;
  onOpen(key: PanelKey): void;
  /** Shows a site on the map: evaluates there with the live session, as its pin does. */
  pick(p: SitePick): void;
  /** Back to the best site's evaluation. */
  back(): void;
  /** Brings a point into view on the map, without evaluating there. */
  show(ll: LatLon): void;
}) {
  const [more, setMore] = useState(false);
  const house = !!result.house && !("outside" in result.house);
  const best = house ? null : (card.sites[0] ?? null);
  const head = <h3 className="card-sub">{house ? "Your marked house" : "Best homesite"}</h3>;
  if (!house && !best) {
    return (
      <section className="best-site" aria-label="Best homesite">
        {head}
        <p className="tiny muted">{running ? "Finding homesites…" : "No homesite found on this parcel."}</p>
      </section>
    );
  }
  const bestRows = house ? card.rows : best!.rows;
  const anchor = house
    ? { ll: (result.house as { ll: LatLon }).ll, score: null, fails: 0, index: null }
    : { ll: best!.ll, score: best!.score, fails: best!.fails.length, index: best!.index };
  const choices = choicesBeside(card.sites, anchor);
  const behind = (s: RankedSite) =>
    anchor.score !== null && s.score !== null ? Math.round(anchor.score - s.score) : null;
  const onPick = (s: RankedSite) => pick({ ll: s.ll, label: label(s.rank) });
  const bestLabel = best ? label(best.rank) : null;
  // Owner, #216: the sun, sky and driveway sections are evaluated where the screen ran. Evaluating the best site there
  // re-routes its driveway (lib/screen/index.ts evaluateAt), which isn't done unasked: the line says so and offers it.
  const at = evaluationPoint(result);
  const elsewhere = !house && !showing && !!best && !!at && metresBetween(at.ll, best.ll) > 1;
  // Where the screen ran, by its pin's number when it's a ranked site (the engine's own label is "the largest house site").
  const ranAt = at && card.sites.find((s) => metresBetween(s.ll, at.ll) <= 1);
  const ranLabel = ranAt ? label(ranAt.rank) : at?.label;
  const keys = sharedKeys(bestRows, card);
  const place = (s: RankedSite) => card.sites.indexOf(s) + 1;
  return (
    <section className="best-site" aria-label={house ? "Your marked house" : "Best homesite"}>
      {head}
      <p className="best-site-name">
        {house ? (
          "Where you marked the house"
        ) : (
          <button className="link-btn" title="Show its pin on the map" onClick={() => show(best!.ll)}>
            {title(best!.rank)}
          </button>
        )}
      </p>
      <Numbers rows={bestRows} card={card} onOpen={onOpen} />
      {elsewhere && (
        <p className="best-site-showing" role="status">
          <span>The map&apos;s sun, sky and driveway are for {ranLabel}, where the screen ran.</span>
          <button className="btn small secondary" onClick={() => onPick(best!)}>
            Evaluate {bestLabel}
          </button>
        </p>
      )}
      {showing && showing !== bestLabel && (
        <p className="best-site-showing" role="status">
          <span>Showing {showing} on the map</span>
          <button className="btn small secondary" onClick={back}>
            {house ? "Back to the house" : "Back to the best site"}
          </button>
        </p>
      )}
      {choices.alternatives.length > 0 && (
        <div className="other-spots" role="group" aria-label="Other sites">
          <h3 className="card-sub">Other sites</h3>
          <ul className="site-rows">
            {choices.alternatives.map((s) => (
              <SiteRow key={s.index} s={s} place={place(s)} behind={behind(s)} keys={keys} pick={onPick} />
            ))}
          </ul>
        </div>
      )}
      {choices.more.length > 0 && (
        <div className="more-spots">
          <button
            className="link-btn more-spots-toggle"
            aria-expanded={more}
            onClick={() => setMore((v) => !v)}
          >
            {choices.more.length} more {choices.more.length === 1 ? "site" : "sites"} {more ? "▾" : "▸"}
          </button>
          {more && (
            <ul className="site-rows">
              {choices.more.map((s) => (
                <SiteRow key={s.index} s={s} place={place(s)} behind={behind(s)} keys={keys} pick={onPick} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
