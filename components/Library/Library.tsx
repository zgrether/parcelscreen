"use client";
/**
 * The household's list (WF2b, docs/plans/parcel-workflow.md §5): every History parcel with its name, acres, price,
 * state, status and milestones, the household verdict and each rubric's grade (step 1). Filters and sorts are views, remembered per
 * browser (ps.library); they never change a parcel. A tap on a name opens its detail: the report card, the status
 * controls, Open on the map, Remove. Ticked rows open in Compare. On a phone the table becomes cards.
 *
 * My order (WF3) is the default sort: rows move by their handle or their menu's Move up and Move down, and a move
 * writes that one parcel's rank. Under another sort the handles hide, and the list says how to get them back.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { HelpProvider } from "@/components/Help/HelpDialog";
import { ProfilePicker } from "@/components/Profile/ProfilePicker";
import { LongName } from "@/components/LongName";
import { shortPrice } from "@/lib/client/askingPrice";
import {
  DEFAULT_SORT,
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
import { rankForMove } from "@/lib/client/myOrder";
import { milestonesLine, STATUS_WORD } from "@/lib/client/parcelStatus";
import {
  editBuilt,
  EMPTY_STORE,
  rankBuilt,
  removeBuilt,
  type ParcelStore,
  type WorkingParcel,
} from "@/lib/client/parcelStore";
import { getPref, setPref } from "@/lib/client/prefs";
import { profileRubrics, shortLabel, switchLabel } from "@/lib/client/rubrics";
import { useKeptScreens } from "@/lib/client/useKeptScreens";
import type { Verdict } from "@/lib/report/card";
import type { NamedRubric } from "@/lib/rubric/types";
import { LibraryControls } from "./LibraryControls";
import { RescreenAll } from "./RescreenAll";
import { DragHandle, OrderMenu, SortableRows, useSortableRow, type Mover } from "./MyOrder";
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
  r.states.length ? (
    <LongName name={r.states.join(" · ")} full={r.county ?? r.states.join(" · ")} className="lib-state" />
  ) : (
    <>–</>
  );

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
  const rubrics = useMemo(() => profileRubrics(), []);
  const rows = useMemo(
    () => built.map((p) => libraryRow(p, screens.get(p.key!), rubrics)),
    [built, screens, rubrics],
  );
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

  /** My order (WF3): the parcel's new place among the rows shown, saved as its rank alone. */
  const ordering = view.sort.key === "order" && !view.sort.reversed;
  const shownKeys = shown.map((r) => r.key);
  const names = new Map(shown.map((r) => [r.key, r.name]));
  const [moved, setMoved] = useState("");
  const mover: Mover = {
    move: (key, to) => {
      const rank = rankForMove(latest.current.built, shownKeys, key, to);
      if (rank === null) return;
      keep(rankBuilt(latest.current, key, rank));
      setMoved(`${names.get(key) ?? "The parcel"} moved to ${to + 1} of ${shown.length}.`);
    },
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
  // The parcels whose grades are gone (approval A): "Re-screen all saved parcels" screens them one after another.
  const needing = rows
    .filter((r) => r.unscreened === "rescreen")
    .map((r) => built.find((p) => p.key === r.key)!);
  const nameOf = new Map(rows.map((r) => [r.key, r.name]));
  const rowsProps = { rows: shown, rubrics, ticked, toggle, open: setOpened, ordering, mover };

  return (
    <HelpProvider>
      <main className="compare library">
        <header className="compare-head">
          <Link className="link-btn" href="/explore">
            ← Map
          </Link>
          <h1>Your list</h1>
          <ProfilePicker />
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
            <LibraryControls view={view} setView={setView} rows={rows} rubrics={rubrics} />
            <RescreenAll
              parcels={needing}
              nameOf={(key) => nameOf.get(key) ?? "the parcel"}
              onKept={(key, id) => change(key, (p) => ({ ...p, screenIds: [...p.screenIds, id] }))}
            />
            <p className="tiny muted lib-count">
              {shown.length} parcel{shown.length === 1 ? "" : "s"}
              {/* Dragging works only in My order (§5): under another sort, the way back to it. */}
              {!ordering && shown.length > 1 && (
                <span className="lib-order-hint">
                  {" · "}
                  <button className="link-btn" onClick={() => setView({ ...view, sort: DEFAULT_SORT })}>
                    Switch to My order
                  </button>{" "}
                  to rearrange
                </span>
              )}
            </p>
            {shown.length === 0 ? (
              <p className="muted">No parcel matches these filters.</p>
            ) : (
              <>
                <SortableRows keys={shownKeys} names={names} mover={mover}>
                  <LibraryTable {...rowsProps} />
                </SortableRows>
                <SortableRows keys={shownKeys} names={names} mover={mover}>
                  <LibraryCards {...rowsProps} />
                </SortableRows>
              </>
            )}
            <p className="sr-only" role="status">
              {moved}
            </p>
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
  /** The profile's rubrics, a grade column each; the Household column only when there are several. */
  rubrics: readonly NamedRubric[];
  ticked: ReadonlySet<string>;
  toggle(key: string): void;
  open(key: string): void;
  /** In My order: the handles and menus show, and rows move. */
  ordering: boolean;
  mover: Mover;
}

interface RowProps extends Omit<RowsProps, "rows"> {
  r: LibraryRow;
  /** Its place among the rows shown, and how many there are: Move up and Move down stop at the ends. */
  index: number;
  count: number;
}

/** "Needs a re-screen" once per row: on the one grade when it's the only column, else on the Household cell. */
const noteOn = (r: LibraryRow, i: number): LibraryRow["unscreened"] =>
  r.grades.length > 1 || i > 0 ? null : r.unscreened;

const rowClass = (base: string, r: LibraryRow, dragging: boolean) =>
  [base, "lib-row", r.status === "archived" && "lib-archived", dragging && "lib-dragging"]
    .filter(Boolean)
    .join(" ");

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
  // Screened under earlier rules, or its result is gone (a clean break): the Library's own words (approval A).
  return <span className="tiny muted">{unscreened === "rescreen" ? "Needs a re-screen" : "–"}</span>;
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

/** Desktop: one row per parcel; in My order, the handle and the menu first. */
function LibraryTable({ rows, rubrics, ...rest }: RowsProps) {
  return (
    <div className="lib-scroll">
      <table className="lib-table">
        <thead>
          <tr>
            {rest.ordering && (
              <th scope="col">
                <span className="sr-only">My order</span>
              </th>
            )}
            <th scope="col">
              <span className="sr-only">Compare</span>
            </th>
            <th scope="col">Name</th>
            <th scope="col">Acres</th>
            <th scope="col">Price</th>
            <th scope="col">State</th>
            <th scope="col">Status</th>
            {rubrics.length > 1 && <th scope="col">Household</th>}
            {rubrics.map((nr) => (
              <th key={nr.id} scope="col">
                {switchLabel(nr)}
              </th>
            ))}
            <th scope="col">Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <TableRow key={r.key} r={r} index={i} count={rows.length} rubrics={rubrics} {...rest} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableRow({ r, index, count, ticked, toggle, open, ordering, mover }: RowProps) {
  const { nodeProps, dragging, handleProps } = useSortableRow(r.key, ordering);
  return (
    <tr
      {...nodeProps}
      className={rowClass("", r, dragging)}
      aria-label={`Open ${r.name}`}
      {...opens(() => open(r.key))}
    >
      {ordering && (
        <td className="lib-order" {...ownClick}>
          <DragHandle name={r.name} handle={handleProps} />
          <OrderMenu name={r.name} index={index} count={count} move={(to) => mover.move(r.key, to)} />
        </td>
      )}
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
      {r.grades.length > 1 && (
        <td>
          <VerdictWord v={r.household} unscreened={r.unscreened} />
        </td>
      )}
      {r.grades.map((g, i) => (
        <td key={g.id}>
          <Grade g={g.graded} unscreened={noteOn(r, i)} />
        </td>
      ))}
      <td className="tiny muted">{when(r.updatedAt)}</td>
    </tr>
  );
}

/**
 * A phone: one card per parcel (the name, status and milestones; acres, price and state; the verdicts as chips). In My
 * order the handle is on the card's left (§5), and the menu beside the Compare tick.
 */
function LibraryCards({ rows, rubrics, ...rest }: RowsProps) {
  return (
    <ul className="lib-cards">
      {rows.map((r, i) => (
        <Card key={r.key} r={r} index={i} count={rows.length} rubrics={rubrics} {...rest} />
      ))}
    </ul>
  );
}

function Card({ r, index, count, ticked, toggle, open, ordering, mover }: RowProps) {
  const { nodeProps, dragging, handleProps } = useSortableRow(r.key, ordering);
  return (
    <li
      {...nodeProps}
      className={rowClass(ordering ? "lib-card lib-card-ordered" : "lib-card", r, dragging)}
      aria-label={`Open ${r.name}`}
      {...opens(() => open(r.key))}
    >
      {ordering && <DragHandle name={r.name} handle={handleProps} />}
      <div className="lib-card-body">
        <div className="lib-card-head">
          <LongName name={r.name} className="lib-open" />
          {ordering && (
            <OrderMenu name={r.name} index={index} count={count} move={(to) => mover.move(r.key, to)} />
          )}
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
          {r.grades.length > 1 && (
            <span className="lib-chip">
              <span className="tiny muted">Household</span>{" "}
              <VerdictWord v={r.household} unscreened={r.unscreened} />
            </span>
          )}
          {r.grades.map((g, i) => (
            <span key={g.id} className="lib-chip">
              <span className="tiny muted">{shortLabel(g)}</span>{" "}
              <Grade g={g.graded} unscreened={noteOn(r, i)} />
            </span>
          ))}
        </div>
      </div>
    </li>
  );
}
