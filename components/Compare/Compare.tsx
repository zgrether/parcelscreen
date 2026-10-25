"use client";
/**
 * The comparison table (value-ranking.md §7; VR6): History's parcels as columns, the report card's lines as rows, in
 * collapsible groups. The first column stays put while the parcels scroll sideways (on a phone). A cell holds a value
 * and a mark; a tap opens that line's slide-in panel for that parcel (the sheet's own, §6.2): a side panel on desktop,
 * a bottom sheet on a phone. The rubric switch in the header is the sheet's (ps.rubricView): it changes the grade and the
 * verdict, nothing else. The table starts with up to four parcels, the Contenders first, then the most recently screened
 * (owner, #117 review); once columns are added or removed here, that choice is remembered per browser (ps.compare).
 */
import Link from "next/link";
import { useCostSettings } from "@/lib/client/costRates";
import { COMPARE_HOW, COMPARE_MAX } from "@/lib/client/library";
import { useMemo, useState } from "react";
import { LongName } from "@/components/LongName";
import { CardPanel } from "@/components/Results/card/CardPanel";
import { drawnOf } from "@/lib/report/marks";
import { evaluationPoint } from "@/components/Results/blocks/types";
import { parcelName } from "@/lib/client/historyRows";
import { openOnMap } from "@/lib/client/openOnMap";
import type { WorkingParcel } from "@/lib/client/parcelStore";
import { getPref, setPref } from "@/lib/client/prefs";
import { favoritesOf } from "@/lib/client/favorites";
import { useKeptScreens } from "@/lib/client/useKeptScreens";
import { loadUserConfig } from "@/lib/client/userConfig";
import {
  adjustFor,
  adjustParcel,
  householdDoc,
  removeAdjust,
  restoreAdjust,
  useHousehold,
} from "@/lib/client/householdDoc";
import { currentProfileId } from "@/lib/client/profiles";
import { gradedSite } from "@/lib/report/adjust";
import { reportCard } from "@/lib/report/card";
import { adjustPropsFor } from "@/components/Results/card/AdjustSection";
import { useRubricView } from "@/lib/client/useRubricView";
import { RubricSwitch } from "@/components/Results/card/RubricSwitch";
import type { PanelKey } from "@/lib/report/cardPanels";
import { compareTable, type Cell, type CompareParcel } from "@/lib/report/compare";
import { ADJUSTED_TITLE } from "@/lib/report/adjustWords";

/** A Must's cell (P-6, UX part 2 PR 7c2): the card's own words, "✓ pass", "! check first". */
export const STATUS: Record<NonNullable<Cell["status"]>, { mark: string; word: string }> = {
  pass: { mark: "✓", word: "pass" },
  warn: { mark: "!", word: "check first" },
  fail: { mark: "✗", word: "fail" },
  unknown: { mark: "?", word: "not known" },
};

