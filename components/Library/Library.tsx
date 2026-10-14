"use client";
/**
 * The household's list (WF2b, docs/plans/parcel-workflow.md §5): every History parcel with its name, acres, price,
 * state, status and milestones, the household verdict and both grades. Filters and sorts are views, remembered per
 * browser (ps.library); they never change a parcel. A tap on a name opens its detail: the report card, the status
 * controls, Open on the map, Remove. Ticked rows open in Compare. On a phone the table becomes cards.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { HelpProvider } from "@/components/Help/HelpDialog";
import { LongName } from "@/components/LongName";
import { shortPrice } from "@/lib/client/askingPrice";
import {
  hiddenBy,
  hiddenWords,
  libraryRow,
  passes,
  showHidden,
  sortRows,
  type Graded,
  type LibraryRow,
  type LibraryView,
} from "@/lib/client/library";
import { milestonesLine, STATUS_WORD } from "@/lib/client/parcelStatus";
import {
  editBuilt,
  EMPTY_STORE,
  removeBuilt,
  type ParcelStore,
  type WorkingParcel,
} from "@/lib/client/parcelStore";
import { getPref, setPref } from "@/lib/client/prefs";
import { useKeptScreens } from "@/lib/client/useKeptScreens";
import type { Verdict } from "@/lib/report/card";
import { LibraryControls } from "./LibraryControls";
import { ParcelDetail } from "./ParcelDetail";

const when = (iso: string) => new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });

/**
 * A row or card opens its parcel: a click anywhere on it, or Enter or Space when it has focus (owner, after #133). The
 * Compare tick is its own: its clicks don't reach the row.
 */
const opens = (open: () => void) => ({
  tabIndex: 0,
  onClick: open,
  onKeyDown: (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    open();
  },
});
const ownClick = { onClick: (e: MouseEvent) => e.stopPropagation() };

/** The state, with its county on hover or a long press. */
const State = ({ r }: { r: LibraryRow }) =>
  r.state ? <LongName name={r.state} full={r.county ?? r.state} className="lib-state" /> : <>–</>;

export function Library() {
  const router = useRouter();
  const [store, setStore] = useState<ParcelStore>(() => getPref("ps.parcels") ?? EMPTY_STORE);
  const [view, setViewState] = useState<LibraryView>(() => getPref("ps.library"));
  const setView = (v: LibraryView) => {
    setViewState(v);
    setPref("ps.library", v);
  };
  const [opened, setOpened] = useState<string | null>(null);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());

  const built = store.built;
  const screens = useKeptScreens(built);
  const rows = useMemo(() => built.map((p) => libraryRow(p, screens.get(p.key!))), [built, screens]);
  const hidden = hiddenBy(rows, view.filters);
  const shown = sortRows(
    rows.filter((r) => passes(r, view.filters)),
    view.sort,
  );

  /** A parcel changed here (its status, a milestone): saved in place, as the explorer would. */
  // Changes save from the latest store, not this render's: a debounced note can land after another change.
  const latest = useRef(store);
  const keep = (next: ParcelStore) => {
    latest.current = next;
    setStore(next);
    setPref("ps.parcels", next);
  };
  const change = (key: string, edit: (p: WorkingParcel) => WorkingParcel) => {
    const next = editBuilt(latest.current, key, edit, new Date().toISOString());
    if (next !== latest.current) keep(next);
  };
  const remove = (key: string) => {
    keep(removeBuilt(latest.current, key));
    setOpened(null);
  };
  const compare = () => {
    setPref("ps.compare", [...ticked]);
    router.push("/compare");
  };
  const toggle = (key: string) => {
    const next = new Set(ticked);
    if (!next.delete(key)) next.add(key);
    setTicked(next);
  };
  const detail = opened ? built.find((p) => p.key === opened) : undefined;

  return (
    <HelpProvider>
      <main className="compare library">
        <header className="compare-head">
          <Link className="link-btn" href="/explore">
            ← Map
          </Link>
          <h1>Your list</h1>
          {ticked.size > 0 && (
            <button className="btn small" onClick={compare}>
              Compare {ticked.size}
            </button>
          )}
        </header>

        {built.length === 0 ? (
          <p className="muted">
            Nothing on your list yet. Open the map, pick a parcel and screen it, name it or give it a price:
            it&apos;s kept here. <Link href="/explore">Go to the map</Link>
          </p>
        ) : (
          <>
            <LibraryControls view={view} setView={setView} rows={rows} />
            <p className="tiny muted lib-count">
              {shown.length} parcel{shown.length === 1 ? "" : "s"}
            </p>
            {shown.length === 0 ? (
              <p className="muted">No parcel matches these filters.</p>
            ) : (
              <>
                <LibraryTable rows={shown} ticked={ticked} toggle={toggle} open={setOpened} />
                <LibraryCards rows={shown} ticked={ticked} toggle={toggle} open={setOpened} />
              </>
            )}
            {/* What the filters hide, last (owner, #132): its button shows them; desktop and phone alike. */}
            {hidden && (
              <p className="tiny muted lib-hidden" role="status">
                {hiddenWords(hidden)} ·{" "}
                <button
                  className="link-btn"
                  onClick={() => setView({ ...view, filters: showHidden(hidden, view.filters) })}
                >
                  {hidden.onlyArchived ? "Show" : "Show all"}
                </button>
              </p>
            )}
          </>
        )}

        {detail && (
          <ParcelDetail
            key={detail.key}
            parcel={detail}
            kept={screens.get(detail.key!)}
            change={(edit) => change(detail.key!, edit)}
            remove={() => remove(detail.key!)}
            onClose={() => setOpened(null)}
          />
        )}
      </main>
    </HelpProvider>
  );
}

