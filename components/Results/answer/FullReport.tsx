/**
 * Full report ▸ (step 7 plan §1.6): every section of the report, in its order (components/Results/report.ts), with
 * today's headings, words and controls, behind one control. The slide-in panels still carry them too.
 */
"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { useHelp } from "@/components/Help/HelpDialog";
import type { LineNames } from "@/lib/report/lines";
import type { PartialScreenResult, ScreenResult, Step } from "@/lib/screen/types";
import type { EvaluationPoint } from "../blocks/types";
import { REPORT } from "../report";
import type { PavingContext } from "@/lib/report/ground";

export function FullReport({
  result,
  point,
  running,
  lineNames,
  drivewayLine,
  paving,
  noteFor,
  open,
  setOpen,
  scrollTo,
}: {
  result: ScreenResult | PartialScreenResult;
  point: EvaluationPoint | null;
  running?: { step: Step; message?: string };
  lineNames?: LineNames;
  drivewayLine: string | null;
  /** Settings' paving choice and the parcel's lines (step 10), for the Driveway section's Paving row. */
  paving?: PavingContext;
  /** A note to show above a section (the re-evaluation's), by its slug. */
  noteFor?(slug: string): ReactNode;
  open: boolean;
  setOpen(open: boolean): void;
  /** A section to bring into view once it's open, by its slug ("still-unknown"); null for none. */
  scrollTo: string | null;
}) {
  const help = useHelp();
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open && scrollTo)
      body.current?.querySelector(`[data-key="${scrollTo}"]`)?.scrollIntoView({ block: "start" });
  }, [open, scrollTo]);
  return (
    <section className="full-report" aria-label="Full report">
      <button className="full-report-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        Full report <span aria-hidden="true">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div ref={body} className="full-report-body">
          {REPORT.map(({ Block, heading }) => {
            const content = Block({
              result,
              point,
              variant: "panel",
              running,
              lineNames,
              drivewayLine,
              ...(paving ? { paving } : {}),
            });
            if (content === null) return null;
            const h = heading(result, point);
            return (
              <section key={h.slug} className="block panel-block" data-key={h.slug}>
                <h3>
                  {h.title}
                  {h.sub && <small>{h.sub}</small>}
                  <button
                    className="help-link"
                    title="What does this mean?"
                    aria-label={`What does ${h.title} mean?`}
                    onClick={() => help(h.help)}
                  >
                    ?
                  </button>
                </h3>
                {noteFor?.(h.slug)}
                {content}
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
