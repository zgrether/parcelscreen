"use client";
/**
 * The listing's facts (WF1, docs/plans/parcel-workflow.md §2), at the top of the Info panel's Notes tab and of a
 * parcel's detail on the list (owner, after #133): the household's name for the parcel, the listing's link, the asking
 * price, the acres the listing claims, the agent, and (step 14) the deed's restrictions and the HOA. Each saves when
 * its box loses focus or on Enter (the HOA on a tap). The link is never fetched; the agent is a third party's contact and
 * stays with the parcel.
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import { perAcre } from "@/lib/report/perAcre";
import { askingLine, parsePrice } from "@/lib/client/askingPrice";
import { safeListingHref } from "@/lib/client/listingUrl";
import { HOA_VALUES, type ListingField, type WorkingParcel } from "@/lib/client/parcelStore";
import { listingAcresNote, listingFolds, listingSummary } from "@/lib/report/listing";
import { HOA_WORD, LIMIT_WORDS, SOURCE } from "@/lib/uses/words";

export interface ListingSaves {
  listing(patch: Partial<Pick<WorkingParcel, ListingField>>): void;
  askingPrice(price: number | null): void;
  /** J-5 (UX part 2 PR 3c2): a survey's figures, or null to clear them. Absent: no Survey fields. */
  survey?(s: { acres: number | null; frontageFt: number | null } | null): void;
}

export function ListingFacts({
  parcel: open,
  derivedName,
  acres,
  save,
  focusName = 0,
}: {
  parcel: WorkingParcel;
  derivedName: string;
  /** The boundary's acres, to compare the listing's with. */
  acres: number | null;
  save: ListingSaves;
  /** Bumped to unfold the section and put the cursor in Name ("Add a name", owner after #133). */
  focusName?: number;
}) {
  const href = safeListingHref(open.listingUrl);
  const acresNote = listingAcresNote(open.listingAcres, acres);
  // The section folds to one line once it has a name or a price, as the tab opens (owner, #130, a phone's; polish #24,
  // a desktop's too); it stays open while empty, and doesn't fold under the fingers while it's being filled.
  const [expanded, setExpanded] = useState(() => !listingFolds(open));
  // "Add a name": unfolded (adjusted while rendering, as React recommends), then focused once it's on screen.
  const [focused, setFocused] = useState(focusName);
  if (focusName !== focused) {
    setFocused(focusName);
    setExpanded(true);
  }
  const nameBox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focusName) nameBox.current?.focus();
  }, [focusName]);
  return (
    <div className="ip-listing" role="group" aria-label="Listing" data-folded={expanded ? undefined : ""}>
      {listingFolds(open) && (
        <button
          className="ip-listing-summary"
          aria-expanded={expanded}
          onClick={() => setExpanded((e) => !e)}
        >
          <span>{listingSummary(open, derivedName, acres)}</span>
          {/* The fresh-eyes review (polish): a name and ▾ read as a picker; the words say it opens the facts. */}
          <span className="ip-listing-toggle">{expanded ? "Fold ▴" : "Edit ▾"}</span>
        </button>
      )}
      <TextField
        label="Name"
        value={open.name}
        placeholder={derivedName}
        save={(name) => save.listing({ name: name.trim() })}
        inputRef={nameBox}
      />
      <TextField
        label="Listing link"
        value={open.listingUrl}
        placeholder="Paste the Redfin, Zillow or LandWatch link"
        save={(listingUrl) => save.listing({ listingUrl: listingUrl.trim() })}
        after={
          href ? (
            <a className="ip-link" href={href} target="_blank" rel="noopener noreferrer">
              Open listing ↗
            </a>
          ) : null
        }
      />
      <AskingPrice key={String(open.askingPrice)} parcel={open} acres={acres} save={save.askingPrice} />
      <AcresField
        value={open.listingAcres}
        save={(listingAcres) => save.listing({ listingAcres })}
        note={acresNote}
      />
      {save.survey && <SurveyFields survey={open.facts?.survey ?? null} save={save.survey} />}
      <TextField
        label="Agent"
        value={open.agent}
        placeholder="Name, phone, email"
        save={(agent) => save.listing({ agent: agent.trim() })}
      />
      {/* Step 14 (plan §3.2): What limits you lists both; neither changes the grade. */}
      <TextField
        label={LIMIT_WORDS.deed}
        value={open.deedRestrictions}
        placeholder="What the deed restricts, if anything"
        save={(deedRestrictions) => save.listing({ deedRestrictions: deedRestrictions.trim() })}
        after={open.fromOriginal?.includes("deedRestrictions") && <FromOriginalNote />}
      />
      <div className="ip-field" role="group" aria-label={LIMIT_WORDS.hoa}>
        <span>{LIMIT_WORDS.hoa}</span>
        <div className="ip-line-row">
          {HOA_VALUES.map((h) => (
            <button
              key={h}
              className="chip"
              aria-pressed={open.hoa === h}
              onClick={() => open.hoa !== h && save.listing({ hoa: h })}
            >
              {HOA_WORD[h]}
            </button>
          ))}
        </div>
        {open.fromOriginal?.includes("hoa") && <FromOriginalNote />}
      </div>
    </div>
  );
}

/** Owner, after #312: a piece added from a split brought this from its parcel; an edit makes it the person's own. */
function FromOriginalNote() {
  return <span className="tiny muted ip-from">{SOURCE.original}</span>;
}

