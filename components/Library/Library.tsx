"use client";
/**
 * Your list (step 8, docs/plans/step-8-favorites.md §4–§5): a switch between Favorites, the household's, and History,
 * this person's own (History.tsx). Favorites is the household's list (WF2b, docs/plans/parcel-workflow.md §5): every
 * starred parcel with its star, name, acres, price, state, archive and milestones, the household verdict and each
 * rubric's grade (step 1). Filters and sorts are views, remembered per profile (ps.library); they never change a parcel.
 * A tap on a name opens its detail: the report card, the status controls, Open on the map, Remove. Ticked rows open in
 * Compare. On a phone the table becomes cards.
 *
 * My order (WF3) is the default sort: rows move by their handle or their menu's Move up and Move down, and a move
 * writes that one parcel's rank. Under another sort the handles hide, and the list says how to get them back.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { LongName } from "@/components/LongName";
import { shortPrice } from "@/lib/client/askingPrice";
import {
  DEFAULT_SORT,
  hiddenBy,
  snippet,
  hiddenWords,
  libraryRow,
  passes,
  showHidden,
  sortRows,
  toggleTick,
  COMPARE_FULL,
  COMPARE_HOW,
  COMPARE_MAX,
  COMPARE_MIN,
  FAVORITES_EMPTY,
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
import { getPref, onParcelsWritten, setPref } from "@/lib/client/prefs";
import { switchLabel } from "@/lib/client/rubrics";
import { useRubricView } from "@/lib/client/useRubricView";
import { dropParcel, useHousehold, useSeenTakes } from "@/lib/client/householdDoc";
import { memberName } from "@/lib/client/household";
import { currentProfileId } from "@/lib/client/profiles";
import { ANSWER_WORD, type Ask } from "@/lib/client/takes";
import { useKeptScreens } from "@/lib/client/useKeptScreens";
import { VERDICT_WORD, type Verdict } from "@/lib/report/card";
import type { NamedRubric } from "@/lib/rubric/types";
import { LibraryControls } from "./LibraryControls";
import { RescreenAll } from "./RescreenAll";
import { DragHandle, OrderMenu, SortableRows, useSortableRow, type Mover } from "./MyOrder";
import { ParcelDetail } from "./ParcelDetail";
import { History } from "./History";
import { Star, unstarQuestion } from "@/components/Favorites/Star";
import { ResetConfirm } from "@/components/Rubric/ResetConfirm";
import { historyOf, isFavorite } from "@/lib/client/favorites";
import { starParcel, unstarParcel, useHistoryLog } from "@/lib/client/favoritesStore";

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
  const me = currentProfileId();
  const log = useHistoryLog();
  // Step 8: the household's favorites, and this person's History; someone else's unstarred parcels are in neither.
  const favorites = useMemo(() => built.filter(isFavorite), [built]);
  const mine = useMemo(() => (me ? historyOf(built, me, log) : []), [built, me, log]);
  const visible = useMemo(() => [...new Set([...favorites, ...mine])], [favorites, mine]);
  const screens = useKeptScreens(visible);
  // The members' rubrics (step 6) change when they set their priorities, here or by a sync.
  const { rubrics } = useRubricView();
  const household = useHousehold();
  const seen = useSeenTakes();
  const rowOf = useMemo(
    () =>
      new Map(
        visible.map((p) => [p.key!, libraryRow(p, screens.get(p.key!), rubrics, { household, me, seen })]),
      ),
    [visible, screens, rubrics, household, me, seen],
  );
  const rows = favorites.map((p) => rowOf.get(p.key!)!);
  const tab = view.tab;
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
  // The map stays mounted behind this tab (step 4b): a run that finishes there, or a parcel opened from here, writes the
  // parcels too, and the list takes that in rather than writing over it later.
  useEffect(
    () =>
      onParcelsWritten((next) => {
        if (!next || next === latest.current) return;
        latest.current = next;
        setStore(next);
      }),
    [],
  );
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
    dropParcel(key); // its asks and takes go with it (step 6)
    keep(removeBuilt(latest.current, key));
    setOpened(null);
  };
  const compare = () => {
    setPref("ps.compare", [...ticked]);
    router.push("/compare");
  };
  const toggle = (key: string) => setTicked(toggleTick(ticked, key));
  // Unstarred while open, it leaves Favorites, and its detail closes.
  const detail = opened ? favorites.find((p) => p.key === opened) : undefined;
  // The parcels whose grades are gone (approval A): "Re-screen all saved parcels" screens them one after another.
  const needing = rows
    .filter((r) => r.unscreened === "rescreen")
    .map((r) => built.find((p) => p.key === r.key)!);
  const nameOf = new Map(rows.map((r) => [r.key, r.name]));
  // Each favorite's star, filled: unstarring asks first, naming whose History it goes back to (plan §2).
  const adderOf = new Map(favorites.map((p) => [p.key!, p.addedBy]));
  const star = (r: LibraryRow) => {
    const by = adderOf.get(r.key) ?? null;
    return (
      <Star
        on
        name={r.name}
        prefill={() => r.name}
        star={(n) => starParcel(r.key, n)}
        unstar={() => unstarParcel(r.key)}
        adder={by && by !== me ? memberName(by) : null}
      />
    );
  };
  // The ⋯ menu's Remove from favorites (polish #16) asks the star's question, then unstars.
  const [unstarring, setUnstarring] = useState<LibraryRow | null>(null);
  const rowsProps = {
    rows: shown,
    rubrics,
    ticked,
    toggle,
    open: setOpened,
    ordering,
    mover,
    star,
    unstar: setUnstarring,
  };

  return (
    <>
      {/* A desktop keeps the table beside an open detail (polish #15): .lib-has-detail leaves room for it. */}
      <main className={detail ? "compare library lib-has-detail" : "compare library"}>
        <header className="compare-head">
          <h1>Your list</h1>
          {/* Compare takes 2 or 3 (step 4b): with one ticked the button waits for another. */}
          {tab === "favorites" && ticked.size > 0 && (
            <button
              className="btn small"
              disabled={ticked.size < COMPARE_MIN}
              title={ticked.size < COMPARE_MIN ? COMPARE_HOW : undefined}
              onClick={compare}
            >
              Compare {ticked.size}
            </button>
          )}
        </header>
        {/* Step 8 (plan §5): Favorites first; the choice is remembered with the view. */}
        <div className="list-switch" role="tablist" aria-label="Favorites or History">
          {(["favorites", "history"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              className="list-switch-seg"
              aria-selected={tab === t}
              onClick={() => setView({ ...view, tab: t })}
            >
              {t === "favorites" ? "Favorites" : "History"}
            </button>
          ))}
        </div>

        {tab === "history" ? (
          <History parcels={mine} rows={rowOf} screens={screens} log={log} me={me} />
        ) : favorites.length === 0 ? (
          <p className="muted">
            {FAVORITES_EMPTY} <Link href="/explore">Go to the map</Link>
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
                  <button
                    className="btn secondary small"
                    onClick={() => setView({ ...view, sort: DEFAULT_SORT })}
                  >
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
                  className="btn secondary small"
                  onClick={() => setView({ ...view, filters: showHidden(hidden, view.filters) })}
                >
                  {hidden.onlyArchived ? "Show" : "Show all"}
                </button>
              </p>
            )}
          </>
        )}

        {unstarring && (
          <ResetConfirm
            question={unstarQuestion(
              adderOf.get(unstarring.key) && adderOf.get(unstarring.key) !== me
                ? memberName(adderOf.get(unstarring.key)!)
                : null,
            )}
            action="Remove from favorites"
            keep="Keep"
            reset={() => {
              unstarParcel(unstarring.key);
              setUnstarring(null);
            }}
            cancel={() => setUnstarring(null)}
          />
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
    </>
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
  /** The row's star (step 8): filled, it unstars after asking. */
  star(r: LibraryRow): ReactNode;
  /** The ⋯ menu's Remove from favorites (polish #16): the star's own question first. */
  unstar(r: LibraryRow): void;
}

interface RowProps extends Omit<RowsProps, "rows"> {
  r: LibraryRow;
  /** Its place among the rows shown, and how many there are: Move up and Move down stop at the ends. */
  index: number;
  count: number;
}

const rowClass = (base: string, r: LibraryRow, dragging: boolean) =>
  [base, "lib-row", r.status === "archived" && "lib-archived", dragging && "lib-dragging"]
    .filter(Boolean)
    .join(" ");

/** "Archived · Walked Oct 20", "Walked Oct 20", or "–" (step 8: an active favorite has no status word). */
const statusCell = (r: LibraryRow) => {
  const m = milestonesLine(r);
  const word = STATUS_WORD[r.status];
  if (!word && !m) return <span className="muted">–</span>;
  return (
    <>
      {word}
      {m && (
        <span className="tiny muted lib-milestones">
          {word ? " · " : ""}
          {m}
        </span>
      )}
    </>
  );
};

function VerdictWord({ v, unscreened }: { v: Verdict | null; unscreened: LibraryRow["unscreened"] }) {
  if (v) return <span className={`card-word small v-${v.toLowerCase()}`}>{VERDICT_WORD[v]}</span>;
  // Screened under earlier rules, or its result is gone (a clean break): the Library's own words (approval A).
  return <span className="tiny muted">{unscreened === "rescreen" ? "Needs a re-screen" : "–"}</span>;
}

/** Why the same letter can read Contender on one row and Maybe on another (polish, step 8's review). */
export const VERDICT_TIP =
  "The verdict also weighs your Must haves and limits, so the same letter can read differently.";

function Grade({ g, unscreened }: { g: Graded | null; unscreened: LibraryRow["unscreened"] }) {
  if (!g) return <VerdictWord v={null} unscreened={unscreened} />;
  return (
    <span className="lib-grade" title={VERDICT_TIP}>
      <span className={`card-grade small g-${g.grade ?? "none"}`}>{g.grade ?? "–"}</span>
      <VerdictWord v={g.verdict} unscreened={null} />
    </span>
  );
}

/**
 * Everyone's grade (step 6, docs/plans/step-6-household.md §3.1): the current person's first, as their card shows it,
 * then each other member's small beside it ("You B Contender · Julie C"). No combined grade. Polish: "You" says whose
 * the first grade is, a new take says "new" as well as its dot, and a take says whose it is.
 */
function Grades({ r }: { r: LibraryRow }) {
  const [mine, ...others] = r.grades;
  return (
    <span className="lib-grades">
      {others.length > 0 && <span className="tiny muted lib-you">You</span>}
      <Grade g={mine?.graded ?? null} unscreened={r.unscreened} />
      {others.map((g) => (
        <span key={g.id} className="lib-other-grade" title={`${g.name}'s grade`}>
          <span className="tiny muted">· {g.name}</span>
          <span className={`card-grade tiny g-${g.graded?.grade ?? "none"}`}>{g.graded?.grade ?? "–"}</span>
          {r.newTakesBy.includes(g.id) && (
            <span className="new-take" title="New take">
              <span className="new-dot" role="img" aria-label={`New take from ${g.name}`} />
              <span className="tiny new-word" aria-hidden="true">
                new
              </span>
            </span>
          )}
          {r.takes[g.id] && (
            <span className={`take-chip tiny a-${r.takes[g.id]}`}>
              {g.name} says {ANSWER_WORD[r.takes[g.id]!]}
            </span>
          )}
          {r.takeNotes[g.id] && (
            <span className="tiny take-note" title={r.takeNotes[g.id]}>
              “{snippet(r.takeNotes[g.id]!)}”
            </span>
          )}
        </span>
      ))}
    </span>
  );
}

/** The ask waiting for my take (step 6b): its note on one line; the panel shows it whole, and how to answer. */
function AskNote({ ask }: { ask: Ask }) {
  const line = `${memberName(ask.from) ?? "Someone"} asked for your take${ask.note ? `: “${ask.note}”` : "."}`;
  return (
    <span className="lib-ask-note tiny" title={`${line} Open it to answer.`}>
      {line} <span className="lib-ask-how">Open it to answer.</span>
    </span>
  );
}

/** Whether a row has a status word or a milestone (an active favorite with neither shows nothing). */
const hasStatus = (r: LibraryRow) => !!STATUS_WORD[r.status] || !!milestonesLine(r);

/**
 * Desktop: one row per parcel; in My order, the handle and the menu first. Price and Status show only when a row has
 * one (polish #12): a column of dashes says nothing.
 */
function LibraryTable({ rows, rubrics, ...rest }: RowsProps) {
  const cols = { price: rows.some((r) => r.price !== null), status: rows.some(hasStatus) };
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
            {cols.price && <th scope="col">Price</th>}
            <th scope="col">State</th>
            {cols.status && <th scope="col">Status</th>}
            <th scope="col">{rubrics.length > 1 ? "Grades" : switchLabel(rubrics[0]!)}</th>
            <th scope="col">Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <TableRow
              key={r.key}
              r={r}
              index={i}
              count={rows.length}
              rubrics={rubrics}
              cols={cols}
              {...rest}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableRow({
  r,
  index,
  count,
  ticked,
  toggle,
  open,
  ordering,
  mover,
  star,
  unstar,
  cols,
}: RowProps & { cols: { price: boolean; status: boolean } }) {
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
          <OrderMenu
            name={r.name}
            index={index}
            count={count}
            move={(to) => mover.move(r.key, to)}
            remove={() => unstar(r)}
          />
        </td>
      )}
      <td {...ownClick}>
        <input
          type="checkbox"
          aria-label={`Compare ${r.name}`}
          checked={ticked.has(r.key)}
          disabled={!ticked.has(r.key) && ticked.size >= COMPARE_MAX}
          title={!ticked.has(r.key) && ticked.size >= COMPARE_MAX ? COMPARE_FULL : COMPARE_HOW}
          onChange={() => toggle(r.key)}
        />
      </td>
      <td className="lib-name">
        <span className="lib-name-line">
          {star(r)}
          <LongName name={r.name} className="lib-open" />
        </span>
        {r.ask && <AskNote ask={r.ask} />}
      </td>
      <td className="num lib-c-acres">{r.acres !== null ? r.acres.toFixed(1) : "–"}</td>
      {cols.price && <td className="num lib-c-price">{r.price !== null ? shortPrice(r.price) : "–"}</td>}
      <td className="lib-c-state">
        <State r={r} />
      </td>
      {cols.status && <td className="lib-c-status">{statusCell(r)}</td>}
      <td className="lib-c-grade">
        <Grades r={r} />
      </td>
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

function Card({ r, index, count, ticked, toggle, open, ordering, mover, star, unstar }: RowProps) {
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
          {star(r)}
          <LongName name={r.name} className="lib-open" />
          {ordering && (
            <OrderMenu
              name={r.name}
              index={index}
              count={count}
              move={(to) => mover.move(r.key, to)}
              remove={() => unstar(r)}
            />
          )}
          <input
            {...ownClick}
            type="checkbox"
            aria-label={`Compare ${r.name}`}
            checked={ticked.has(r.key)}
            disabled={!ticked.has(r.key) && ticked.size >= COMPARE_MAX}
            title={!ticked.has(r.key) && ticked.size >= COMPARE_MAX ? COMPARE_FULL : COMPARE_HOW}
            onChange={() => toggle(r.key)}
          />
        </div>
        {r.ask && <AskNote ask={r.ask} />}
        {/* Polish: an active favorite with no milestone has nothing to say here; no lone "–". */}
        {(STATUS_WORD[r.status] || milestonesLine(r)) && <div className="tiny">{statusCell(r)}</div>}
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
            <Grades r={r} />
          </span>
        </div>
      </div>
    </li>
  );
}