interface RowsProps {
  rows: LibraryRow[];
  ticked: ReadonlySet<string>;
  toggle(key: string): void;
  open(key: string): void;
}

const statusCell = (r: LibraryRow) => {
  const m = milestonesLine(r);
  return (
    <>
      {STATUS_WORD[r.status]}
      {m && <span className="tiny muted lib-milestones"> · {m}</span>}
    </>
  );
};

function VerdictWord({ v, unscreened }: { v: Verdict | null; unscreened: LibraryRow["unscreened"] }) {
  if (v) return <span className={`card-word small v-${v.toLowerCase()}`}>{v}</span>;
  return <span className="tiny muted">{unscreened === "rescreen" ? "re-screen" : "–"}</span>;
}

function Grade({ g, unscreened }: { g: Graded | null; unscreened: LibraryRow["unscreened"] }) {
  if (!g) return <VerdictWord v={null} unscreened={unscreened} />;
  return (
    <span className="lib-grade">
      <span className={`card-grade small g-${g.grade ?? "none"}`}>{g.grade ?? "–"}</span>
      <VerdictWord v={g.verdict} unscreened={null} />
    </span>
  );
}

/** Desktop: one row per parcel. */
function LibraryTable({ rows, ticked, toggle, open }: RowsProps) {
  return (
    <div className="lib-scroll">
      <table className="lib-table">
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Compare</span>
            </th>
            <th scope="col">Name</th>
            <th scope="col">Acres</th>
            <th scope="col">Price</th>
            <th scope="col">State</th>
            <th scope="col">Status</th>
            <th scope="col">Household</th>
            <th scope="col">Zach&apos;s grade</th>
            <th scope="col">Julie&apos;s grade</th>
            <th scope="col">Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.key}
              className={r.status === "archived" ? "lib-row lib-archived" : "lib-row"}
              aria-label={`Open ${r.name}`}
              {...opens(() => open(r.key))}
            >
              <td {...ownClick}>
                <input
                  type="checkbox"
                  aria-label={`Compare ${r.name}`}
                  checked={ticked.has(r.key)}
                  onChange={() => toggle(r.key)}
                />
              </td>
              <td className="lib-name">
                <LongName name={r.name} className="lib-open" />
              </td>
              <td className="num">{r.acres !== null ? r.acres.toFixed(1) : "–"}</td>
              <td className="num">{r.price !== null ? shortPrice(r.price) : "–"}</td>
              <td>
                <State r={r} />
              </td>
              <td>{statusCell(r)}</td>
              <td>
                <VerdictWord v={r.household} unscreened={r.unscreened} />
              </td>
              <td>
                <Grade g={r.zach} unscreened={r.unscreened} />
              </td>
              <td>
                <Grade g={r.julie} unscreened={r.unscreened} />
              </td>
              <td className="tiny muted">{when(r.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A phone: one card per parcel (the name, status and milestones; acres, price and state; the verdicts as chips). */
function LibraryCards({ rows, ticked, toggle, open }: RowsProps) {
  return (
    <ul className="lib-cards">
      {rows.map((r) => (
        <li
          key={r.key}
          className={r.status === "archived" ? "lib-card lib-row lib-archived" : "lib-card lib-row"}
          aria-label={`Open ${r.name}`}
          {...opens(() => open(r.key))}
        >
          <div className="lib-card-head">
            <LongName name={r.name} className="lib-open" />
            <input
              {...ownClick}
              type="checkbox"
              aria-label={`Compare ${r.name}`}
              checked={ticked.has(r.key)}
              onChange={() => toggle(r.key)}
            />
          </div>
          <div className="tiny">{statusCell(r)}</div>
          <div className="tiny muted lib-card-facts">
            {[
              r.acres !== null ? `${r.acres.toFixed(1)} ac` : null,
              r.price !== null ? shortPrice(r.price) : null,
            ]
              .filter(Boolean)
              .map((t) => `${t} · `)
              .join("")}
            <State r={r} />
          </div>
          <div className="lib-chips">
            <span className="lib-chip">
              <span className="tiny muted">Household</span>{" "}
              <VerdictWord v={r.household} unscreened={r.unscreened} />
            </span>
            <span className="lib-chip">
              <span className="tiny muted">Zach</span> <Grade g={r.zach} unscreened={r.unscreened} />
            </span>
            <span className="lib-chip">
              <span className="tiny muted">Julie</span> <Grade g={r.julie} unscreened={r.unscreened} />
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
