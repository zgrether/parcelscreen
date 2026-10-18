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
import { useMemo, useState } from "react";
import { LongName } from "@/components/LongName";
import { CardPanel } from "@/components/Results/card/CardPanel";
import { drawnOf } from "@/lib/report/marks";
import { evaluationPoint } from "@/components/Results/blocks/types";
import { parcelName } from "@/lib/client/historyRows";
import { openOnMap } from "@/lib/client/openOnMap";
import type { WorkingParcel } from "@/lib/client/parcelStore";
import { getPref, setPref } from "@/lib/client/prefs";
import { useKeptScreens } from "@/lib/client/useKeptScreens";
import { loadUserConfig } from "@/lib/client/userConfig";
import { useRubricView } from "@/lib/client/useRubricView";
import { RubricSwitch } from "@/components/Results/card/RubricSwitch";
import type { PanelKey } from "@/lib/report/cardPanels";
import { compareTable, defaultColumns, type Cell, type CompareParcel } from "@/lib/report/compare";

const STATUS: Record<NonNullable<Cell["status"]>, { mark: string; word: string }> = {
  pass: { mark: "✓", word: "Pass" },
  warn: { mark: "!", word: "Warning" },
  fail: { mark: "✗", word: "Fail" },
  unknown: { mark: "?", word: "Unknown" },
};

export function Compare() {
  const built = useMemo(() => getPref("ps.parcels")?.built ?? [], []);
  // The user's columns, once picked (remembered per browser); null until then: the default (defaultColumns).
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
  const all: CompareParcel[] = built.map((b) => {
    const { name, acres } = parcelName(b);
    const s = screens.get(b.key!);
    return {
      key: b.key!,
      name,
      acres,
      askingPrice: b.askingPrice,
      state: s?.state ?? "none",
      result: s?.result ?? null,
      drawn: drawnOf(b.markup, b.drivewayLine),
    };
  });
  const loaded = screens.size === built.length;
  const chosen = picked ?? (loaded ? defaultColumns(all, rubric) : []);
  const columns = chosen.map((k) => built.find((b) => b.key === k)).filter((b): b is WorkingParcel => !!b);
  const parcels = columns.map((b) => all.find((p) => p.key === b.key)!);
  const table = compareTable(parcels, rubric, config.budget.readyToBuild);
  const addable = built.filter((b) => !chosen.includes(b.key!));
  const opened = panel ? parcels[panel.col] : null;
  const openedCard = panel ? table.cards[panel.col] : null;

  const cell = (c: Cell, col: number, label: string) => {
    const status = c.status ? STATUS[c.status] : null;
    const body = (
      <>
        {status && (
          <span className={`gate-mark ${c.status}`} aria-hidden="true">
            {status.mark}
          </span>
        )}
        {c.grade !== undefined && (
          <span className={`card-grade small g-${c.grade ?? "none"}`}>{c.grade ?? "–"}</span>
        )}
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

        {built.length === 0 ? (
          <p className="muted">
            Nothing to compare yet. Parcels you keep in History (open one and screen it, or draw onto it) show
            here.
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
                          <Link className="link-btn" href="/explore" onClick={() => openOnMap(columns[i]!)}>
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
              ✓ pass · ! warning · ✗ fail · ? unknown &nbsp; ↑ best in its row · ↓ worst in its row. Costs and
              the budget are pending until the cost to enjoy is built.
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
              onClose={() => setPanel(null)}
            />
          </div>
        )}
      </main>
    </>
  );
}
