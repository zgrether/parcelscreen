"use client";
/**
 * The list's filters and sort (WF2b, docs/plans/parcel-workflow.md §5): status, the household verdict (the default
 * filter, owner #128), each person's verdict, milestones, a price range and the state; sorted in My order (WF3, the
 * default), or by when it changed, price, acres, the household verdict or either grade. Views only: they never change a parcel. Folded behind one
 * "Filters" button, which says how many differ from the defaults.
 */
import { useState } from "react";
import {
  DEFAULT_VIEW,
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

const STATUSES: ParcelStatus[] = ["inProgress", "saved", "archived"];
const CHOICE_WORD: Record<VerdictChoice, string> = {
  Contender: "Contender",
  Maybe: "Maybe",
  Pass: "Pass",
  unscreened: "Not screened",
};
const SORTS: { key: SortKey; label: string }[] = [
  { key: "order", label: "My order" },
  { key: "updated", label: "Last changed" },
  { key: "price", label: "Price" },
  { key: "acres", label: "Acres" },
  { key: "household", label: "Household verdict" },
  { key: "zach", label: "Zach's grade" },
  { key: "julie", label: "Julie's grade" },
];

/** How many filters differ from the defaults. */
function changedFilters(f: LibraryFilters): number {
  const d = DEFAULT_VIEW.filters;
  const same = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((x) => b.includes(x));
  return [
    !same(f.status, d.status),
    !same(f.household, d.household),
    !same(f.zach, d.zach),
    !same(f.julie, d.julie),
    f.milestones.length > 0,
    f.priceMin !== null || f.priceMax !== null,
    f.state !== null,
  ].filter(Boolean).length;
}

export function LibraryControls({
  view,
  setView,
  rows,
}: {
  view: LibraryView;
  setView(v: LibraryView): void;
  rows: LibraryRow[];
}) {
  const [open, setOpen] = useState(false);
  const f = view.filters;
  const setF = (patch: Partial<LibraryFilters>) => setView({ ...view, filters: { ...f, ...patch } });
  const flip = <T,>(list: T[], x: T): T[] => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);
  const states = [...new Set(rows.map((r) => r.state).filter((s): s is NonNullable<typeof s> => !!s))].sort();
  const n = changedFilters(f);
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
        <button className="btn small secondary" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          Filters{n ? ` (${n})` : ""}
        </button>
        <label className="tiny">
          Sort by{" "}
          <select
            value={view.sort.key}
            onChange={(e) => setView({ ...view, sort: { key: e.target.value as SortKey, reversed: false } })}
          >
            {SORTS.map((s) => (
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
          {chips(
            "Household",
            VERDICT_CHOICES,
            f.household,
            (c) => CHOICE_WORD[c],
            (household) => setF({ household }),
          )}
          {chips(
            "Zach",
            VERDICT_CHOICES,
            f.zach,
            (c) => CHOICE_WORD[c],
            (zach) => setF({ zach }),
          )}
          {chips(
            "Julie",
            VERDICT_CHOICES,
            f.julie,
            (c) => CHOICE_WORD[c],
            (julie) => setF({ julie }),
          )}
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
          <button className="link-btn" onClick={() => setView({ ...view, filters: DEFAULT_VIEW.filters })}>
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
