"use client";
/**
 * A line's and a mark's details (owner, #127; WF4, WF5): what Lines & marks shows for an open row (step 8b; it was the
 * Info panel's details area). Each box saves on Enter or leaving it, for the parcel open as `serial`. Keyed by the
 * markup, so the boxes start from its own values.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { area, length, lineString } from "@turf/turf";
import {
  EASEMENT_TYPES,
  KIND_NAME,
  LINE_CONDITIONS,
  type AreaMarkup,
  type LineCondition,
  type LineKind,
  type LineMarkup,
  type PointMarkup,
} from "@/lib/client/parcelStore";
import { M2FT, M2_PER_ACRE } from "@/lib/geo/types";
import { AREA_KINDS, areaPolygon, POINT_KINDS, SEPTIC_CLASSES, type SepticClass } from "@/lib/report/marks";
import { lineSummary, routeFromLine } from "@/lib/report/lines";
import type { ExploreController } from "@/components/Explore/useExploreController";
import { useScreenItContext } from "@/components/Results/ScreenItContext";
import { EASEMENT_TYPE_CAPTION, EASEMENT_TYPE_WORD } from "@/lib/uses/words";

export const Btn = ({
  kind = "sec",
  onClick,
  children,
}: {
  kind?: "go" | "sec" | "danger";
  onClick(): void;
  children: ReactNode;
}) => (
  <button className={`ip-btn ${kind}`} onClick={onClick}>
    {children}
  </button>
);

const KINDS: LineKind[] = ["track", "easement", "drive"];
const CONDITION_WORD: Record<LineCondition, string> = {
  uncleared: "Uncleared",
  pioneer: "Pioneer",
  improved: "Improved",
  paved: "Paved",
};

/**
 * A drawn line's details (owner, #127; step 8b: its open row in Lines & marks): its name, what it is,
 * its ground's condition, its width, a note saying where it came from (deed, plat, survey, a visit), and its length
 * and grades once a screen has measured it (34-2). Keyed by the line, so the boxes start from its own values.
 */
