"use client";
/**
 * The household's list (WF2b, docs/plans/parcel-workflow.md §5): every History parcel with its name, acres, price,
 * state, status and milestones, the household verdict and both grades. Filters and sorts are views, remembered per
 * browser (ps.library); they never change a parcel. A tap on a name opens its detail: the report card, the status
 * controls, Open on the map, Remove. Ticked rows open in Compare. On a phone the table becomes cards.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { HelpProvider } from "@/components/Help/HelpDialog";
import { LongName } from "@/components/LongName";
import { shortPrice } from "@/lib/client/askingPrice";
import {
  DEFAULT_VIEW,
  libraryRow,
  passes,
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
  const shown = sortRows(
    rows.filter((r) => passes(r, view.filters)),
    view.sort,
  );

  /** A parcel changed here (its status, a milestone): saved in place, as the explorer would. */
  const change = (key: string, edit: (p: WorkingParcel) => WorkingParcel) => {
    const next = editBuilt(store, key, edit, new Date().toISOString());
    if (next === store) return;
    setStore(next);
    setPref("ps.parcels", next);
  };
  const remove = (key: string) => {
    const next = removeBuilt(store, key);
    setStore(next);
    setPref("ps.parcels", next);
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
            <p className="tiny muted lib-count" role="status">
              {shown.length === rows.length
                ? `${rows.length} parcel${rows.length === 1 ? "" : "s"}`
                : `Showing ${shown.length} of ${rows.length}: the filters hide ${rows.length - shown.length}.`}
            </p>
            {shown.length === 0 ? (
              <p className="muted">
                No parcel matches these filters.{" "}
                <button
                  className="link-btn"
                  onClick={() => setView({ ...view, filters: DEFAULT_VIEW.filters })}
                >
                  Reset the filters
                </button>
              </p>
            ) : (
              <>
                <LibraryTable rows={shown} ticked={ticked} toggle={toggle} open={setOpened} />
                <LibraryCards rows={shown} ticked={ticked} toggle={toggle} open={setOpened} />
              </>
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
            <tr key={r.key} className={r.status === "archived" ? "lib-archived" : undefined}>
              <td>
                <input
                  type="checkbox"
                  aria-label={`Compare ${r.name}`}
                  checked={ticked.has(r.key)}
                  onChange={() => toggle(r.key)}
                />
              </td>
              <td className="lib-name">
                <button className="lib-open" onClick={() => open(r.key)}>
                  <LongName name={r.name} />
                </button>
              </td>
              <td className="num">{r.acres !== null ? r.acres.toFixed(1) : "–"}</td>
              <td className="num">{r.price !== null ? shortPrice(r.price) : "–"}</td>
              <td title={r.county ?? undefined}>{r.state ?? "–"}</td>
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
        <li key={r.key} className={r.status === "archived" ? "lib-card lib-archived" : "lib-card"}>
          <div className="lib-card-head">
            <button className="lib-open" onClick={() => open(r.key)}>
              <LongName name={r.name} />
            </button>
            <input
              type="checkbox"
              aria-label={`Compare ${r.name}`}
              checked={ticked.has(r.key)}
              onChange={() => toggle(r.key)}
            />
          </div>
          <div className="tiny">{statusCell(r)}</div>
          <div className="tiny muted">
            {[
              r.acres !== null ? `${r.acres.toFixed(1)} ac` : null,
              r.price !== null ? shortPrice(r.price) : null,
              r.state,
            ]
              .filter(Boolean)
              .join(" · ")}
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