/** A text box saved on Enter or leaving it. Keyed by its value, so a save from elsewhere shows. */
function TextField(props: {
  label: string;
  value: string;
  placeholder: string;
  save(v: string): void;
  after?: React.ReactNode;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  return <TextBox key={props.value} {...props} />;
}

function TextBox({
  label,
  value,
  placeholder,
  save,
  after,
  inputRef,
}: {
  label: string;
  value: string;
  placeholder: string;
  save(v: string): void;
  after?: React.ReactNode;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const [text, setText] = useState(value);
  const keep = () => {
    if (text !== value) save(text);
  };
  return (
    <div className="ip-field">
      <label>
        {label}
        <input
          ref={inputRef}
          aria-label={label}
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={keep}
          onKeyDown={(e) => {
            if (e.key === "Enter") keep();
          }}
        />
      </label>
      {after}
    </div>
  );
}

/** The listing's acres: a positive number, or blank for none; anything else is put back. */
/**
 * A survey's acres and road frontage (J-5, UX part 2 PR 3c2): facts for every member. Divide, $/ac and the header use
 * them before the listing's acres and the county map's. Either may be blank; both blank clears the survey.
 */
function SurveyFields({
  survey,
  save,
}: {
  survey: { acres: number | null; frontageFt: number | null } | null;
  save(s: { acres: number | null; frontageFt: number | null } | null): void;
}) {
  const acres = survey?.acres ?? null;
  const frontageFt = survey?.frontageFt ?? null;
  const keep = (next: { acres: number | null; frontageFt: number | null }) =>
    save(next.acres === null && next.frontageFt === null ? null : next);
  return (
    <div className="ip-survey" role="group" aria-label="Survey">
      <NumberBox
        key={`a${acres}`}
        label="Surveyed acres"
        placeholder="from the survey"
        unit={/\s*ac(res)?$/i}
        value={acres}
        positive
        save={(v) => keep({ acres: v, frontageFt })}
      />
      <NumberBox
        key={`f${frontageFt}`}
        label="Surveyed road frontage (ft)"
        placeholder="from the survey"
        unit={/\s*(ft|feet)$/i}
        value={frontageFt}
        save={(v) => keep({ acres, frontageFt: v })}
      />
      <span className="tiny muted">
        A fact for everyone: Divide, $/ac and the header use these before the listing&apos;s and the county
        map&apos;s.
      </span>
    </div>
  );
}

/** A number box that saves on blur or Enter; a blank saves null, anything unreadable goes back to what was saved. */
function NumberBox({
  label,
  placeholder,
  unit,
  value,
  positive = false,
  save,
}: {
  label: string;
  placeholder: string;
  unit: RegExp;
  value: number | null;
  positive?: boolean;
  save(v: number | null): void;
}) {
  const [text, setText] = useState(value !== null ? String(value) : "");
  const keep = () => {
    const t = text.trim().replace(/,/g, "").replace(unit, "");
    const v = t === "" ? null : Number(t);
    if (v === null || (Number.isFinite(v) && (positive ? v > 0 : v >= 0))) {
      if (v !== value) save(v);
    } else setText(value !== null ? String(value) : "");
  };
  return (
    <div className="ip-field">
      <label>
        {label}
        <input
          inputMode="decimal"
          aria-label={label}
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={keep}
          onKeyDown={(e) => {
            if (e.key === "Enter") keep();
          }}
        />
      </label>
    </div>
  );
}

function AcresField({
  value,
  save,
  note,
}: {
  value: number | null;
  save(v: number | null): void;
  note: string | null;
}) {
  return <AcresBox key={String(value)} value={value} save={save} note={note} />;
}

function AcresBox({
  value,
  save,
  note,
}: {
  value: number | null;
  save(v: number | null): void;
  note: string | null;
}) {
  const [text, setText] = useState(value !== null ? String(value) : "");
  const keep = () => {
    const t = text
      .trim()
      .replace(/,/g, "")
      .replace(/\s*ac(res)?$/i, "");
    const v = t === "" ? null : Number(t);
    if (v === null || (Number.isFinite(v) && v > 0)) {
      if (v !== value) save(v);
    } else setText(value !== null ? String(value) : "");
  };
  return (
    <div className="ip-field">
      <label>
        Listing acres
        <input
          inputMode="decimal"
          aria-label="Listing acres"
          placeholder="e.g. 52"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={keep}
          onKeyDown={(e) => {
            if (e.key === "Enter") keep();
          }}
        />
      </label>
      {note && <span className="tiny">{note}</span>}
    </div>
  );
}

/**
 * The asking price (owner, #101, 2026-10-11): entered by hand, saved when the box loses focus or on Enter, with the
 * date it was entered ("asking $X as of [date]"). Nothing reads it yet: the cost-to-enjoy stages will (VR4).
 */
function AskingPrice({
  parcel: open,
  acres,
  save,
}: {
  parcel: WorkingParcel;
  /** The boundary's acres, for the $/ac (step 10b). */
  acres: number | null;
  save(price: number | null): void;
}) {
  const pa = perAcre(open.askingPrice, open.listingAcres, acres);
  const [text, setText] = useState(open.askingPrice !== null ? String(open.askingPrice) : "");
  const [bad, setBad] = useState(false);
  const commit = () => {
    const v = parsePrice(text);
    setBad(v === undefined);
    if (v !== undefined) save(v);
  };
  return (
    <div className="ip-price">
      <label>
        Asking price
        <input
          inputMode="decimal"
          aria-label="Asking price"
          placeholder="e.g. 185,000"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
          }}
        />
      </label>
      <span className="tiny muted" title={pa?.both ?? undefined}>
        {bad
          ? "Enter dollars, like 185,000 or 185k."
          : open.askingPrice !== null && open.askingPriceAt
            ? askingLine(open.askingPrice, open.askingPriceAt)
            : ""}
        {/* Step 10b: the price per acre, marked when the listing's and the boundary's acres differ. */}
        {!bad && pa && ` · ${pa.text}${pa.differs ? " ≠" : ""}`}
      </span>
    </div>
  );
}
