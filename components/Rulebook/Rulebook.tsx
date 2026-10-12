"use client";
/**
 * "What the grade means" (value-ranking.md §8; VR7): the rulebook. At the top, the breakdown bar for a History parcel
 * (the open one, if it's screened), in the chosen person's weights; then the rules of both grades, from config and the
 * Settings. The weight switch is the sheet's (ps.person). Reached from the menu; a full page load each way, as
 * Compare (follow-up 52).
 */
import { useMemo, useState } from "react";
import { HelpProvider } from "@/components/Help/HelpDialog";
import { parcelName } from "@/lib/client/historyRows";
import { openOnMap } from "@/lib/client/openOnMap";
import { getPref, setPref } from "@/lib/client/prefs";
import { useKeptScreens } from "@/lib/client/useKeptScreens";
import { loadUserConfig } from "@/lib/client/userConfig";
import { breakdown } from "@/lib/report/breakdown";
import { reportCard, type Person } from "@/lib/report/card";
import { rulebook } from "@/lib/report/rulebook";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";
import { BreakdownBar } from "./BreakdownBar";
import { RulebookRules } from "./RulebookRules";

const PEOPLE: { key: Person; name: string }[] = [
  { key: "zach", name: "Zach's grade" },
  { key: "julie", name: "Julie's grade" },
];

export function Rulebook() {
  const store = useMemo(() => getPref("ps.parcels"), []);
  const built = useMemo(() => store?.built ?? [], [store]);
  const config = useMemo(() => loadUserConfig(), []);
  const rb = useMemo(() => rulebook(SCREEN_CONSTANTS, config), [config]);
  const [person, setPersonState] = useState<Person>(() => getPref("ps.person"));
  const setPerson = (p: Person) => {
    setPersonState(p);
    setPref("ps.person", p);
  };

  const screens = useKeptScreens(built);
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
  const card = result ? reportCard(result, person) : null;
  const bd = card ? breakdown(card) : null;

  return (
    <HelpProvider>
      <main className="compare rulebook">
        <header className="compare-head">
          <a className="link-btn" href="/explore">
            ← Map
          </a>
          <h1>What the grade means</h1>
          <div className="card-person" role="group" aria-label="Whose weights grade the parcels">
            {PEOPLE.map((p) => (
              <button
                key={p.key}
                className="chip"
                aria-pressed={person === p.key}
                onClick={() => setPerson(p.key)}
              >
                {p.name}
              </button>
            ))}
          </div>
        </header>

        <section className="rule-breakdown">
          <h2>A parcel&apos;s grade, row by row</h2>
          {screened.length === 0 ? (
            stale.length > 0 ? (
              <div className="muted">
                <p>
                  {stale.length} parcel{stale.length === 1 ? "" : "s"} in History{" "}
                  {stale.length === 1 ? "was" : "were"} screened under earlier rules. Open one to re-screen
                  it.
                </p>
                <ul className="rule-stale">
                  {stale.map((b) => (
                    <li key={b.key}>
                      <a className="link-btn" href="/explore" onClick={() => openOnMap(b)}>
                        {parcelName(b).name}
                      </a>
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

        <RulebookRules rb={rb} person={person} />
      </main>
    </HelpProvider>
  );
}
