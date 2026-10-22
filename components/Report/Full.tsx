"use client";
/**
 * Full (step 9 plan §3): after the one-page summary, the priorities it was graded against, then the report's own blocks
 * grouped under the brief's sections, the listing and notes, the lines and marks, the data sources and the closing
 * line. The blocks render as they do in the panel's Full report, in their print variant (no "on the map" pointers).
 * Nothing here for ways to raise the grade (step 12): it comes with its step. The cost to enjoy (step 10) follows
 * Access and driveway.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { area, length, lineString } from "@turf/turf";
import { fmt } from "@/lib/format";
import { KIND_NAME, type WorkingParcel } from "@/lib/client/parcelStore";
import { milestonesLine, statusLine } from "@/lib/client/parcelStatus";
import { askingLine } from "@/lib/client/askingPrice";
import { safeListingHref } from "@/lib/client/listingUrl";
import { choicesBeside } from "@/lib/report/sites";
import { mustLines, mustText } from "@/lib/report/cardLines";
import { listingAcresNote } from "@/lib/report/listing";
import { areaPolygon } from "@/lib/report/marks";
import { columnsOf } from "@/lib/rubric/edit";
import { weightsOf } from "@/lib/rubric/weights";
import { EDITOR_TITLES, minimumLine, plainLine, TIER_NAMES } from "@/lib/rubric/words";
import type { Card } from "@/lib/report/card";
import { M2FT, M2_PER_ACRE } from "@/lib/geo/types";
import type { ScreenResult, Step } from "@/lib/screen/types";
import { REPORT } from "@/components/Results/report";
import { evaluationPoint, type BlockProps } from "@/components/Results/blocks/types";
import { Terrain } from "@/components/Results/blocks/Terrain";
import { WhereToBuild } from "@/components/Results/blocks/WhereToBuild";
import { ExistingHouse } from "@/components/Results/blocks/ExistingHouse";
import { Driveway } from "@/components/Results/blocks/Driveway";
import { DecemberSun } from "@/components/Results/blocks/DecemberSun";
import { DarkSkies } from "@/components/Results/blocks/DarkSkies";
import { Soils } from "@/components/Results/blocks/Soils";
import { Floodplain } from "@/components/Results/blocks/Floodplain";
import { WhereToGarden } from "@/components/Results/blocks/WhereToGarden";
import { GettingThere } from "@/components/Results/blocks/GettingThere";
import { PublicLand } from "@/components/Results/blocks/PublicLand";
import { StillUnknown } from "@/components/Results/blocks/StillUnknown";
import { Climate } from "@/components/Results/blocks/Climate";
import { Privacy } from "@/components/Results/blocks/Privacy";
import { LongView } from "@/components/Results/blocks/LongView";
import { LongTrails } from "@/components/Results/blocks/LongTrails";
import { Internet } from "@/components/Results/blocks/Internet";
import { PRIVACY_SOURCES } from "@/lib/report/privacy";
import { CLIMATE_SOURCES } from "@/lib/report/climate";
import { ordinal, SITE_NUMBER, topNumbers } from "@/components/Results/answer/BestHomesite";
import { lineNamesOf } from "@/lib/report/lines";
import { CostBreakdown } from "@/components/Results/card/CostBreakdown";

/** Full's headings and lines (plan §8). */
export const FULL_WORDS = {
  priorities: "The priorities it was graded against",
  sites: "Best site and alternatives",
  access: "Access and driveway",
  cost: "Cost to enjoy",
  sun: "Winter sun and the horizon",
  sky: "Night sky",
  soils: "Soils, septic and flood",
  drives: "Drive times",
  // Step 11: one section per new factor, after the brief's.
  climate: "Climate",
  privacy: "Privacy",
  longView: "Long view",
  internet: "Internet",
  listing: "Listing facts and notes",
  lines: "Lines and marks",
  sources: "Data sources",
  closing: "This is a desk screen, not a survey, perc test or appraisal.",
  engine: (n: number) => `Graded by engine version ${n}.`,
  didntLoad: "didn't load",
  noneDrawn: "None drawn.",
  noListing: "No listing facts yet.",
} as const;

/**
 * One line per data source, with the screen step that fetched it (plan §3, §8). `dated`: the line carries its own
 * date (the atlas's year, a baked snapshot's), so it isn't "as of the screen".
 */
