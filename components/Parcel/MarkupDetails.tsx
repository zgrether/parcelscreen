"use client";
/**
 * A line's and a mark's details (owner, #127; WF4, WF5): what Lines & marks shows for an open row (step 8b; it was the
 * Info panel's details area). Each box saves on Enter or leaving it, for the parcel open as `serial`. Keyed by the
 * markup, so the boxes start from its own values.
 */
import { useState, type ReactNode } from "react";
import { area, length, lineString } from "@turf/turf";
import {
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
      <LineName key={m.name} name={m.name} save={(name) => ctl.renameMarkup(m.id, name, serial)} />
      <p className="ip-note">
        {measured ? lineSummary(measured) : `${Math.round(ft).toLocaleString()} ft`}
        {!measured && result && " (run again to grade it)"}
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
      <p className="ip-note">The condition doesn&apos;t change the cost yet.</p>
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
      <input
        className="ip-line-note"
        aria-label={`Note for ${m.name}`}
        placeholder="Where it comes from: the deed, a plat, a survey, a visit…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={saveNote}
        onKeyDown={(e) => {
          if (e.key === "Enter") saveNote();
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
      <LineName key={m.name} name={m.name} save={(name) => ctl.renameMarkup(m.id, name, serial)} />
      <p className="ip-note">
        {m.shape === "point"
          ? "Drag it on the map to move it."
          : `${(area(areaPolygon(m.ring)) / M2_PER_ACRE).toFixed(2)} ac. Redraw it to change its shape.`}
      </p>
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
          <p className="ip-note">The class doesn&apos;t change the cost yet.</p>
        </>
      )}
      <input
        className="ip-line-note"
        aria-label={`Note for ${m.name}`}
        placeholder="What it is, and how you know: a visit, the listing, the seller…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={saveNote}
        onKeyDown={(e) => {
          if (e.key === "Enter") saveNote();
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
function LineName({ name, save }: { name: string; save(name: string): void }) {
  const [text, setText] = useState(name);
  const keep = () => {
    if (text.trim() && text.trim() !== name) save(text);
    else setText(name);
  };
  return (
    <input
      className="ip-line-name"
      aria-label="Name"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={keep}
      onKeyDown={(e) => {
        if (e.key === "Enter") keep();
      }}
    />
  );
}

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
      Width
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
