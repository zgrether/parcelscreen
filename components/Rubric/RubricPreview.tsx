"use client";
/**
 * "Try it" (step 3, docs/plans/step-3-rubric-editor.md §4; a slim strip since the owner's UX round, 10/18): one parcel's
 * grade and verdict under the list, "Try it on [parcel ▾]: B · Contender", and after a change "B → A · Contender" with
 * up to two plain reasons ("Night sky now counts more"). No points or decimals. "Before" is the list as the page
 * opened with it. While a card is held over a column, "now" is what that drop would make it, so the strip follows the
 * drag. The parcel: the open one when it's screened, else the latest screened saved parcel, else the sample (Mud Creek,
 * loaded only then). Pure arithmetic over stored screens: nothing is fetched and nothing re-screens. On a phone the
 * strip is a bar along the bottom, with the same words.
 */
import { useEffect, useMemo, useState } from "react";
import { getPref } from "@/lib/client/prefs";
import { previewOptions, SAMPLE_KEY, SAMPLE_NAME } from "@/lib/client/previewParcels";
import { useKeptScreens } from "@/lib/client/useKeptScreens";
import { drawnOf } from "@/lib/report/marks";
import type { Drawn } from "@/lib/report/marks";
import { rubricPreview } from "@/lib/report/rubricPreview";
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
  /** The list as the page opened with it: "before". */
  baseline: Rubric;
  hover: Hover;
  /** The parcel on show, for the weights notice's line. */
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
    <section className="rubric-strip" aria-label="Try it">
      <p className="rubric-strip-line" aria-live="polite">
        <label>
          Try it on{" "}
          <select value={key} onChange={(e) => setPicked(e.target.value)}>
            {options.map((o) => (
              <option key={o.key} value={o.key}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <span className="rubric-strip-colon">:</span>{" "}
        {p ? (
          <span className="rubric-strip-grade">
            {hover && held?.ok && <span className="muted">If you drop it here: </span>}
            {hover && held?.ok && p.now.grade === p.before.grade && p.now.verdict === p.before.verdict ? (
              <span className="muted">no change</span>
            ) : (
              <GradeChange
                before={{ grade: p.before.grade, verdict: p.before.verdict }}
                now={{ grade: p.now.grade, verdict: p.now.verdict }}
              />
            )}
          </span>
        ) : (
          <span className="muted">…</span>
        )}
      </p>
      {p && p.moved.length > 0 && (
        <ul className="rubric-reasons">
          {p.moved.map((m) => (
            <li key={m.key}>{m.why}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface GradeVerdict {
  grade: string | null;
  verdict: string;
}

/** "B · Contender"; "B → A · Contender" when only the letter moved; "C · Maybe → B · Contender" when both did. */
function GradeChange({ before, now }: { before: GradeVerdict; now: GradeVerdict }) {
  const letterMoved = before.grade !== now.grade,
    verdictMoved = before.verdict !== now.verdict;
  if (!letterMoved && !verdictMoved) return <Grade {...now} />;
  if (!verdictMoved)
    return (
      <>
        <Letter grade={before.grade} /> → <Grade {...now} />
      </>
    );
  return (
    <>
      <Grade {...before} /> → <Grade {...now} />
    </>
  );
}

function Letter({ grade }: { grade: string | null }) {
  return <span className={`card-grade small g-${grade ?? "none"}`}>{grade ?? "–"}</span>;
}

function Grade({ grade, verdict }: GradeVerdict) {
  return (
    <span className="rubric-strip-card">
      <Letter grade={grade} /> · <span className={`v-${verdict.toLowerCase()}`}>{verdict}</span>
    </span>
  );
}
