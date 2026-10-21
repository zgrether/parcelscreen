"use client";
/**
 * The rulebook (value-ranking.md §8; VR7), Help's "How grades work" since step 4b (it was the /rulebook page, "What the
 * grade means"; /rulebook now redirects to /help, keeping its #rule-<panel>). At the top, the breakdown bar for a parcel
 * on the list (the open one, if it's screened), in the chosen person's weights; then the rules of both grades, from
 * config and the Settings. The rubric switch is the sheet's (ps.rubricView). Reached from the menu's Help, from What
 * matters to you, and from each report panel's "How it's scored" (its section, #rule-<panel>).
 */
import Link from "next/link";
import { useCostSettings } from "@/lib/client/costRates";
import { useEffect, useMemo, useState } from "react";
import { parcelName } from "@/lib/client/historyRows";
import { openOnMap } from "@/lib/client/openOnMap";
import { getPref } from "@/lib/client/prefs";
import { visibleParcels } from "@/lib/client/favoritesStore";
import { useKeptScreens } from "@/lib/client/useKeptScreens";
import { loadUserConfig } from "@/lib/client/userConfig";
import { breakdown } from "@/lib/report/breakdown";
import { useRubricView } from "@/lib/client/useRubricView";
import { reportCard } from "@/lib/report/card";
import { drawnOf } from "@/lib/report/marks";
import { rulebook } from "@/lib/report/rulebook";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";
import { RubricSwitch } from "@/components/Results/card/RubricSwitch";
import { BreakdownBar } from "./BreakdownBar";
import { RulebookRules } from "./RulebookRules";

export function Rulebook() {
  const store = useMemo(() => getPref("ps.parcels"), []);
  // Step 8: what this person may see, not someone else's History.
  const built = useMemo(() => (store ? visibleParcels() : []), [store]);
  const config = useMemo(() => loadUserConfig(), []);
  const { rubrics, rubric, setRubric } = useRubricView();
  const rb = useMemo(() => rulebook(SCREEN_CONSTANTS, config, rubrics), [config, rubrics]);

  const screens = useKeptScreens(built);
  // A link to one panel's rules (a report panel's "How it's scored": /help#rule-trails). The page is drawn in the
  // browser, and the breakdown above the rules grows once the kept screens load, so it goes to the section itself,
  // once they have (follow-up 52).
  const loaded = screens.size === built.length;
  const costs = useCostSettings();
  useEffect(() => {
    if (!loaded || !location.hash) return;
    document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
  }, [loaded]);
  const screened = built.filter((b) => screens.get(b.key!)?.state === "ok");
  // Kept screens from earlier rules (or gone): each parcel re-screens when it's opened (#118 review).
  const stale = built.filter((b) => screens.get(b.key!)?.state === "rescreen");
  const [picked, setPicked] = useState<string | null>(null);
  // The open parcel when it's screened, else the most recently changed screened one.
  const key =
    picked ??
    (
      screened.find((b) => b.key === store?.open?.key) ??
      [...screened].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
    )?.key ??
    null;
  const result = key ? (screens.get(key)?.result ?? null) : null;
  const parcel = built.find((b) => b.key === key);
  const card = result
    ? reportCard(
        result,
        rubric,
        parcel && drawnOf(parcel.markup, parcel.drivewayLine, { askingPrice: parcel.askingPrice, ...costs }),
      )
    : null;
  const bd = card ? breakdown(card) : null;

  return (
    <>
      <div className="rulebook">
        <div className="compare-head">
          <Link className="link-btn" href="/priorities">
            What matters to you
          </Link>
          <RubricSwitch
            rubrics={rubrics}
            current={rubric.id}
            setRubric={setRubric}
            label="Whose weights grade the parcels"
          />
        </div>

        <section className="rule-breakdown">
          <h2>A parcel&apos;s grade, row by row</h2>
          {screened.length === 0 ? (
            stale.length > 0 ? (
              <div className="muted">
                <p>
                  {stale.length} parcel{stale.length === 1 ? "" : "s"} on your list{" "}
                  {stale.length === 1 ? "was" : "were"} screened under earlier rules. Open one to re-screen
                  it.
                </p>
                <ul className="rule-stale">
                  {stale.map((b) => (
                    <li key={b.key}>
                      <Link className="link-btn" href="/explore" onClick={() => openOnMap(b)}>
                        {parcelName(b).name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="muted">Screen a parcel from the map and it shows here.</p>
            )
          ) : (
            <>
              <label className="cmp-add">
                <span>Parcel</span>{" "}
                <select value={key ?? ""} onChange={(e) => setPicked(e.target.value)}>
                  {screened.map((b) => (
                    <option key={b.key} value={b.key!}>
                      {parcelName(b).name}
                    </option>
                  ))}
                </select>
              </label>
              {card && (
                <p>
                  <span className={`card-grade small g-${card.grade ?? "none"}`}>{card.grade ?? "–"}</span>{" "}
                  {card.reason}
                </p>
              )}
              {bd ? <BreakdownBar b={bd} /> : <p className="muted">No row is graded on this parcel.</p>}
            </>
          )}
        </section>

        <RulebookRules rb={rb} current={rubric.id} />
      </div>
    </>
  );
}