function sources(r: ScreenResult): { text: string; step: Step; dated?: true }[] {
  return [
    {
      text: `USGS 3DEP lidar (${r.demSource ?? "3DEP"}${r.demResM !== undefined ? `, ${fmt(r.demResM)} m` : ""})`,
      step: "dem",
    },
    { text: "NRCS soils (Soil Data Access)", step: "soils" },
    { text: "FEMA flood map (NFHL)", step: "flood" },
    { text: "USGS PAD-US (public land)", step: "padus" },
    { text: `Light pollution atlas (D. Lorenz, ${r.sky?.year ?? "—"})`, step: "sky" },
    { text: "Census TIGER roads", step: "driveway" },
    { text: "OpenStreetMap places and trailheads", step: "near" },
    { text: "OSRM drive times", step: "drive" },
    // Step 11: the baked snapshots, read when the sites are ranked.
    ...(r.climate
      ? [{ text: `Climate: ${CLIMATE_SOURCES}`, step: "rank" as const, dated: true as const }]
      : []),
    ...(r.privacy
      ? [{ text: `Privacy: ${PRIVACY_SOURCES}`, step: "rank" as const, dated: true as const }]
      : []),
  ];
}

const asOf = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "as of the screen"
    : `as of ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
};

/** A section of Full: a heading, and its content kept off a page's foot where it can. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rp-full-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function Full({
  result,
  card,
  parcel,
  acres,
}: {
  result: ScreenResult;
  /** The viewer's card. */
  card: Card;
  parcel: WorkingParcel;
  acres: number | null;
}) {
  // A block's folds (the driveway's grade detail) print open: paper has no ▸ to press (fresh-eyes review).
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.querySelectorAll("details").forEach((d) => (d.open = true));
  });
  const point = evaluationPoint(result);
  const props: BlockProps = {
    result,
    point,
    variant: "print",
    lineNames: lineNamesOf(parcel.markup),
    drivewayLine: parcel.drivewayLine,
    ...(card.paving ? { paving: card.paving } : {}),
  };
  /** A report block with its own heading, or nothing when it has nothing to say. */
  const block = (B: (p: BlockProps) => ReactNode) => {
    const sec = REPORT.find((s) => s.Block === B);
    const content = B(props);
    if (!sec || content === null) return null;
    const h = sec.heading(result, point);
    return (
      <section key={h.slug} className="rp-block">
        <h3>
          {h.title}
          {h.sub && <small> {h.sub}</small>}
        </h3>
        {content}
      </section>
    );
  };
  const r = card.rubric.rubric;
  const cols = columnsOf(r);
  const w = weightsOf(r);
  const total = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  const ranked = (tier: "should" | "could") => cols[tier].filter((c) => c.kind === "factor");
  const access = mustLines(card).filter((m) => m.key === "access" || m.key === "easement");
  const best = card.sites[0];
  const near = best
    ? choicesBeside(card.sites, {
        ll: best.ll,
        score: best.score,
        fails: best.fails.length,
        index: best.index,
      })
    : null;
  const others = [...(near?.alternatives ?? []), ...(near?.more ?? [])];
  const href = safeListingHref(parcel.listingUrl);
  const acresNote = listingAcresNote(parcel.listingAcres, acres);
  const status = [statusLine(parcel), milestonesLine(parcel)].filter(Boolean).join(" · ");

  return (
    <div className="rp-full" ref={box}>
      {block(StillUnknown)}

      <Section title={FULL_WORDS.priorities}>
        <h3>{TIER_NAMES.must}</h3>
        <ul>
          {cols.must.map((c) => (
            <li key={`${c.kind}:${c.factor}`}>
              {c.kind === "minimum"
                ? minimumLine(r.musts.find((m) => m.factor === c.factor && m.threshold !== undefined)!)
                : plainLine(r, c.factor)}
            </li>
          ))}
        </ul>
        {(["should", "could"] as const).map(
          (tier) =>
            ranked(tier).length > 0 && (
              <div key={tier}>
                <h3>{TIER_NAMES[tier]}</h3>
                <ol>
                  {ranked(tier).map((c) => (
                    <li key={c.factor}>
                      <b>{EDITOR_TITLES[c.factor]}</b> ({fmt((w[c.factor as keyof typeof w] / total) * 100)}
                      %): {plainLine(r, c.factor)}
                    </li>
                  ))}
                </ol>
              </div>
            ),
        )}
        {cols.wont.length > 0 && (
          <p>
            <b>{TIER_NAMES.wont}:</b> {cols.wont.map((c) => EDITOR_TITLES[c.factor]).join(", ")}
          </p>
        )}
      </Section>

      <Section title={FULL_WORDS.sites}>
        {best && (
          <ol className="rp-sites">
            {[best, ...others].map((s, i) => (
              <li key={s.index}>
                <b>
                  {ordinal(i + 1)} · Site #{s.rank}
                </b>
                {": "}
                {topNumbers(s.rows, card)
                  .map(
                    ({ row }) =>
                      `${SITE_NUMBER[row.key]} ${row.key === "driveway" ? row.detail : (row.short ?? row.detail)}`,
                  )
                  .join(" · ")}
              </li>
            ))}
          </ol>
        )}
        {block(WhereToBuild)}
        {block(Terrain)}
        {block(ExistingHouse)}
      </Section>

      <Section title={FULL_WORDS.access}>
        <ul>
          {access.map((m) => (
            <li key={m.key}>
              <b>{m.label}:</b> {mustText(m)}
            </li>
          ))}
        </ul>
        {block(Driveway)}
      </Section>

      {/* Only when the card was priced (graded with the parcel's price and the rates). */}
      {card.cost !== undefined && (
        <Section title={FULL_WORDS.cost}>
          <CostBreakdown cost={card.cost} print />
        </Section>
      )}

      <Section title={FULL_WORDS.sun}>{block(DecemberSun)}</Section>
      <Section title={FULL_WORDS.sky}>{block(DarkSkies)}</Section>
      <Section title={FULL_WORDS.soils}>
        {block(Soils)}
        {block(Floodplain)}
        {block(WhereToGarden)}
      </Section>
      <Section title={FULL_WORDS.drives}>
        {block(GettingThere)}
        {block(PublicLand)}
        {block(LongTrails)}
      </Section>
      <Section title={FULL_WORDS.climate}>{block(Climate)}</Section>
      <Section title={FULL_WORDS.privacy}>{block(Privacy)}</Section>
      <Section title={FULL_WORDS.longView}>{block(LongView)}</Section>
      <Section title={FULL_WORDS.internet}>{block(Internet)}</Section>

      <Section title={FULL_WORDS.listing}>
        <dl className="rp-facts-list">
          {href && (
            <>
              <dt>Listing link</dt>
              <dd>{parcel.listingUrl}</dd>
            </>
          )}
          {parcel.askingPrice !== null && parcel.askingPriceAt && (
            <>
              <dt>Asking price</dt>
              <dd>{askingLine(parcel.askingPrice, parcel.askingPriceAt)}</dd>
            </>
          )}
          {parcel.listingAcres !== null && (
            <>
              <dt>Listing acres</dt>
              <dd>
                {fmt(parcel.listingAcres, 2)} ac{acresNote ? `. ${acresNote}` : ""}
              </dd>
            </>
          )}
          {parcel.agent && (
            <>
              <dt>Agent</dt>
              <dd>{parcel.agent}</dd>
            </>
          )}
          {status && (
            <>
              <dt>Status</dt>
              <dd>{status}</dd>
            </>
          )}
        </dl>
        {!href && parcel.askingPrice === null && parcel.listingAcres === null && !parcel.agent && (
          <p>{FULL_WORDS.noListing}</p>
        )}
        {parcel.notes.trim() && <p className="rp-notes">{parcel.notes}</p>}
      </Section>

      <Section title={FULL_WORDS.lines}>
        {!parcel.house && parcel.markup.length === 0 ? (
          <p>{FULL_WORDS.noneDrawn}</p>
        ) : (
          <ul>
            {parcel.house && (
              <li>
                <b>House site:</b> {parcel.house[0].toFixed(6)}, {parcel.house[1].toFixed(6)}
              </li>
            )}
            {parcel.markup.map((m) => (
              <li key={m.id}>
                <b>{m.name}</b> ({KIND_NAME[m.kind]}
                {m.shape === "line" &&
                  `, ${m.condition}, ${fmt(length(lineString(m.line.map(([la, lo]) => [lo, la])), { units: "meters" }) * M2FT)} ft${m.widthFt !== null ? `, ${fmt(m.widthFt)} ft wide` : ""}`}
                {m.shape === "area" && `, ${(area(areaPolygon(m.ring)) / M2_PER_ACRE).toFixed(2)} ac`})
                {m.shape === "line" && m.recordedIn && `. Recorded in ${m.recordedIn}`}
                {m.note && `. ${m.note}`}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={FULL_WORDS.sources}>
        <ul>
          {sources(result).map((s) => (
            <li key={s.text}>
              {s.text}
              {/* The atlas's own year is in its line; every other source is as of the screen. */}
              {result.failed.includes(s.step)
                ? `: ${FULL_WORDS.didntLoad}`
                : s.step === "sky" || s.dated
                  ? ""
                  : `: ${asOf(result.runAt)}`}
            </li>
          ))}
        </ul>
        <p>{FULL_WORDS.engine(result.engine)}</p>
      </Section>

      <p className="rp-closing">{FULL_WORDS.closing}</p>
    </div>
  );
}
