"use client";
/**
 * The rubric editor's preview (step 3, docs/plans/step-3-rubric-editor.md §4): one parcel's grade and verdict under the
 * rubric as it was when the editor opened and as it is now, and the two factors that moved most. While a card is held
 * over a column, "now" is what that drop would make it, so the preview follows the drag. The parcel: the open one when
 * it's screened, else the latest screened saved parcel, else the sample (Mud Creek, loaded only then); a picker
 * switches between them. Pure arithmetic over stored screens: nothing is fetched and nothing re-screens.
 */
import { useEffect, useMemo, useState } from "react";
import { getPref } from "@/lib/client/prefs";
import { previewOptions, SAMPLE_KEY, SAMPLE_NAME } from "@/lib/client/previewParcels";
import { useKeptScreens } from "@/lib/client/useKeptScreens";
import { fmt } from "@/lib/format";
import { drawnOf } from "@/lib/report/marks";
import type { Drawn } from "@/lib/report/marks";
import { rubricPreview, type Moved } from "@/lib/report/rubricPreview";
import { moveCard, type EditorCard } from "@/lib/rubric/edit";
import type { Rubric } from "@/lib/rubric/types";
import type { Tier } from "@/lib/rubric/words";
import type { ScreenResult } from "@/lib/screen/types";

export interface PreviewParcel {
  name: string;
  result: ScreenResult;
  drawn?: Drawn;
}

export type Hover = { card: EditorCard; tier: Tier; index: number } | null;

export function RubricPreview({
  rubric,
  baseline,
  hover,
  onParcel,
}: {
  rubric: Rubric;
  /** The rubric as the editor opened with it: "before". */
  baseline: Rubric;
  hover: Hover;
  /** The parcel on show, for the weights notice's points. */
  onParcel?: (p: PreviewParcel | null) => void;
}) {
  const store = useMemo(() => getPref("ps.parcels"), []);
  const built = useMemo(() => store?.built ?? [], [store]);
  const screens = useKeptScreens(built);
  const options = previewOptions(built, screens, store?.open?.key);
  const [picked, setPicked] = useState<string | null>(null);
  const key = picked && options.some((o) => o.key === picked) ? picked : options[0]!.key;
  const [sample, setSample] = useState<ScreenResult | null>(null);
  useEffect(() => {
    if (key !== SAMPLE_KEY || sample) return;
    let alive = true;
    void import("@/lib/rubric/sample/mud-creek.json").then((m) => {
      if (alive) setSample(m.default as unknown as ScreenResult);
    });
    return () => {
      alive = false;
    };
  }, [key, sample]);

  const parcel = built.find((b) => b.key === key);
  const result = key === SAMPLE_KEY ? sample : (screens.get(key)?.result ?? null);
  const drawn = parcel ? drawnOf(parcel.markup, parcel.drivewayLine) : undefined;
  const name = options.find((o) => o.key === key)?.name ?? SAMPLE_NAME;
  useEffect(() => {
    onParcel?.(result ? { name, result, ...(drawn ? { drawn } : {}) } : null);
    // `drawn` follows the parcel: the key and the result say when it changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, name]);

  const held = hover ? moveCard(rubric, hover.card, hover.tier, hover.index) : null;
  const now = held?.ok ? held.rubric : rubric;
  const p = result ? rubricPreview(result, baseline, now, drawn) : null;

  return (
    <aside className="rubric-preview" aria-label="Preview">
      <h2>Preview</h2>
      <label className="rubric-preview-pick">
        <span className="tiny muted">On</span>{" "}
        <select value={key} onChange={(e) => setPicked(e.target.value)}>
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      {!p ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <p className="rubric-preview-grade" aria-live="polite">
            <Grade grade={p.before.grade} verdict={p.before.verdict} />
            {(p.now.grade !== p.before.grade || p.now.verdict !== p.before.verdict) && (
              <>
                {" "}
                → <Grade grade={p.now.grade} verdict={p.now.verdict} />
              </>
            )}
          </p>
          <p className="tiny muted">
            {fmt(p.before.points ?? NaN, 2)} → {fmt(p.now.points ?? NaN, 2)} points
            {hover && held?.ok ? " (if you drop it here)" : ""}
          </p>
          {p.moved.length ? (
            <ul className="rubric-moved">
              {p.moved.map((m) => (
                <li key={m.key}>
                  <MovedLine m={m} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="tiny muted">Move a card, or a slider, to see what changes.</p>
          )}
          <p className="tiny muted">Before is your rubric as you opened this page.</p>
        </>
      )}
    </aside>
  );
}

function Grade({ grade, verdict }: { grade: string | null; verdict: string }) {
  return (
    <span className="rubric-preview-card">
      <span className={`card-grade small g-${grade ?? "none"}`}>{grade ?? "–"}</span>{" "}
      <span className={`v-${verdict.toLowerCase()}`}>{verdict}</span>
    </span>
  );
}

function MovedLine({ m }: { m: Moved }) {
  return (
    <>
      <strong>{m.label}</strong>{" "}
      {m.delta !== 0 && (
        <span className="num">
          {m.delta > 0 ? "+" : "−"}
          {fmt(Math.abs(m.delta), 2)}
        </span>
      )}{" "}
      <span className="muted">({m.why})</span>
    </>
  );
}