export function LineDetails({ ctl, m }: { ctl: ExploreController; m: LineMarkup }) {
  const serial = ctl.state.serial;
  const s = useScreenItContext();
  const result = s?.shown && !s.stale ? s.shown.result : null;
  const measured = result?.lines.find((l) => l.id === m.id);
  const [note, setNote] = useState(m.note);
  const ft = length(lineString(m.line.map(([lat, lon]) => [lon, lat])), { units: "meters" }) * M2FT;
  const saveNote = () => {
    if (note !== m.note) ctl.saveMarkupNote(m.id, note, serial);
  };
  // WF5: the screen found a route from this line's end, which the card can score as the driveway.
  const routed = !!result && !!routeFromLine(result, m.id);
  const chosen = ctl.state.store.open?.drivewayLine === m.id;
  return (
    <>
      <LineName name={m.name} save={(name) => ctl.renameMarkup(m.id, name, serial)} />
      <p className="ip-note">
        {measured ? lineSummary(measured) : `${Math.round(ft).toLocaleString()} ft`}
        {!measured && result && " (grade again to see it graded)"}
      </p>
      {routed && (
        <div className="ip-line-row">
          {chosen ? (
            <>
              <span className="ip-note">The card scores its route as your driveway.</span>
              <Btn onClick={() => ctl.setDrivewayLine(null, serial)}>Use the app&apos;s pick</Btn>
            </>
          ) : (
            <Btn onClick={() => ctl.setDrivewayLine(m.id, serial)}>Use as my driveway</Btn>
          )}
        </div>
      )}
      <div className="pd-caption" aria-hidden="true">
        What it is
      </div>
      <div className="ip-line-row" role="group" aria-label="What it is">
        {KINDS.map((k) => (
          <button
            key={k}
            className="chip"
            aria-pressed={m.kind === k}
            onClick={() => ctl.setMarkupKind(m.id, k, serial)}
          >
            {KIND_NAME[k]}
          </button>
        ))}
      </div>
      <div className="pd-caption" aria-hidden="true">
        Its condition
      </div>
      <div className="ip-line-row" role="group" aria-label="Its condition">
        {LINE_CONDITIONS.map((c) => (
          <button
            key={c}
            className="chip"
            aria-pressed={m.condition === c}
            onClick={() => ctl.setMarkupCondition(m.id, c, serial)}
          >
            {CONDITION_WORD[c]}
          </button>
        ))}
      </div>
      {/* Stored now; the parcel-workflow plan prices it (owner, A). */}
      <p className="ip-note">Kept with the line; costs don&apos;t read the condition yet.</p>
      <Width
        key={`${m.id} ${m.widthFt}`}
        widthFt={m.widthFt}
        // The screen reads an easement's width only (owner, #127).
        unused={m.kind !== "easement"}
        save={(w) => ctl.saveMarkupWidth(m.id, w, serial)}
      />
      {m.kind === "easement" && (
        <RecordedIn
          key={`${m.id} ${m.recordedIn}`}
          value={m.recordedIn}
          save={(text) => ctl.saveRecordedIn(m.id, text, serial)}
        />
      )}
      {/* Step 14 (plan §3.2): what the easement is for; What limits you, in Uses, lists it. */}
      {m.kind === "easement" && (
        <>
          <div className="pd-caption" aria-hidden="true">
            {EASEMENT_TYPE_CAPTION}
          </div>
          <div className="ip-line-row" role="group" aria-label={EASEMENT_TYPE_CAPTION}>
            {EASEMENT_TYPES.map((t) => (
              <button
                key={t}
                className="chip"
                aria-pressed={m.easementType === t}
                // A second tap clears it: it's optional.
                onClick={() => ctl.setEasementType(m.id, m.easementType === t ? null : t, serial)}
              >
                {EASEMENT_TYPE_WORD[t]}
              </button>
            ))}
          </div>
        </>
      )}
      {/* Polish 2 (P9): a box that grows with the note; Enter still saves it, Shift+Enter starts a new line. */}
      <textarea
        className="ip-line-note"
        rows={2}
        aria-label={`Note for ${m.name}`}
        placeholder="Where it comes from: the deed, a plat, a survey, a visit…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={saveNote}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            saveNote();
          }
        }}
      />
    </>
  );
}

const CLASS_WORD: Record<SepticClass, string> = {
  conventional: "Conventional",
  modified: "Modified",
  alternative: "Alternative",
};

/**
 * A marker's details (WF4, docs/plans/parcel-workflow.md §3.1): its name, what it is (another kind of its shape), a septic
 * permit's class as typed from the permit (stored now, priced with VR4), and a note. A point drags on the map; an area
 * is redrawn. Keyed by the marker, so the boxes start from its own values.
 */
export function MarkDetails({ ctl, m }: { ctl: ExploreController; m: PointMarkup | AreaMarkup }) {
  const serial = ctl.state.serial;
  const [note, setNote] = useState(m.note);
  const saveNote = () => {
    if (note !== m.note) ctl.saveMarkupNote(m.id, note, serial);
  };
  const kinds = m.shape === "point" ? POINT_KINDS : AREA_KINDS;
  return (
    <>
      <LineName name={m.name} save={(name) => ctl.renameMarkup(m.id, name, serial)} />
      <p className="ip-note">
        {m.shape === "point"
          ? "Drag it on the map to move it."
          : `${(area(areaPolygon(m.ring)) / M2_PER_ACRE).toFixed(2)} ac. Redraw it to change its shape.`}
      </p>
      <div className="pd-caption" aria-hidden="true">
        What it is
      </div>
      <div className="ip-line-row" role="group" aria-label="What it is">
        {kinds.map((k) => (
          <button
            key={k}
            className="chip"
            aria-pressed={m.kind === k}
            onClick={() => ctl.setMarkupKind(m.id, k, serial)}
          >
            {KIND_NAME[k]}
          </button>
        ))}
      </div>
      {m.kind === "septic" && (
        <>
          <div className="pd-caption" aria-hidden="true">
            The permit&apos;s class
          </div>
          <div className="ip-line-row" role="group" aria-label="The permit's class">
            {SEPTIC_CLASSES.map((c) => (
              <button
                key={c}
                className="chip"
                aria-pressed={m.septicClass === c}
                // A second tap clears it: the class is optional.
                onClick={() => ctl.setMarkupSeptic(m.id, m.septicClass === c ? null : c, serial)}
              >
                {CLASS_WORD[c]}
              </button>
            ))}
          </div>
          {/* Stored now; VR4 prices it (owner, WF4). */}
          <p className="ip-note">Kept with the line; costs don&apos;t read the class yet.</p>
        </>
      )}
      {/* Polish 2 (P9): a box that grows with the note; Enter still saves it, Shift+Enter starts a new line. */}
      <textarea
        className="ip-line-note"
        rows={2}
        aria-label={`Note for ${m.name}`}
        placeholder="What it is, and how you know: a visit, the listing, the seller…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={saveNote}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            saveNote();
          }
        }}
      />
    </>
  );
}

