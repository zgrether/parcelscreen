"use client";
/**
 * A drawn line's panel (owner, A, 2026-10-13): opened by a tap on the line, or Edit in the report's "Your lines". What
 * the line is (an existing track, an easement, an existing drive), the state of its ground, an easement's width, and
 * Edit (redraw its path with the line tool) and Delete, which an Undo toast can take back for a few seconds.
 */
import { length, lineString } from "@turf/turf";
import { useEffect, useState } from "react";
import { useExplore } from "@/components/Explore/useExploreController";
import { TOAST_MS } from "@/components/Explore/SwitchToast";
import { useScreenItContext } from "@/components/Results/ScreenItContext";
import { LINE_CONDITIONS, type LineCondition, type MarkupKind } from "@/lib/client/parcelStore";
import { DRAWN_LABEL, DRAWN_WORD, lineSummary } from "@/lib/report/lines";
import { M2FT } from "@/lib/screen/util";

const KINDS: MarkupKind[] = ["track", "easement", "drive"];
const CONDITION_WORD: Record<LineCondition, string> = {
  uncleared: "Uncleared",
  pioneer: "Pioneer",
  improved: "Improved",
  paved: "Paved",
};

export function LinePanel() {
  const ctl = useExplore();
  const { lineOpen, serial, mode } = ctl.state;
  const m = ctl.state.store.open?.markup.find((x) => x.id === lineOpen);
  const s = useScreenItContext();
  const measured = s?.shown && !s.stale ? s.shown.result.lines.find((l) => l.id === m?.id) : undefined;
  if (!m || mode) return null;
  const ft = length(lineString(m.line.map(([lat, lon]) => [lon, lat])), { units: "meters" }) * M2FT;
  return (
    <div className="line-panel" role="dialog" aria-label={`${DRAWN_LABEL[m.kind]}: its panel`}>
      <div className="line-panel-head">
        <b>{DRAWN_LABEL[m.kind]}</b>
        <button className="icon-btn" aria-label="Close" onClick={() => ctl.openLine(null)}>
          ✕
        </button>
      </div>
      <div className="tiny muted">
        {measured ? lineSummary(measured) : `${Math.round(ft).toLocaleString()} ft`}
      </div>
      <div className="line-panel-row" role="group" aria-label="What it is">
        {KINDS.map((k) => (
          <button
            key={k}
            className="chip"
            aria-pressed={m.kind === k}
            onClick={() => ctl.setMarkupKind(m.id, k, serial)}
          >
            {DRAWN_WORD[k].replace(/^./, (c) => c.toUpperCase())}
          </button>
        ))}
      </div>
      <div className="line-panel-row" role="group" aria-label="Its condition">
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
      <div className="tiny muted">The condition doesn&apos;t change the cost yet.</div>
      {m.kind === "easement" && (
        <Width
          key={`${m.id} ${m.widthFt}`}
          widthFt={m.widthFt}
          save={(w) => ctl.saveMarkupWidth(m.id, w, serial)}
        />
      )}
      <div className="line-panel-row">
        <button className="btn small secondary" onClick={() => ctl.editLine(m.id)}>
          Edit
        </button>
        <button className="btn small secondary" onClick={() => ctl.deleteMarkup(m.id, serial)}>
          Delete
        </button>
      </div>
    </div>
  );
}

/** An easement's width, typed: kept on Enter or leaving the box when it's a positive number, else put back. */
function Width({ widthFt, save }: { widthFt: number | null; save(w: number): void }) {
  const [width, setWidth] = useState(widthFt != null ? String(widthFt) : "");
  const keep = () => {
    const w = Number(width);
    if (Number.isFinite(w) && w > 0 && w !== widthFt) save(w);
    else setWidth(widthFt != null ? String(widthFt) : "");
  };
  return (
    <label className="tiny line-panel-row">
      Width{" "}
      <input
        inputMode="decimal"
        aria-label="Easement width in feet"
        className="ip-line-width"
        value={width}
        onChange={(e) => setWidth(e.target.value)}
        onBlur={keep}
        onKeyDown={(e) => {
          if (e.key === "Enter") keep();
        }}
      />{" "}
      ft
    </label>
  );
}

/** "Line deleted — Undo" (owner, A): for TOAST_MS, as the parcel-switch toast. */
export function LineUndoToast() {
  const ctl = useExplore();
  const u = ctl.lineUndo;
  const { dismissLineUndo } = ctl;
  useEffect(() => {
    if (!u) return;
    const timer = setTimeout(dismissLineUndo, TOAST_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one timer per deletion (its `at`)
  }, [u?.at]);
  if (!u) return null;
  return (
    <div className="switch-toast line-undo" role="status">
      <span>{DRAWN_WORD[u.markup.kind].replace(/^./, (c) => c.toUpperCase())} deleted —</span>
      <button onClick={ctl.undoLineDelete}>Undo</button>
    </div>
  );
}
