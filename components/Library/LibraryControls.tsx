"use client";
/**
 * The list's filters and sort (WF2b, docs/plans/parcel-workflow.md §5): status, the household verdict (the default
 * filter, owner #128), each rubric's verdict (step 1: when the profile holds more than its own), milestones, a price
 * range and the state; sorted in My order (WF3, the default), or by when it changed, price, acres, the household
 * verdict or any grade. Views only: they never change a parcel. Folded behind one "Filters" button, which says how
 * many differ from the defaults.
 */
import { Fragment, useState } from "react";
import {
  DEFAULT_VIEW,
  gradeSortKey,
  VERDICT_CHOICES,
  type LibraryFilters,
  type LibraryRow,
  type LibraryView,
  type SortKey,
  type VerdictChoice,
} from "@/lib/client/library";
import { parsePrice } from "@/lib/client/askingPrice";
import { MILESTONE_WORD, MILESTONES, STATUS_WORD } from "@/lib/client/parcelStatus";
import type { ParcelStatus } from "@/lib/client/parcelStore";
import { switchLabel } from "@/lib/client/rubrics";
import type { NamedRubric } from "@/lib/rubric/types";

// Step 8 (plan §4): Favorites are active by default; the one status chip shows the archived ones too.
const STATUSES: ParcelStatus[] = ["archived"];
const CHOICE_WORD: Record<VerdictChoice, string> = {
  Contender: "Contender",
  Maybe: "Maybe",
  Pass: "Not for us",
  unscreened: "Not screened",
};
const SORTS: { key: SortKey; label: string }[] = [
  { key: "order", label: "My order" },
  { key: "updated", label: "Last changed" },
  { key: "price", label: "Price" },
  { key: "acres", label: "Acres" },
  { key: "costBuild", label: "Cost to build" },
];
/** The sorts for a profile's rubrics: the household verdict when it holds several, then each grade. */
const sortsFor = (rubrics: readonly NamedRubric[]): { key: SortKey; label: string }[] => [
  ...SORTS,
  ...(rubrics.length > 1
    ? [
        { key: "household" as const, label: "Household verdict" },
        // Step 6: by the worst of everyone's grades.
        { key: "lowest" as const, label: "Lowest of our grades" },
      ]
    : []),
  ...rubrics.map((nr) => ({ key: gradeSortKey(nr.id), label: switchLabel(nr) })),
];

/** How many of the fold's filters differ from the defaults; the quick ones beside it show as pressed (polish). */
function changedFilters(f: LibraryFilters): number {
  const d = DEFAULT_VIEW.filters;
  const same = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((x) => b.includes(x));
  return [
    !same(f.status, d.status),
    !same(f.household, d.household),
    ...Object.values(f.grades).map((g) => !same(g, [...VERDICT_CHOICES])),
    f.milestones.length > 0,
    f.priceMin !== null || f.priceMax !== null,
    f.state !== null,
  ].filter(Boolean).length;
}

