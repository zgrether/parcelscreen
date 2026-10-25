"use client";
/**
 * At Finish (UX part 2 PR 6; the audit's P-9): a track or drive just drawn asks "Use it as the driveway?", with its
 * figures. That's the one way to commit (polish 44): "Use it as the driveway" or "Just keep the line".
 *   - With the parcel's session live, the line is tried at once (step 12's Try it, quick): its length, average and
 *     steepest grade show against the limit, and Use it keeps the tried screen.
 *   - Without one (after a reload), its length shows; Use it grades the parcel again with it, about a minute, then
 *     keeps it.
 * A line the app finds no route from to the house site stays a line, and says so.
 */
import { useEffect, useRef, useState } from "react";
import { length, lineString } from "@turf/turf";
import { useExplore } from "@/components/Explore/useExploreController";
import { useScreenItContext } from "@/components/Results/ScreenItContext";
import { lineSummary, routeFromLine } from "@/lib/report/lines";

const M2FT = 3.28084;

export const FINISH_WORDS = {
  ask: "Use it as the driveway?",
  use: "Use it as the driveway",
  keep: "Just keep the line",
  measuring: "Measuring it…",
  grading: "Grading the parcel with it as the driveway, about a minute…",
  slow: "Using it grades the parcel again, about a minute.",
  within: (pct: number) => `within your ${pct}% limit`,
  over: (pct: number) => `steeper than your ${pct}% limit`,
  noRoute: "The app found no way from its end to the house site, so it stays a line.",
  failed: (why: string) => `Couldn't try it: ${why}`,
};

export function FinishPrompt() {
  const ctl = useExplore();
  const s = useScreenItContext();
  const id = ctl.state.justDrawn ?? null;
  const line = id ? ctl.state.store.open?.markup.find((m) => m.id === id && m.shape === "line") : undefined;
  // Use it asked for this line (by id), before its try was done.
  const [usingFor, setUsingFor] = useState<string | null>(null);
  const using = usingFor !== null && usingFor === id;
  const asked = useRef<string | null>(null);
  const tried = s?.tried && s.tried.line === id ? s.tried : null;
  const quick = !!s?.sessionLive;

  // Tried at once from the live session: the figures come with the question.
  useEffect(() => {
    if (!id || !line || !s || !quick || asked.current === id) return;
    asked.current = id;
    s.tryLine(id);
  }, [id, line, s, quick]);
  // Use it, asked before the try was done (the slow way): kept as soon as it's ready.
  useEffect(() => {
    if (!using || !s || tried?.phase !== "tried" || !id) return;
    if (tried.result && routeFromLine(tried.result, id)) {
      s.useTried();
      ctl.justDrawnDone();
    }
  }, [using, s, tried, id, ctl]);

  if (!id || !line || line.shape !== "line" || !s || !s.shown) return null;
  const ft = length(lineString(line.line.map(([lat, lon]) => [lon, lat])), { units: "meters" }) * M2FT;
  const measured = tried?.result?.lines.find((l) => l.id === id);
  const routed = !!tried?.result && !!routeFromLine(tried.result, id);
  const figures = measured
    ? `${lineSummary(measured)}${
        measured.maxGradePct != null
          ? `; ${measured.maxGradePct > s.vetoPct ? FINISH_WORDS.over(s.vetoPct) : FINISH_WORDS.within(s.vetoPct)}`
          : ""
      }`
    : `${Math.round(ft).toLocaleString("en-US")} ft`;
  const keep = () => {
    if (tried) s.discardTried();
    ctl.justDrawnDone();
  };
  const use = () => {
    if (tried?.phase === "tried" && routed) {
      s.useTried();
      ctl.justDrawnDone();
      return;
    }
    setUsingFor(id);
    if (!tried || tried.phase === "failed") s.tryLine(id);
  };
  const trying = tried?.phase === "trying";
  const status = trying
    ? using || !quick
      ? FINISH_WORDS.grading
      : FINISH_WORDS.measuring
    : tried?.phase === "failed"
      ? FINISH_WORDS.failed(tried.error ?? "")
      : tried?.phase === "tried" && !routed
        ? FINISH_WORDS.noRoute
        : !quick && !tried
          ? FINISH_WORDS.slow
          : null;
  const canUse = !trying && !(tried?.phase === "tried" && !routed);
  return (
    <div className="finish-prompt" role="dialog" aria-label={FINISH_WORDS.ask}>
      <p className="finish-head">
        <b>{line.name}</b> · {figures}
      </p>
      {/* No route from its end: nothing to ask, only why. */}
      {(canUse || trying) && <p className="finish-ask">{FINISH_WORDS.ask}</p>}
      {status && (
        <p className="tiny muted" role="status">
          {status}
        </p>
      )}
      <div className="finish-buttons">
        {canUse && (
          <button className="btn" onClick={use}>
            {FINISH_WORDS.use}
          </button>
        )}
        <button className="btn secondary" onClick={keep}>
          {FINISH_WORDS.keep}
        </button>
      </div>
    </div>
  );
}