export function Compare() {
  // Step 8: Compare is Your list's, the household's favorites.
  const built = useMemo(() => favoritesOf(getPref("ps.parcels")?.built ?? []), []);
  // The columns: the parcels ticked on Your list, then as changed here (remembered per browser); none until then.
  const [picked, setPicked] = useState<string[] | null>(() => {
    const kept = getPref("ps.compare");
    const keys = new Set(built.map((b) => b.key!));
    return kept ? kept.filter((k) => keys.has(k)) : null;
  });
  const choose = (keys: string[]) => {
    setPicked(keys);
    setPref("ps.compare", keys);
  };
  const { rubrics, rubric, setRubric } = useRubricView();
  const config = useMemo(() => loadUserConfig(), []);
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const [panel, setPanel] = useState<{ col: number; key: PanelKey } | null>(null);

  // Every History parcel's latest screen: the default columns need their verdicts and dates.
  const screens = useKeptScreens(built);
  const costs = useCostSettings();
  const household = useHousehold();
  const all: CompareParcel[] = built.map((b) => {
    const { name, acres } = parcelName(b);
    const s = screens.get(b.key!);
    return {
      key: b.key!,
      name,
      acres,
      askingPrice: b.askingPrice,
      listingAcres: b.listingAcres,
      state: s?.state ?? "none",
      result: s?.result ?? null,
      drawn: drawnOf(
        b.markup,
        b.drivewayLine,
        { askingPrice: b.askingPrice, ...costs },
        adjustFor(b.key, household),
        b.facts,
      ),
    };
  });
  // The parcels ticked on Your list (step 4b: Compare is reached from there, 2 or 3 of them).
  const chosen = picked ?? [];
  const columns = chosen.map((k) => built.find((b) => b.key === k)).filter((b): b is WorkingParcel => !!b);
  const parcels = columns.map((b) => all.find((p) => p.key === b.key)!);
  const table = compareTable(parcels, rubric);
  // Up to three columns, as on Your list.
  const addable = chosen.length < COMPARE_MAX ? built.filter((b) => !chosen.includes(b.key!)) : [];
  const opened = panel ? parcels[panel.col] : null;
  const openedCard = panel ? table.cards[panel.col] : null;

  const cell = (c: Cell, col: number, label: string) => {
    const status = c.status ? STATUS[c.status] : null;
    const body = (
      <>
        {/* Z-6 (UX part 2 PR 7c1): the mark or letter, then ✎, in one fixed cell before the words. */}
        <span className="cmp-key">
          {status && (
            <span className={`gate-mark ${c.status}`} aria-hidden="true">
              {status.mark}
            </span>
          )}
          {c.grade !== undefined && (
            <span className={`card-grade small g-${c.grade ?? "none"}`}>{c.grade ?? "–"}</span>
          )}
          {c.adjusted && (
            <span className="adjusted-mark" title={ADJUSTED_TITLE} aria-label={ADJUSTED_TITLE}>
              ✎
            </span>
          )}
        </span>
        <span className="cmp-text">{status ? status.word : c.text}</span>
        {c.mark && (
          <span
            className={`cmp-mark ${c.mark}`}
            aria-label={c.mark === "best" ? "best in row" : "worst in row"}
          >
            {c.mark === "best" ? "↑" : "↓"}
          </span>
        )}
      </>
    );
    return (
      <td key={col} title={c.title}>
        {c.panel ? (
          <button
            className="cmp-cell"
            aria-label={`${parcels[col]!.name}, ${label}: ${status ? status.word : c.text}`}
            onClick={() => setPanel({ col, key: c.panel! })}
          >
            {body}
          </button>
        ) : (
          <span className="cmp-cell">{body}</span>
        )}
      </td>
    );
  };

  return (
    <>
      <main className="compare">
        <header className="compare-head">
          <Link className="link-btn" href="/library">
            ← Your list
          </Link>
          <h1>Compare</h1>
          <RubricSwitch
            rubrics={rubrics}
            current={rubric.id}
            setRubric={setRubric}
            label="Whose weights grade the parcels"
          />
        </header>

        {columns.length === 0 ? (
          <p className="muted">
            {COMPARE_HOW} <Link href="/library">Your list</Link>
          </p>
        ) : (
          <>
            <div className="compare-scroll">
              <table className="compare-table">
                <thead>
                  <tr>
                    <th scope="col" className="cmp-first">
                      <span className="sr-only">Line</span>
                    </th>
                    {parcels.map((p, i) => (
                      <th key={p.key} scope="col">
                        <LongName name={p.name} className="cmp-name" />
                        <div className="tiny muted">{p.acres !== null ? `${p.acres.toFixed(2)} ac` : ""}</div>
                        <div className="cmp-actions">
                          <Link
                            className="link-btn"
                            href="/explore"
                            onClick={() =>
                              openOnMap(columns[i]!, { label: "Compare", href: "/compare", scroll: 0 })
                            }
                          >
                            Open
                          </Link>
                          <button
                            className="btn secondary small"
                            aria-label={`Remove ${p.name} from the table`}
                            onClick={() => choose(chosen.filter((k) => k !== p.key))}
                          >
                            Remove
                          </button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="cmp-headline">
                    <th scope="row" className="cmp-first">
                      {table.head.label}
                    </th>
                    {table.head.cells.map((c, i) => cell(c, i, table.head.label))}
                  </tr>
                </tbody>
                {table.groups.map((g) => {
                  const shut = closed.has(g.key);
                  return (
                    <tbody key={g.key}>
                      <tr className="cmp-group">
                        <th scope="rowgroup" className="cmp-first" colSpan={1}>
                          <button
                            className="cmp-toggle"
                            aria-expanded={!shut}
                            onClick={() => {
                              const next = new Set(closed);
                              if (shut) next.delete(g.key);
                              else next.add(g.key);
                              setClosed(next);
                            }}
                          >
                            {shut ? "▸" : "▾"} {g.label}
                          </button>
                        </th>
                        <td colSpan={parcels.length} />
                      </tr>
                      {!shut &&
                        g.rows.map((r) => (
                          <tr key={r.key}>
                            <th scope="row" className="cmp-first cmp-label">
                              {r.label}
                            </th>
                            {r.cells.map((c, i) => cell(c, i, r.label))}
                          </tr>
                        ))}
                    </tbody>
                  );
                })}
              </table>
            </div>
            <p className="tiny muted cmp-legend">
              ✓ pass · ! check first · ✗ fail · ? not known &nbsp; ↑ best in its row · ↓ worst in its row.
              Costs and the budget say &ldquo;not yet&rdquo; until the app prices them.
            </p>
            {addable.length > 0 && (
              <label className="cmp-add">
                <span>Add from your list</span>{" "}
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) choose([...chosen, e.target.value]);
                  }}
                >
                  <option value="">Choose a parcel…</option>
                  {addable.map((b) => (
                    <option key={b.key} value={b.key!}>
                      {parcelName(b).name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}

        {panel && opened?.result && openedCard && (
          <div className="compare-panel">
            <CardPanel
              panel={panel.key}
              card={openedCard}
              result={opened.result}
              point={evaluationPoint(opened.result)}
              dw={config.dw}
              vetoPct={config.roadVetoGradePct}
              about={opened.name}
              lineNames={opened.drawn?.names}
              // UX part 2 PR 3d (P-2): every copy of a row's panel has Adjust, as the map's does.
              adjust={adjustPropsFor(
                panel.key,
                opened.key,
                currentProfileId(),
                // What the app says without the person's adjustments.
                reportCard(
                  opened.result,
                  rubric,
                  opened.drawn ? { ...opened.drawn, adjust: undefined } : undefined,
                ),
                (key) => householdDoc().adjusts.find((a) => a.key === key) ?? null,
                { save: adjustParcel, remove: removeAdjust, restore: restoreAdjust },
                null,
                gradedSite(openedCard, !!opened.result.house && !("outside" in opened.result.house)),
              )}
              onClose={() => setPanel(null)}
            />
          </div>
        )}
      </main>
    </>
  );
}
