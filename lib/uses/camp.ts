/**
 * Camp now (step 14 §3.1): a spot to camp, and a way to reach it with a 4x4 today. Yes: a Campsite mark or a Clearing
 * reached by the way already drawn, or open gentle ground near a road, with step 10's Ready to camp beside it. Maybe:
 * only after a pioneer track, open ground only far from a road, or the way in needs an easement. No: no practical way
 * in, or no open or marked spot and the best site too small. Pure.
 */
import { COST_ITEMS, COST_WORDS, costRange, type CostEstimate } from "../report/cost";
import { SCREEN_CONSTANTS } from "../screen/config";
import { spotOf } from "./common";
import type { Fact, UseAnswer, UsesInput } from "./types";
import { CAMP, MISSING, SOURCE } from "./words";

const K = SCREEN_CONSTANTS.uses;

/** The pioneer track the camp needs, ft: its item's quantity in Ready to camp (0 when the way in is drawn). */
const trackFt = (camp: CostEstimate): number =>
  camp.items
    .filter((i) => i.label === COST_ITEMS.track)
    .flatMap((i) => i.parts)
    .reduce((s, p) => s + p.qty.low, 0);

const needsEasement = (camp: CostEstimate): boolean =>
  camp.items.some((i) => i.label === COST_ITEMS.easement);

export function campNow({ result: r, facts, marks }: UsesInput): UseAnswer {
  const campsites = marks.filter((m) => m.kind === "campsite").length;
  const clearings = marks.filter((m) => m.kind === "clearing").length;
  const cover = r.cover;
  const openNear = cover ? cover.openNearRoadAc >= K.campMinOpenAc : false;
  const openFar = cover ? cover.openGentleAc >= K.campMinOpenAc : false;
  const cost = facts.cost;
  const priced = cost?.kind === "priced" ? cost : null;
  const track = priced ? trackFt(priced.camp) : null;

  const decides: Fact[] = [
    { label: CAMP.markLabel, value: campsites ? String(campsites) : CAMP.noneMarked, source: SOURCE.marks },
    ...(clearings ? [{ label: CAMP.clearingLabel, value: String(clearings), source: SOURCE.marks }] : []),
    cover
      ? {
          label: CAMP.openNearLabel(K.campNearAccessFt),
          value: CAMP.acres(cover.openNearRoadAc),
          source: SOURCE.nlcd,
          date: String(cover.year),
        }
      : { label: CAMP.openLabel, value: MISSING.cover("open ground") },
    ...(cover
      ? [
          {
            label: CAMP.openLabel,
            value: CAMP.acres(cover.openGentleAc),
            source: SOURCE.nlcd,
            date: String(cover.year),
          },
        ]
      : []),
    ...(track !== null
      ? [{ label: CAMP.trackLabel, value: track > 0 ? CAMP.feet(track) : CAMP.noTrack, source: SOURCE.cost }]
      : []),
    ...(priced
      ? [
          {
            label: CAMP.costLabel,
            value: `${costRange(priced.camp.total)}${priced.camp.land === null ? `, ${COST_WORDS.plusLand}` : ""}`,
            source: SOURCE.cost,
          },
        ]
      : []),
  ];
  const say = (answer: UseAnswer["answer"], reason: string): UseAnswer => ({ answer, reason, decides });

  if (cost?.kind === "noWay") return say("no", COST_WORDS.noWay);
  const spot = spotOf(r, facts.at);
  const siteFits = !!spot && (spot.site === null || spot.site.fit !== "too small");
  const marked = campsites > 0 || clearings > 0;
  if (!marked && !openNear && !openFar) {
    if (!cover) return say("maybe", MISSING.cover("open ground"));
    if (spot === undefined) return say("maybe", MISSING.sites);
    if (!siteFits) return say("no", CAMP.none);
  }
  if (!priced) return say("maybe", MISSING.notPriced);
  if (needsEasement(priced.camp)) return say("maybe", CAMP.easement);
  const withCost = (what: string) => CAMP.withCost(what, costRange(priced.camp.total));
  if (openNear) return say("yes", withCost(CAMP.yesOpen(cover!.openNearRoadAc, K.campNearAccessFt)));
  if (marked && track === 0) return say("yes", withCost(campsites ? CAMP.yesMark : CAMP.yesClearing));
  if (marked) return say("maybe", CAMP.track(track!));
  if (openFar) return say("maybe", CAMP.far(K.campNearAccessFt));
  return say("maybe", track ? CAMP.track(track) : CAMP.siteOnly(spot?.label ?? ""));
}
