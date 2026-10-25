"use client";
/**
 * The price block (UX part 2 PR 8b; the audit's Z-4), in Grade's Cost section after its two lines: the asking price and
 * $/ac, Ready to camp and Ready to build without the land, the cost's optional items as switches that re-price them
 * live, and the walk-away price for the land within the Ready to build budget. The switches change these figures only:
 * Within budget grades the costs as priced (plan §9, Q2), and nothing is saved.
 */
import { useMemo, useState } from "react";
import type { CostInput } from "@/lib/report/cost";
import type { PerAcre } from "@/lib/report/perAcre";
import { PRICE_WORDS, priceBlock, type PriceToggleKey } from "@/lib/report/price";
import type { Budgets } from "@/lib/rubric/types";

export interface PriceContext {
  input: CostInput;
  perAcre: PerAcre | null;
}

export function PriceBlock({ input, perAcre, budgets }: PriceContext & { budgets: Budgets | undefined }) {
  const [chosen, setChosen] = useState<Partial<Record<PriceToggleKey, boolean>>>({});
  const b = useMemo(() => priceBlock(input, budgets, perAcre, chosen), [input, budgets, perAcre, chosen]);
  if (!b) return null;
  return (
    <section className="price-block" aria-label={PRICE_WORDS.title}>
      <h4 className="card-sub">{PRICE_WORDS.title}</h4>
      <div className="price-box">
        {b.asking ? (
          <div className="price-row">
            <span>{PRICE_WORDS.asking}</span>
            <strong>
              {b.asking}
              {b.perAcre && ` · ${b.perAcre.text}`}
            </strong>
            {b.perAcre?.both && <span className="tiny muted price-sub">{b.perAcre.both}</span>}
          </div>
        ) : (
          <p className="tiny muted">{PRICE_WORDS.noAsking}</p>
        )}
        <div className="price-row">
          <span>Ready to camp</span>
          <strong data-price="camp">{b.camp}</strong>
        </div>
        <div className="price-row">
          <span>Ready to build</span>
          <strong data-price="build">{b.build}</strong>
          <span className="tiny muted price-sub">everything but the house</span>
        </div>
        {b.toggles.length > 0 && (
          <ul className="price-toggles">
            {b.toggles.map((t) => {
              const on = chosen[t.key] ?? t.byDefault;
              return (
                <li key={t.key}>
                  <label className="price-toggle">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={on}
                      onChange={(e) => setChosen((c) => ({ ...c, [t.key]: e.target.checked }))}
                    />
                    <span className="price-toggle-words">
                      <span>{t.label}</span>
                      <span className="tiny muted">{t.detail}</span>
                    </span>
                    <span className="price-change">{t.change}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {b.walkAway && (
          <div className="price-walkaway" role="status" aria-live="polite">
            <span className="tiny muted">{PRICE_WORDS.walkAway}</span>
            <strong>{b.walkAway.line}</strong>
            <span>
              {b.walkAway.within}
              {b.walkAway.asking && ` ${b.walkAway.asking}`}
            </span>
          </div>
        )}
      </div>
      {b.toggles.length > 0 && <p className="tiny muted">{PRICE_WORDS.togglesNote}</p>}
    </section>
  );
}
