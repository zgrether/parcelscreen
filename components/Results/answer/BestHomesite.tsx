/**
 * Best homesite and the alternatives (step 7 plan §1.2–§1.3): the site the person's grade is taken at, with the four
 * or five numbers that matter most to their rubric among the rows that differ from site to site; up to two real
 * alternatives (within 10 points, 100 m apart); the rest behind "N more spots". Tapping a site evaluates it on the map,
 * as its pin does. A marked house is the build site, so it shows here instead.
 */
"use client";
import { useState } from "react";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";
import type { Card, Row } from "@/lib/report/card";
import type { PanelKey } from "@/lib/report/cardPanels";
import { choicesBeside, SITE_ROWS, type RankedSite } from "@/lib/report/sites";
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

/** The rows of `s` that differ most from the best's, by this rubric's weights: what makes it a different choice. */
function differing(s: RankedSite, best: readonly Row[], card: Card): Row[] {
  const w = weightsOf(card.rubric.rubric);
  const other = (k: RowKey) => best.find((x) => x.key === k);
  const diff = s.rows.filter((x) => w[x.key] > 0 && other(x.key)?.grade !== x.grade);
  const rows = (diff.length ? diff : s.rows.filter((x) => w[x.key] > 0)).sort((a, b) => w[b.key] - w[a.key]);
  return rows.slice(0, 3);
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
  behind,
  best,
  card,
  pick,
}: {
  s: RankedSite;
  behind: number | null;
  best: readonly Row[];
  card: Card;
  pick(s: RankedSite): void;
}) {
  const rows = differing(s, best, card);
  return (
    <li>
      <button className="site-row" onClick={() => pick(s)} aria-label={`Show ${label(s.rank)} on the map`}>
        <span className="spot-head">
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
  return (
    <section className="best-site" aria-label={house ? "Your marked house" : "Best homesite"}>
      {head}
      <p className="best-site-name">
        {house ? "Where you marked the house" : title(best!.rank)}
        {!house && <span className="tiny muted"> · its pin is ringed on the map</span>}
      </p>
      <Numbers rows={bestRows} card={card} onOpen={onOpen} />
      {showing && showing !== bestLabel && (
        <p className="best-site-showing" role="status">
          <span>Showing {showing} on the map</span>
          <button className="btn small secondary" onClick={back}>
            {house ? "Back to the house" : "Back to the best site"}
          </button>
        </p>
      )}
      {choices.alternatives.length > 0 && (
        <div className="other-spots" role="group" aria-label="Other spots">
          <h3 className="card-sub">Other spots</h3>
          <ul className="site-rows">
            {choices.alternatives.map((s) => (
              <SiteRow key={s.index} s={s} behind={behind(s)} best={bestRows} card={card} pick={onPick} />
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
            {choices.more.length} more {choices.more.length === 1 ? "spot" : "spots"} {more ? "▾" : "▸"}
          </button>
          {more && (
            <ul className="site-rows">
              {choices.more.map((s) => (
                <SiteRow key={s.index} s={s} behind={behind(s)} best={bestRows} card={card} pick={onPick} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
