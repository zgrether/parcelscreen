"use client";
/**
 * The listing's facts (WF1, docs/plans/parcel-workflow.md §2), at the top of the Info panel's Notes tab: the
 * household's name for the parcel, the listing's link, the asking price, the acres the listing claims and the agent.
 * Each saves when its box loses focus or on Enter, for the parcel open when it was typed. The link is never fetched;
 * the agent is a third party's contact and stays with the parcel.
 */
import { useState } from "react";
import { askingLine, parsePrice } from "@/lib/client/askingPrice";
import { safeListingHref } from "@/lib/client/listingUrl";
import type { ListingField, WorkingParcel } from "@/lib/client/parcelStore";
import { listingAcresNote, listingFolds, listingSummary } from "@/lib/report/listing";
import type { ExploreController } from "@/components/Explore/useExploreController";

export function ListingFacts({ ctl, derivedName }: { ctl: ExploreController; derivedName: string }) {
  const open = ctl.state.store.open!;
  const serial = ctl.state.serial;
  const save = (patch: Partial<Pick<WorkingParcel, ListingField>>) => ctl.saveListing(patch, serial);
  const href = safeListingHref(open.listingUrl);
  const acresNote = listingAcresNote(open.listingAcres, ctl.derived?.ok ? ctl.derived.acres : null);
  // On a phone (owner, #130) the section folds to one line once it has a name or a price, as the tab opens; it stays
  // open while empty, and doesn't fold under the fingers while it's being filled. Desktop always shows it (CSS).
  const [expanded, setExpanded] = useState(() => !listingFolds(open));
  return (
    <div className="ip-listing" role="group" aria-label="Listing" data-folded={expanded ? undefined : ""}>
      {listingFolds(open) && (
        <button
          className="ip-listing-summary"
          aria-expanded={expanded}
          onClick={() => setExpanded((e) => !e)}
        >
          <span>{listingSummary(open, derivedName)}</span>
          <span aria-hidden="true">{expanded ? "▴" : "▾"}</span>
        </button>
      )}
      <TextField
        label="Name"
        value={open.name}
        placeholder={derivedName}
        save={(name) => save({ name: name.trim() })}
      />
      <TextField
        label="Listing link"
        value={open.listingUrl}
        placeholder="Paste the Redfin, Zillow or LandWatch link"
        save={(listingUrl) => save({ listingUrl: listingUrl.trim() })}
        after={
          href ? (
            <a className="ip-link" href={href} target="_blank" rel="noopener noreferrer">
              Open listing ↗
            </a>
          ) : null
        }
      />
      <AskingPrice ctl={ctl} />
      <AcresField
        value={open.listingAcres}
        save={(listingAcres) => save({ listingAcres })}
        note={acresNote}
      />
      <TextField
        label="Agent"
        value={open.agent}
        placeholder="Name, phone, email"
        save={(agent) => save({ agent: agent.trim() })}
      />
    </div>
  );
}

/** A text box saved on Enter or leaving it. Keyed by its value, so a save from elsewhere shows. */
function TextField(props: {
  label: string;
  value: string;
  placeholder: string;
  save(v: string): void;
  after?: React.ReactNode;
}) {
  return <TextBox key={props.value} {...props} />;
}

function TextBox({
  label,
  value,
  placeholder,
  save,
  after,
}: {
  label: string;
  value: string;
  placeholder: string;
  save(v: string): void;
  after?: React.ReactNode;
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
function AskingPrice({ ctl }: { ctl: ExploreController }) {
  const open = ctl.state.store.open!;
  const serial = ctl.state.serial;
  const [text, setText] = useState(open.askingPrice !== null ? String(open.askingPrice) : "");
  const [bad, setBad] = useState(false);
  const commit = () => {
    const v = parsePrice(text);
    setBad(v === undefined);
    if (v !== undefined) ctl.saveAskingPrice(v, serial);
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
      <span className="tiny muted">
        {bad
          ? "Enter dollars, like 185,000 or 185k."
          : open.askingPrice !== null && open.askingPriceAt
            ? askingLine(open.askingPrice, open.askingPriceAt)
            : ""}
      </span>
    </div>
  );
}