/**
 * Where an easement is recorded (owner, WF5): "Ashe Co. Plat Bk 574 Pg 1132". Kept on Enter or leaving the box; blank
 * clears it, and the card asks again that the easement be verified.
 */
function RecordedIn({ value, save }: { value: string; save(text: string): void }) {
  const [text, setText] = useState(value);
  const keep = () => {
    if (text.trim() !== value) save(text);
  };
  return (
    <label className="ip-line-row ip-note">
      Recorded in
      <input
        className="ip-line-note"
        aria-label="Recorded in"
        placeholder="e.g. Ashe Co. Plat Bk 574 Pg 1132"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={keep}
        onKeyDown={(e) => {
          if (e.key === "Enter") keep();
        }}
      />
    </label>
  );
}

/** The details' heading: the line's name, typed over (owner, #127); kept on Enter or leaving the box, unless blank. */
/**
 * A line's or mark's name, saved as it's typed (polish #22: the row's title follows), a moment after the last key; an
 * empty name isn't kept, and leaving the box puts the saved one back. A rename from elsewhere shows unless you're typing.
 */
function LineName({ name, save }: { name: string; save(name: string): void }) {
  const [text, setText] = useState(name);
  const box = useRef<HTMLInputElement>(null);
  const timer = useRef<number | null>(null);
  const typed = useRef(name);
  const latest = useRef({ name, save });
  useEffect(() => {
    latest.current = { name, save };
    if (document.activeElement !== box.current) setText(name);
  }, [name, save]);
  const keep = (t: string) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    if (t.trim() && t.trim() !== latest.current.name) latest.current.save(t);
  };
  // Leaving the panel saves what's pending.
  useEffect(
    () => () => {
      if (timer.current !== null) keep(typed.current);
    },
    [],
  );
  return (
    <input
      ref={box}
      className="ip-line-name"
      aria-label="Name"
      value={text}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        typed.current = t;
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => keep(t), NAME_DEBOUNCE_MS);
      }}
      onBlur={() => {
        keep(text);
        if (!text.trim()) setText(latest.current.name);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") keep(text);
      }}
    />
  );
}

/** A name saves this long after the last keystroke (and at once on Enter or leaving the box). */
const NAME_DEBOUNCE_MS = 500;

/** A line's width, typed: kept on Enter or leaving the box when it's a positive number, else put back. */
function Width({
  widthFt,
  unused,
  save,
}: {
  widthFt: number | null;
  unused: boolean;
  save(w: number): void;
}) {
  const [width, setWidth] = useState(widthFt != null ? String(widthFt) : "");
  const keep = () => {
    const w = Number(width);
    if (Number.isFinite(w) && w > 0 && w !== widthFt) save(w);
    else setWidth(widthFt != null ? String(widthFt) : "");
  };
  return (
    <label className="ip-line-row ip-note">
      {/* Polish: an easement's width is its right of way's, the one the screen reads. */}
      {unused ? "Width" : "Right-of-way width"}
      <input
        inputMode="decimal"
        aria-label="Width in feet"
        className="ip-line-width"
        value={width}
        onChange={(e) => setWidth(e.target.value)}
        onBlur={keep}
        onKeyDown={(e) => {
          if (e.key === "Enter") keep();
        }}
      />
      ft{unused && <span> · not used in costs yet</span>}
    </label>
  );
}
