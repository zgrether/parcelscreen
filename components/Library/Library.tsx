"use client";
/**
 * Your list (step 8, docs/plans/step-8-favorites.md §4–§5): a switch between Favorites, the household's, and Recent,
 * this person's own (Recent.tsx; step 8's History, 8c). Favorites is the household's list (WF2b, docs/plans/parcel-workflow.md §5): every
 * starred parcel with its star, name, acres, price, state, archive and milestones, the household verdict and each
 * rubric's grade (step 1). Filters and sorts are views, remembered per profile (ps.library); they never change a parcel.
 * A tap on a row opens the parcel on the map, with the one parcel panel (Z-2, UX part 2: the list's own detail went),
 * and "‹ Your list" there comes back to this view and scroll. Ticked rows open in Compare. On a phone the table becomes
 * cards.
 *
 * My order (WF3) is the default sort: rows move by their handle or their menu's Move up and Move down, and a move
 * writes that one parcel's rank. Under another sort the handles hide, and the list says how to get them back.
 */
import Link from "next/link";
import { RuledOut } from "./RuledOut";
import { useCostSettings } from "@/lib/client/costRates";
import { reportHref } from "@/lib/print/report";
import { GRADES_ID, GRADES_TITLE } from "@/lib/client/help";
import { useRouter } from "next/navigation";
import {
  Fragment,
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
import { costRange } from "@/lib/report/cost";
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
  gradeSortKey,
  type LibraryRow,
  type LibrarySort,
  type LibraryView,
  type SortKey,
} from "@/lib/client/library";
import { rankForMove } from "@/lib/client/myOrder";
import { milestonesLine, STATUS_WORD } from "@/lib/client/parcelStatus";
import {
  editBuilt,
  EMPTY_STORE,
  rankBuilt,
  type ParcelStore,
  type WorkingParcel,
} from "@/lib/client/parcelStore";
import { getPref, onParcelsWritten, setPref } from "@/lib/client/prefs";
import { openOnMap, takeBackScroll } from "@/lib/client/openOnMap";
import { switchLabel } from "@/lib/client/rubrics";
import { useRubricView } from "@/lib/client/useRubricView";
import { useHousehold, useSeenTakes } from "@/lib/client/householdDoc";
import { ADJUSTED_TITLE } from "@/lib/report/adjustWords";
import { memberName } from "@/lib/client/household";
import { currentProfileId } from "@/lib/client/profiles";
import { ANSWER_WORD, type Ask } from "@/lib/client/takes";
import { useKeptScreens } from "@/lib/client/useKeptScreens";
import { VERDICT_WORD, type Verdict } from "@/lib/report/card";
import type { NamedRubric } from "@/lib/rubric/types";
import { LibraryControls } from "./LibraryControls";
import { bestIn, cellOf, gridColumns, type GridColumn } from "@/lib/client/gridColumns";
import { cardChips, type FactorCell } from "@/lib/report/factorCells";
import { GATE_MARK } from "@/lib/report/cardLines";
import { addedByLine } from "@/components/Household/AddedBy";
import { RescreenAll } from "./RescreenAll";
import { DragHandle, RowMenu, SortableRows, useSortableRow, type Mover } from "./MyOrder";
import { Recent } from "./Recent";
import { Star, unstarQuestion } from "@/components/Favorites/Star";
import { ResetConfirm } from "@/components/Rubric/ResetConfirm";
import { isFavorite, recentOf } from "@/lib/client/favorites";
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
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());

  const built = store.built;
  const me = currentProfileId();
  const log = useHistoryLog();
  // Step 8: the household's favorites, and this person's Recent (8c); someone else's unstarred parcels are in neither.
  const favorites = useMemo(() => built.filter(isFavorite), [built]);
  const mine = useMemo(
    () => (me ? recentOf(built, me, log, new Date().toISOString()) : []),
    [built, me, log],
  );
  const visible = useMemo(() => [...new Set([...favorites, ...mine])], [favorites, mine]);
  const screens = useKeptScreens(visible);
  // The members' rubrics (step 6) change when they set their priorities, here or by a sync.
  const { rubrics } = useRubricView();
  const household = useHousehold();
  const seen = useSeenTakes();
  const costs = useCostSettings();
  const rowOf = useMemo(
    () =>
      new Map(
        visible.map((p) => [
          p.key!,
          libraryRow(p, screens.get(p.key!), rubrics, { household, me, seen }, costs),
        ]),
      ),
    [visible, screens, rubrics, household, me, seen, costs],
  );
  // UX part 2 PR 7a (P-5): the ruled-out parcels have their own view; the Shortlist is the rest.
  const ruledOut = useMemo(() => favorites.filter((p) => p.status === "archived"), [favorites]);
  const rows = favorites.filter((p) => p.status !== "archived").map((p) => rowOf.get(p.key!)!);
  const tab = view.tab;
  const hidden = hiddenBy(rows, view.filters);
  // Step 10b: the grid's columns, from the favorites, without the ones the person hid (Columns ▾).
  const columns = gridColumns(rows, view.columns.hidden, hasStatus);
  // The marks' legend (Z-7): under the grid on a desktop; behind "?" on a phone.
  const marked = tab === "favorites" && columns.all.some((c) => c.kind === "factor");
  const [legendOpen, setLegendOpen] = useState(false);
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

  /** A row's tap (Z-2): the parcel on the map, the one panel, and the way back here. */
  const open = (key: string) => {
    const p = latest.current.built.find((b) => b.key === key);
    if (!p) return;
    openOnMap(p, { label: "Your list", href: "/library", scroll: window.scrollY });
    router.push("/explore");
  };
  // Back from the map (the chip): where the list was scrolled.
  useEffect(() => {
    const y = takeBackScroll("/library");
    if (y !== null) requestAnimationFrame(() => window.scrollTo(0, y));
  }, []);
  const compare = () => {
    setPref("ps.compare", [...ticked]);
    router.push("/compare");
  };
  const toggle = (key: string) => setTicked(toggleTick(ticked, key));
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
    open,
    ordering,
    mover,
    star,
    unstar: setUnstarring,
    report: (key: string) => router.push(reportHref(key)),
    addedBy: (r: LibraryRow) => addedByLine(adderOf.get(r.key) ?? null),
    sort: view.sort,
    // A header click: its sort, or the same one turned around (My order isn't a header).
    setSort: (key: SortKey) =>
      setView({
        ...view,
        sort: { key, reversed: view.sort.key === key ? !view.sort.reversed : false },
      }),
    columns,
  };

  return (
    <>
      <main className="compare library">
        <header className="compare-head">
          <h1>
            Your list
            {/* Z-7 (UX part 2 PR 7c2): on a phone, what the marks mean is behind "?"; a desktop has it under the list. */}
            {marked && (
              <button
                type="button"
                className="lib-legend-btn"
                aria-expanded={legendOpen}
                aria-label={CARD_WORDS.legend}
                title={CARD_WORDS.legend}
                onClick={() => setLegendOpen((o) => !o)}
              >
                ?
              </button>
            )}
          </h1>
        </header>
        {marked && legendOpen && <p className="tiny muted lib-legend lib-legend-top">{LEGEND}</p>}
        {/* Step 8 (plan §5): the Shortlist first; the choice is remembered with the view. UX part 2 PR 7a (P-5): Ruled
            out is its own view, and each says how many it holds. */}
        <div className="list-switch" role="tablist" aria-label="Shortlist, Recent or Ruled out">
          {(
            [
              ["favorites", LIST_VIEW_WORDS.favorites, rows.length],
              ["history", LIST_VIEW_WORDS.history, mine.length],
              ["ruledOut", LIST_VIEW_WORDS.ruledOut, ruledOut.length],
            ] as const
          ).map(([t, word, n]) => (
            <button
              key={t}
              role="tab"
              className="list-switch-seg"
              aria-selected={tab === t}
              onClick={() => setView({ ...view, tab: t })}
            >
              {word} <span className="list-switch-n">{n}</span>
            </button>
          ))}
        </div>

        {tab === "history" ? (
          <Recent parcels={mine} rows={rowOf} screens={screens} log={log} />
        ) : tab === "ruledOut" ? (
          <RuledOut
            parcels={ruledOut}
            rows={rowOf}
            open={open}
            change={change}
            grade={(r) => <Grade g={r.grades[0]?.graded ?? null} unscreened={r.unscreened} />}
          />
        ) : rows.length === 0 ? (
          <p className="muted">
            {FAVORITES_EMPTY} <Link href="/explore">Go to the map</Link>
          </p>
        ) : (
          <>
            <LibraryControls
              view={view}
              setView={setView}
              rows={rows}
              rubrics={rubrics}
              columns={columns.all}
            />
            <RescreenAll
              parcels={needing}
              nameOf={(key) => nameOf.get(key) ?? "the parcel"}
              onKept={(key, id) => change(key, (p) => ({ ...p, screenIds: [...p.screenIds, id] }))}
            />
            <p className="tiny muted lib-count">
              {shown.length} parcel{shown.length === 1 ? "" : "s"}
              {/* Polish #31: Help's grade rules, beside the grades. */}
              {" · "}
              <Link href={`/help#${GRADES_ID}`}>{GRADES_TITLE}</Link>
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
                {/* The fresh-eyes review (step 10b): what the marks mean, said once under the list. */}
                {marked && <p className="tiny muted lib-legend lib-legend-foot">{LEGEND}</p>}
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

        {/* UX part 2 PR 7a (P-5): the compare bar, at the foot of the screen, once a parcel is ticked; Compare takes 2 or
            3 (step 4b), so with one ticked it waits for another. */}
        {tab === "favorites" && ticked.size > 0 && (
          <div className="compare-bar" role="region" aria-label="Compare">
            <span>{LIST_VIEW_WORDS.ticked(ticked.size)}</span>
            <button
              className="btn"
              disabled={ticked.size < COMPARE_MIN}
              title={ticked.size < COMPARE_MIN ? COMPARE_HOW : undefined}
              onClick={compare}
            >
              Compare {ticked.size} →
            </button>
          </div>
        )}

        {unstarring && (
          <ResetConfirm
            question={unstarQuestion(
              adderOf.get(unstarring.key) && adderOf.get(unstarring.key) !== me
                ? memberName(adderOf.get(unstarring.key)!)
                : null,
            )}
            action="Remove from Your list"
            keep="Keep"
            reset={() => {
              unstarParcel(unstarring.key);
              setUnstarring(null);
            }}
            cancel={() => setUnstarring(null)}
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
  /** The ⋯ menu's Report card (step 9): opens the parcel's print page. */
  report(key: string): void;
  /** "Added by Zach", with two or more members (step 10b); null otherwise. */
  addedBy(r: LibraryRow): string | null;
  /** The sort in use, and a header's: the same key again turns it around (step 10b). */
  sort: LibrarySort;
  setSort(key: SortKey): void;
  /** The grid's columns (step 10b): every one the rows can fill, and those shown. */
  columns: { all: GridColumn[]; shown: GridColumn[] };
}

/** A row with a grade from a kept screen: its report card can print (step 9). */
const graded = (r: LibraryRow): boolean => r.grades[0]?.graded != null;

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
  return <span className="tiny muted">{unscreened === "rescreen" ? "Needs grading again" : "–"}</span>;
}

/** Why the same letter can read Contender on one row and Maybe on another (polish, step 8's review). */
/** The list's views and the compare bar (UX part 2 PR 7a, P-5). */
export const LIST_VIEW_WORDS = {
  favorites: "Shortlist",
  history: "Recent",
  ruledOut: "Ruled out",
  ticked: (n: number) => `${n} ticked`,
};

export const VERDICT_TIP =
  "The verdict also weighs your Must haves and limits, so the same letter can read differently.";

/**
 * Polish 2 (Z8, owner): the letter is a weighted average, so a parcel with an F can still read B; the tooltip says so
 * and names the row that costs it most, from the card's own rows.
 */
const gradeTip = (g: Graded): string =>
  `${VERDICT_TIP} The letter is a weighted average of every row${g.weakest ? `; its weakest: ${g.weakest}` : ""}.`;

function Grade({ g, unscreened }: { g: Graded | null; unscreened: LibraryRow["unscreened"] }) {
  if (!g) return <VerdictWord v={null} unscreened={unscreened} />;
  return (
    // J-4 (UX part 2 PR 7a): the verdict first, then the letter, as the card and the header have it.
    <span className="lib-grade" title={gradeTip(g)}>
      <VerdictWord v={g.verdict} unscreened={null} />
      <span className={`card-grade small g-${g.grade ?? "none"}`}>{g.grade ?? "–"}</span>
      {g.adjusted && (
        <span className="adjusted-mark" title={ADJUSTED_TITLE} aria-label={ADJUSTED_TITLE}>
          ✎
        </span>
      )}
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
      <OtherGrades r={r} />
    </span>
  );
}

/** Each other member's grade, take and note (the grid's Grades cell after the person's own; the phone card's line). */
function OtherGrades({ r }: { r: LibraryRow }) {
  const others = r.grades.slice(1);
  return (
    <>
      {others.map((g) => (
        <span key={g.id} className="lib-other-grade" title={`${g.name}'s grade`}>
          <span className="tiny muted">· {g.name}</span>
          <span className={`card-grade tiny g-${g.graded?.grade ?? "none"}`}>{g.graded?.grade ?? "–"}</span>
          {g.graded?.adjusted && (
            <span className="adjusted-mark tiny" title={ADJUSTED_TITLE} aria-label={ADJUSTED_TITLE}>
              ✎
            </span>
          )}
          {r.newTakesBy.includes(g.id) && (
            <span className="new-take" title="New take">
              <span className="new-dot" role="img" aria-label={`New take from ${g.name}`} />
              <span className="tiny new-word" aria-hidden="true">
                new
              </span>
            </span>
          )}
          {r.takes[g.id] && (
            <span className={`take-chip tiny a-${r.takes[g.id]}`} title={`${g.name}'s take`}>
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
    </>
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

/** Ready to build, all in (step 10): "$330–595k", or "$55–185k + land" without an asking price. */
const costCell = (r: LibraryRow): string =>
  r.costBuild ? `${costRange(r.costBuild.total)}${r.costBuild.plusLand ? " + land" : ""}` : "–";

/** Whether a row has a status word or a milestone (an active favorite with neither shows nothing). */
const hasStatus = (r: LibraryRow) => !!STATUS_WORD[r.status] || !!milestonesLine(r);

/** Best in column's words (step 10b plan §8): the ●'s title and label. */
const BEST_WORDS = "best in this column";
/** What the grid's and the strip's marks mean (the fresh-eyes review), under the list; step 12 appends ✎. */
const LEGEND =
  "✓ pass · ! check first · ✗ fail · ? not known · A–F the grade · ● best in its column · ≠ the listing's acres differ from the boundary's (open the parcel for both) · ✎ adjusted for this parcel · – set aside for this parcel";

/**
 * Desktop: the comparison grid (step 10b plan §1): in My order, the handle and the menu first; the name, its grade,
 * then the columns gridColumns gives (money, the factors in the viewer's rubric order, and Status, State, Updated, as
 * Columns ▾ leaves them). A header sorts; the header row and the Name column stay put while the grid scrolls.
 */
function LibraryTable({ rows, rubrics, sort, setSort, columns, ...rest }: RowsProps) {
  const shown = columns.shown;
  // Best in column (plan §1): the factor columns, $/ac and Cost to build.
  const best = new Map(
    shown
      .filter((c) => c.kind === "factor" || c.id === "perAcre" || c.id === "cost")
      .map((c) => [c.id, bestIn(rows, c.id)]),
  );
  const gradeKey = gradeSortKey(rubrics[0]!.id);
  // Polish 2 (L5): a fade at the right edge while the grid has more to its right (the sticky cells hide a shadow).
  const scroller = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const check = () => setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    check();
    el.addEventListener("scroll", check, { passive: true });
    const seen = new ResizeObserver(check);
    seen.observe(el);
    return () => {
      el.removeEventListener("scroll", check);
      seen.disconnect();
    };
  }, []);
  /** A header that sorts by its column; a second click turns it around (My order has no header). */
  const head = (label: ReactNode, key: SortKey, title?: string, className?: string) => {
    const on = sort.key === key;
    return (
      <th
        scope="col"
        className={className}
        title={title}
        aria-sort={on ? (sort.reversed ? "descending" : "ascending") : "none"}
      >
        <button className="lib-sort" onClick={() => setSort(key)}>
          {label}
          <span className="lib-sort-mark" aria-hidden="true">
            {on ? (sort.reversed ? " ▼" : " ▲") : ""}
          </span>
        </button>
      </th>
    );
  };
  return (
    <div className="lib-grid-wrap" data-more={more || undefined}>
      <div className="lib-scroll lib-grid" ref={scroller}>
        <table className="lib-table">
          <thead>
            <tr>
              <th scope="col" className="lib-stick lib-stick-1">
                <span className="sr-only">{rest.ordering ? "My order" : "More"}</span>
              </th>
              <th scope="col" className="lib-stick lib-stick-2">
                Compare
              </th>
              {head("Name", "name", undefined, "lib-stick lib-stick-3")}
              {head(
                rubrics.length > 1 ? "Grades" : switchLabel(rubrics[0]!),
                gradeKey,
                "Your grade and verdict",
              )}
              {shown.map((c) => (
                <Fragment key={c.id}>
                  {head(c.header, c.sort, c.title, c.kind === "factor" ? "lib-factor-h" : undefined)}
                </Fragment>
              ))}
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
                sort={sort}
                setSort={setSort}
                columns={columns}
                best={best}
                {...rest}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** A factor's cell: a Must's mark (with its letter when it's ranked too), or a row's letter; ● when best. */
function FactorCellView({ c, best }: { c: FactorCell | undefined; best: boolean }) {
  if (!c) return <span className="muted">–</span>;
  const label = `${c.title}: ${c.detail}${best ? `; ${BEST_WORDS}` : ""}`;
  return (
    // Z-6 (UX part 2 PR 7c1): the mark and letter in one fixed cell, then ✎, then ●, each in its own column.
    <span className="lib-factor" title={label} aria-label={label}>
      <span className="lib-key">
        {c.kind === "must" && c.status && (
          <span className={`lib-mark m-${c.status}`} aria-hidden="true">
            {GATE_MARK[c.status]}
          </span>
        )}
        {/* Polish 2 (L6): a Must that fails or isn't known shows its mark alone; its letter is in the panel. */}
        {c.grade !== undefined && !(c.kind === "must" && (c.status === "fail" || c.status === "unknown")) && (
          <span className={`card-grade small g-${c.grade ?? "none"}`} aria-hidden="true">
            {c.grade ?? "–"}
          </span>
        )}
        {c.setAside && <span className="muted">–</span>}
        {/* Polish 2 (L5): ● beside the letter it marks, inside the cell's fixed column, not between columns. */}
        {best && (
          <span className="lib-best" aria-hidden="true">
            ●
          </span>
        )}
      </span>
      {c.adjusted && (
        <span className="adjusted-mark" aria-hidden="true">
          ✎
        </span>
      )}
    </span>
  );
}

/** $/ac, marked ≠ with both readings when the listing's and the boundary's acres differ. */
function PerAcreCell({ r, best }: { r: LibraryRow; best: boolean }) {
  const pa = r.perAcre;
  if (!pa) return <span className="muted">–</span>;
  const title = [pa.both, best ? BEST_WORDS : null].filter(Boolean).join("; ") || undefined;
  return (
    <span className={pa.differs ? "lib-perac-differs" : undefined} title={title}>
      {pa.text}
      {pa.differs ? " ≠" : ""}
      {best && (
        <span className="lib-best" aria-label={BEST_WORDS}>
          {" "}
          ●
        </span>
      )}
    </span>
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
  report,
  addedBy,
  columns,
  best,
}: RowProps & { best: ReadonlyMap<string, ReadonlySet<string>> }) {
  const { nodeProps, dragging, handleProps } = useSortableRow(r.key, ordering);
  const isBest = (id: string) => best.get(id)?.has(r.key) ?? false;
  const by = addedBy(r);
  const cell = (c: GridColumn): ReactNode => {
    switch (c.id) {
      case "price":
        return <td className="num lib-c-price">{r.price !== null ? shortPrice(r.price) : "–"}</td>;
      case "acres":
        return <td className="num lib-c-acres">{r.acres !== null ? r.acres.toFixed(1) : "–"}</td>;
      case "perAcre":
        return (
          <td className="num lib-c-perac">
            <PerAcreCell r={r} best={isBest(c.id)} />
          </td>
        );
      case "cost":
        return (
          <td className="num lib-c-cost">
            {costCell(r)}
            {isBest(c.id) && (
              <span className="lib-best" title={BEST_WORDS} aria-label={BEST_WORDS}>
                {" "}
                ●
              </span>
            )}
          </td>
        );
      case "status":
        return <td className="lib-c-status">{statusCell(r)}</td>;
      case "state":
        return (
          <td className="lib-c-state">
            <State r={r} />
          </td>
        );
      case "updated":
        return <td className="tiny muted">{when(r.updatedAt)}</td>;
      default:
        return (
          <td className="lib-c-factor">
            <FactorCellView c={cellOf(r, c.id)} best={isBest(c.id)} />
          </td>
        );
    }
  };
  return (
    <tr
      {...nodeProps}
      className={rowClass("", r, dragging)}
      aria-label={`Open ${r.name}`}
      {...opens(() => open(r.key))}
    >
      {/* The grip in My order only; the ⋯ in every sort (step 9: Report card). */}
      <td className="lib-order lib-stick lib-stick-1" {...ownClick}>
        {ordering && <DragHandle name={r.name} handle={handleProps} />}
        <RowMenu
          name={r.name}
          index={index}
          count={count}
          move={ordering ? (to) => mover.move(r.key, to) : undefined}
          remove={() => unstar(r)}
          report={graded(r) ? () => report(r.key) : undefined}
        />
      </td>
      <td className="lib-stick lib-stick-2" {...ownClick}>
        <input
          type="checkbox"
          aria-label={`Compare ${r.name}`}
          checked={ticked.has(r.key)}
          disabled={!ticked.has(r.key) && ticked.size >= COMPARE_MAX}
          title={!ticked.has(r.key) && ticked.size >= COMPARE_MAX ? COMPARE_FULL : COMPARE_HOW}
          onChange={() => toggle(r.key)}
        />
      </td>
      <td className="lib-name lib-stick lib-stick-3">
        <span className="lib-name-line">
          {star(r)}
          <LongName name={r.name} className="lib-open" />
          {/* Step 10b: who added it, with two or more members: on the name's line, so a row stays one line high. */}
          {by && <span className="tiny muted lib-added-by">{by}</span>}
        </span>
        {r.ask && <AskNote ask={r.ask} />}
      </td>
      <td className="lib-c-grade">
        <Grades r={r} />
      </td>
      {columns.shown.map((c) => (
        <Fragment key={c.id}>{cell(c)}</Fragment>
      ))}
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

/** The phone card's words (Z-7, UX part 2 PR 7c2). */
export const CARD_WORDS = {
  compare: "Compare",
  noPrice: "no price",
  noBuild: "build not priced",
  legend: "What the marks mean",
};

/** The phone card's money line (Z-7): price · $/ac · build cost. */
const moneyLine = (r: LibraryRow): string =>
  [
    r.price !== null ? shortPrice(r.price) : CARD_WORDS.noPrice,
    // Step 10b: the price per acre, marked ≠ when the listing's and the boundary's acres differ.
    r.perAcre ? `${r.perAcre.text}${r.perAcre.differs ? " ≠" : ""}` : null,
    r.costBuild ? `build ${costCell(r)}` : CARD_WORDS.noBuild,
  ]
    .filter(Boolean)
    .join(" · ");

/**
 * The phone card's chips (Z-7): the person's top four factors (factorCells.ts cardChips), each its mark or letter and
 * its short name; a failing Must in red. The whole of it, each with its full name, is in its label.
 */
function CardChips({ r }: { r: LibraryRow }) {
  const chips = cardChips(r.factors);
  if (!chips.length) return null;
  const label = chips.map((c) => `${c.title} ${c.text}`).join("; ");
  return (
    <div className="lib-fchips" aria-label={label} title={label}>
      {chips.map((c) => (
        <span key={c.key} className={`lib-fchip${c.status ? ` m-${c.status}` : ""}`} aria-hidden="true">
          {c.kind === "must" && c.status && c.grade === undefined ? (
            <span className={`lib-mark m-${c.status}`}>{GATE_MARK[c.status]}</span>
          ) : (
            <span className={`card-grade tiny g-${c.grade ?? "none"}`}>{c.grade ?? "–"}</span>
          )}
          {c.short}
          {c.adjusted && <span className="adjusted-mark">✎</span>}
        </span>
      ))}
    </div>
  );
}

function Card({ r, index, count, ticked, toggle, open, ordering, mover, unstar, report }: RowProps) {
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
        {/* Z-7 (UX part 2 PR 7c2): the first line is the name, the verdict and the letter. Every card here is on the
            list, so it has no star: ⋯ has Remove from Your list. */}
        <div className="lib-card-head">
          <LongName name={r.name} className="lib-open" />
          <Grade g={r.grades[0]?.graded ?? null} unscreened={r.unscreened} />
        </div>
        {r.grades.length > 1 && (
          <div className="lib-chips lib-card-others">
            <OtherGrades r={r} />
          </div>
        )}
        {r.ask && <AskNote ask={r.ask} />}
        {/* Polish: an active favorite with no milestone has nothing to say here; no lone "–". */}
        {(STATUS_WORD[r.status] || milestonesLine(r)) && <div className="tiny">{statusCell(r)}</div>}
        <div className="tiny lib-card-money">{moneyLine(r)}</div>
        <CardChips r={r} />
      </div>
      <label className="lib-card-cmp" {...ownClick}>
        <input
          type="checkbox"
          aria-label={`Compare ${r.name}`}
          checked={ticked.has(r.key)}
          disabled={!ticked.has(r.key) && ticked.size >= COMPARE_MAX}
          title={!ticked.has(r.key) && ticked.size >= COMPARE_MAX ? COMPARE_FULL : COMPARE_HOW}
          onChange={() => toggle(r.key)}
        />
        <span aria-hidden="true">{CARD_WORDS.compare}</span>
      </label>
      <div className="lib-card-more">
        <RowMenu
          name={r.name}
          index={index}
          count={count}
          move={ordering ? (to) => mover.move(r.key, to) : undefined}
          remove={() => unstar(r)}
          report={graded(r) ? () => report(r.key) : undefined}
        />
      </div>
    </li>
  );
}
