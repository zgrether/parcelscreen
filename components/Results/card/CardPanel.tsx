"use client";
/**
 * A card line's slide-in panel (value-ranking.md §6.2; VR5): a side panel on desktop, a sheet from the bottom on
 * phones, over the results column. It opens with the plain question (a), this parcel's reading, and the
 * "How it's scored" line (d); below, under "From the report", the report sections that moved here (§6.1), word for
 * word, each with its own heading and "?" help link.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { useHelp } from "@/components/Help/HelpDialog";
import type { Card, GateStatus } from "@/lib/report/card";
import { panelText, type PanelKey } from "@/lib/report/cardPanels";
import type { PartialScreenResult, ScreenResult, Step } from "@/lib/screen/types";
import type { EvaluationPoint } from "../blocks/types";
import { panelSections } from "./panelBlocks";

const STATUS: Record<GateStatus, string> = {
  pass: "Pass",
  warn: "Warning",
  fail: "Fail",
  unknown: "Unknown",
};

/** This parcel's reading on the panel's line of the card. */
function reading(key: PanelKey, card: Card): { mark: string; tone: string; text: string } {
  if (key === "verdict")
    return { mark: card.grade ?? "–", tone: `v-${card.verdict.toLowerCase()}`, text: card.reason };
  if (key === "cost") return { mark: "–", tone: "g-none", text: "Pending." };
  const gate = card.gates.find((g) => g.key === key);
  if (gate) return { mark: STATUS[gate.status], tone: `gate ${gate.status}`, text: `${gate.reason}.` };
  const row = card.rows.find((r) => r.key === key)!;
  return { mark: row.grade ?? "–", tone: `g-${row.grade ?? "none"}`, text: `${row.detail}.` };
}

export function CardPanel({
  panel,
  card,
  result,
  point,
  running,
  noteFor,
  onClose,
}: {
  panel: PanelKey;
  card: Card;
  result: ScreenResult | PartialScreenResult;
  point: EvaluationPoint | null;
  running?: { step: Step; message?: string };
  /** A note to show above a section (the re-evaluation's), by its slug. */
  noteFor?(slug: string): ReactNode;
  onClose(): void;
}) {
  const help = useHelp();
  const close = useRef<HTMLButtonElement>(null);
  const t = panelText(panel);
  const r = reading(panel, card);

  // Esc closes; focus goes to the close button, and back to what opened the panel afterwards.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      before?.focus?.();
    };
  }, [panel, onClose]);

  return (
    <div className="card-panel" role="dialog" aria-labelledby="card-panel-title" data-panel={panel}>
      <header className="card-panel-head">
        <h2 id="card-panel-title">{t.title}</h2>
        <button ref={close} className="icon-btn" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </header>
      <div className="card-panel-body">
        <p className="panel-question">{t.question}</p>
        <p className="panel-reading">
          <span className={`card-grade small ${r.tone}`}>{r.mark}</span> {r.text}
        </p>
        <p className="tiny muted panel-scored">How it&apos;s scored: {t.howScored}</p>
        <h3 className="panel-from">From the report</h3>
        {panelSections(panel).map(({ Block, heading }) => {
          const body = Block({ result, point, variant: "panel", running });
          if (body === null) return null;
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
              {body}
            </section>
          );
        })}
      </div>
    </div>
  );
}
