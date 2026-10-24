"use client";
/**
 * The suggestion box (step 13, docs/plans/step-13-area-catalog.md §4.4, §6): the five areas that fit the person
 * best, each with its fit letter, the share of its land passing their must-haves, why it fits and its trade-off, and
 * "Show me a parcel here"; Show more ranks the rest. Each household member's own ranking is a tap away (the rubric
 * switch). After the interview it's "Areas that fit you"; on the map with nothing open, "Where to look".
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { bbox } from "@turf/turf";
import { RubricSwitch } from "@/components/Results/card/RubricSwitch";
import { areaCard, areaLimits, rankAreas, rankOf, regionWideLimit, type AreaCard } from "@/lib/areas/score";
import type { AreaFile } from "@/lib/areas/types";
import {
  AREA_WORDS as W,
  holdsBack,
  MUSTS_PARCEL_SCALE,
  mustShareParts,
  notSuggestedReason,
  rankLine,
  regionLine,
  SAMPLE_WORDS,
  tradeOffLine,
  whyLine,
} from "@/lib/areas/words";
import { openSample } from "@/lib/client/samples";
import { focusArea, useAreas, useAreaStars, type Box } from "@/lib/client/areas";
import { useRubricView } from "@/lib/client/useRubricView";

const TOP = 5;

export function AreaBox({
  where,
  onShow,
}: {
  where: "interview" | "map";
  /** After an area is shown: a phone's search box closes, so the map can be seen. */
  onShow?: () => void;
}) {
  const { rubrics, rubric, setRubric } = useRubricView();
  const areas = useAreas();
  const { stars, toggle } = useAreaStars();
  const [more, setMore] = useState(false);
  const router = useRouter();
  const byId = useMemo(() => new Map(areas.files.map((f) => [f.id, f])), [areas.files]);
  const ranked = useMemo(
    () =>
      rankAreas(
        areas.files.map((f) => areaCard(f, rubric)),
        new Map(areas.files.map((f) => [f.id, f.name])),
      ),
    [areas.files, rubric],
  );
  const top = ranked.filter((c) => c.suggestable).slice(0, TOP);
  const rest = ranked.filter((c) => !top.includes(c));
  // Owner, 10/23: every area's place for this person, and a Must that rules out most of the region.
  const ranks = useMemo(() => rankOf(ranked), [ranked]);
  const regionWide = useMemo(() => regionWideLimit(ranked), [ranked]);
  const title = where === "interview" ? W.afterInterview : W.onTheMap;

  const [failed, setFailed] = useState<string | null>(null);
  // Show me a parcel here (§5): the area's first sample, on the map; the area itself when the sample won't load.
  const show = async (f: AreaFile) => {
    setFailed(null);
    try {
      await openSample(f.id, 1);
    } catch {
      setFailed(f.id);
      focusArea(bbox(f.outline) as Box);
    }
    if (where === "interview") router.push("/explore");
    onShow?.();
  };
  // No must-have an area can measure: said once, not on every card.
  const parcelScale = areaLimits(rubric.rubric).length === 0;

  return (
    <section className={`area-box area-box-${where}`} aria-label={title}>
      <h2 className="area-box-title">{title}</h2>
      <RubricSwitch
        rubrics={rubrics}
        current={rubric.id}
        setRubric={setRubric}
        label="Whose priorities rank the areas"
      />
      <p className="area-note tiny muted">{W.ranked}</p>
      {parcelScale && <p className="area-note tiny muted">{MUSTS_PARCEL_SCALE}</p>}
      {regionWide && <RegionLine limit={regionWide} />}
      {areas.state !== "ready" ? (
        <ol className="area-cards" aria-busy="true">
          {Array.from({ length: TOP }, (_, i) => (
            <li key={i} className="area-card skeleton" aria-hidden="true" />
          ))}
        </ol>
      ) : (
        <>
          {areas.failed.length > 0 && (
            <p className="area-failed" role="status">
              {W.failed(areas.failed.length)}{" "}
              <button type="button" className="link-btn" onClick={areas.retry}>
                {W.tryAgain}
              </button>
            </p>
          )}
          {top.length === 0 && ranked.length > 0 && (
            <p className="area-none">
              {W.noneSuggested}{" "}
              {!more && (
                <button type="button" className="link-btn" onClick={() => setMore(true)}>
                  {W.showAll}
                </button>
              )}
            </p>
          )}
          <ol className="area-cards">
            {top.map((c) => (
              <AreaCardView
                key={c.id}
                card={c}
                file={byId.get(c.id)!}
                rank={ranks.get(c.id)!}
                total={ranked.length}
                starred={stars.includes(c.id)}
                star={() => toggle(c.id)}
                show={() => void show(byId.get(c.id)!)}
                failed={failed === c.id}
              />
            ))}
          </ol>
          {rest.length > 0 && (top.length > 0 || more) && (
            <>
              {top.length > 0 && (
                <button
                  type="button"
                  className="link-btn area-more"
                  aria-expanded={more}
                  onClick={() => setMore((m) => !m)}
                >
                  {more ? W.showFewer : W.showMore}
                </button>
              )}
              {more && <h3 className="area-rest-head">{W.moreHeading(rest.length)}</h3>}
              {more && (
                <ol className="area-rest" start={top.length + 1}>
                  {rest.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="area-rest-row"
                        onClick={() => void show(byId.get(c.id)!)}
                      >
                        <span className={`card-grade small fit g-${c.grade ?? "none"}`}>{c.fit ?? "–"}</span>
                        <span className="area-rest-name">
                          {byId.get(c.id)!.name}
                          <span className="area-rest-rank tiny muted">
                            {" "}
                            #{ranks.get(c.id)} of {ranked.length}
                            {!c.suggestable && c.limits.length ? ` · ${notSuggestedReason(c)}` : ""}
                          </span>
                        </span>
                        <span className="area-rest-share">
                          {c.limits.length ? `${Math.round(c.mustShare * 100)}%` : ""}
                        </span>
                        <span className="area-rest-go" aria-hidden="true">
                          ›
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

/** The catalog-wide line (owner, 10/23), with the way to that limit on What matters. */
export function RegionLine({ limit }: { limit: AreaCard["limits"][number] }) {
  return (
    <p className="area-note area-region" role="note">
      {regionLine(limit)}{" "}
      <Link className="link-btn" href={`/priorities?limit=${limit.factor}`}>
        {W.changeIt}
      </Link>
    </p>
  );
}

/** One area's card: the suggestion box's, and the map's when an outline is tapped. */
export function AreaCardView({
  card,
  file,
  rank,
  total,
  starred,
  star,
  show,
  failed,
  as = "li",
}: {
  card: AreaCard;
  file: AreaFile;
  rank: number;
  total: number;
  starred: boolean;
  star(): void;
  show(): void;
  failed: boolean;
  as?: "li" | "div";
}) {
  const why = whyLine(card, file);
  const share = mustShareParts(card, file);
  const back = holdsBack(card, file);
  const Tag = as;
  return (
    <Tag className="area-card">
      <div className="ac-head">
        <span className={`card-grade fit g-${card.grade ?? "none"}`} aria-label={W.fit(card.fit ?? "–")}>
          {card.fit ?? "–"}
        </span>
        <div className="ac-title">
          <h3 className="ac-name">{file.name}</h3>
          <p className="ac-rank tiny muted">{rankLine(card.fit, rank, total)}</p>
        </div>
        <button
          type="button"
          className="ac-star"
          aria-pressed={starred}
          aria-label={starred ? W.starred : W.star}
          title={starred ? W.starred : W.star}
          onClick={star}
        >
          {starred ? "★" : "☆"}
        </button>
      </div>
      {/* Owner, #298 answers: the Must share is the card's headline number. */}
      {share && (
        <p className="ac-share">
          <span className="ac-pct">{share.pct}</span> {share.rest}
        </p>
      )}
      {why && <p className="ac-why">{why}</p>}
      <p className="ac-trade">
        <span className="ac-label">{W.tradeOff}</span> {tradeOffLine(card, file)}
      </p>
      {(back.must || back.weakest.length > 0) && (
        <div className="ac-back">
          <p className="ac-label">{W.holdsBack}</p>
          <ul className="ac-back-list">
            {back.must && <li>{back.must}</li>}
            {back.weakest.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="ac-typical tiny muted">{W.typical(file.points.ll.length)}</p>
      <button type="button" className="btn small secondary ac-show" onClick={show}>
        {W.showParcel}
      </button>
      {failed && (
        <p className="tiny" role="status">
          {SAMPLE_WORDS.failed}
        </p>
      )}
    </Tag>
  );
}