export function LibraryControls({
  view,
  setView,
  rows,
  rubrics,
}: {
  view: LibraryView;
  setView(v: LibraryView): void;
  rows: LibraryRow[];
  rubrics: readonly NamedRubric[];
}) {
  const [open, setOpen] = useState(false);
  const f = view.filters;
  const setF = (patch: Partial<LibraryFilters>) => setView({ ...view, filters: { ...f, ...patch } });
  const waiting = rows.filter((r) => r.waiting).length;
  const fresh = rows.filter((r) => r.newTakesBy.length > 0).length;
  const flip = <T,>(list: T[], x: T): T[] => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);
  const states = [...new Set(rows.flatMap((r) => r.states))].sort();
  const n = changedFilters(f);
  const several = rubrics.length > 1;
  const sorts = sortsFor(rubrics);
  const chips = <T extends string>(
    label: string,
    all: readonly T[],
    on: T[],
    word: (x: T) => string,
    set: (v: T[]) => void,
  ) => (
    <div className="ip-chips lib-filter" role="group" aria-label={label}>
      <span className="tiny muted lib-filter-label">{label}</span>
      {all.map((x) => (
        <button key={x} className="chip" aria-pressed={on.includes(x)} onClick={() => set(flip(on, x))}>
          {word(x)}
        </button>
      ))}
    </div>
  );
  return (
    <div className="lib-controls">
      <div className="lib-bar">
        <button
          className="btn small secondary lib-filters-btn"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {/* Polish: "· 1 on" counts filters, where Waiting for you (1) counts parcels. */}
          Filters{n ? ` · ${n} on` : ""}
        </button>
        {/* Step 6: the household's quick filters, beside Filters; polish #14: New takes, what the tab's badge counts. */}
        {(several || waiting > 0 || fresh > 0) && (
          <>
            <button
              className="chip lib-quick"
              aria-pressed={f.waiting}
              onClick={() => setF({ waiting: !f.waiting })}
            >
              Waiting for you{waiting ? ` (${waiting})` : ""}
            </button>
            {(fresh > 0 || f.newTakes) && (
              <button
                className="chip lib-quick"
                aria-pressed={f.newTakes}
                onClick={() => setF({ newTakes: !f.newTakes })}
              >
                New takes{fresh ? ` (${fresh})` : ""}
              </button>
            )}
            <button
              className="chip lib-quick"
              aria-pressed={f.bothLike}
              onClick={() => setF({ bothLike: !f.bothLike })}
            >
              Both like it
            </button>
          </>
        )}
        <label className="tiny">
          Sort by{" "}
          <select
            value={view.sort.key}
            onChange={(e) => setView({ ...view, sort: { key: e.target.value as SortKey, reversed: false } })}
          >
            {sorts.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        {/* My order is the household's own (WF3): it's rearranged, not turned around. */}
        {view.sort.key !== "order" && (
          <button
            className="btn small secondary"
            aria-label="Reverse the order"
            aria-pressed={view.sort.reversed}
            onClick={() => setView({ ...view, sort: { ...view.sort, reversed: !view.sort.reversed } })}
          >
            ⇅
          </button>
        )}
      </div>
      {open && (
        <div className="lib-filters">
          {chips(
            "Status",
            STATUSES,
            f.status,
            (s) => STATUS_WORD[s],
            (status) => setF({ status }),
          )}
          {/* With one rubric the household verdict is its own: one "Verdict" filter, no column per rubric. */}
          {chips(
            several ? "Household" : "Verdict",
            VERDICT_CHOICES,
            f.household,
            (c) => CHOICE_WORD[c],
            (household) => setF({ household }),
          )}
          {several &&
            rubrics.map((nr) => (
              <Fragment key={nr.id}>
                {chips(
                  switchLabel(nr),
                  VERDICT_CHOICES,
                  f.grades[nr.id] ?? [...VERDICT_CHOICES],
                  (c) => CHOICE_WORD[c],
                  (on) => setF({ grades: { ...f.grades, [nr.id]: on } }),
                )}
              </Fragment>
            ))}
          {chips(
            "Milestones",
            MILESTONES,
            f.milestones,
            (m) => MILESTONE_WORD[m],
            (milestones) => setF({ milestones }),
          )}
          <div className="ip-chips lib-filter">
            <span className="tiny muted lib-filter-label">Price</span>
            <PriceBox label="Lowest price" value={f.priceMin} set={(priceMin) => setF({ priceMin })} />
            <span className="tiny muted">to</span>
            <PriceBox label="Highest price" value={f.priceMax} set={(priceMax) => setF({ priceMax })} />
          </div>
          <label className="ip-chips lib-filter">
            <span className="tiny muted lib-filter-label">State</span>
            <select
              aria-label="State"
              value={f.state ?? ""}
              onChange={(e) => setF({ state: (e.target.value || null) as LibraryFilters["state"] })}
            >
              <option value="">All</option>
              {states.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn secondary small"
            onClick={() => setView({ ...view, filters: DEFAULT_VIEW.filters })}
          >
            Reset the filters
          </button>
        </div>
      )}
    </div>
  );
}

/** Dollars, as typed ("185k" or "185,000"); blank for no bound. Kept on Enter or leaving the box. */
function PriceBox({
  label,
  value,
  set,
}: {
  label: string;
  value: number | null;
  set(v: number | null): void;
}) {
  return <PriceInput key={String(value)} label={label} value={value} set={set} />;
}

function PriceInput({
  label,
  value,
  set,
}: {
  label: string;
  value: number | null;
  set(v: number | null): void;
}) {
  const [text, setText] = useState(value !== null ? String(value) : "");
  const keep = () => {
    const v = parsePrice(text);
    if (v === undefined) setText(value !== null ? String(value) : "");
    else if (v !== value) set(v);
  };
  return (
    <input
      className="lib-price"
      inputMode="decimal"
      aria-label={label}
      placeholder="any"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={keep}
      onKeyDown={(e) => {
        if (e.key === "Enter") keep();
      }}
    />
  );
}
