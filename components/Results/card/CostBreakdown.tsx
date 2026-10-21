/**
 * The cost to enjoy's breakdown (step 10 plan §4): Ready to camp, then Ready to build, each item with its total, its
 * quantity × rate range and the rate's source, any note of ours, and what would lower it. It ends with how it relates
 * to the Driveway section's estimate and "Published ranges, not a quote."
 */
import { COST_WORDS, type CostToEnjoy } from "@/lib/report/cost";
import { breakdownRows, estimateRange, estimateTitle, type CostWhich } from "@/lib/report/costLines";

export function CostBreakdown({
  cost,
  print = false,
}: {
  cost: CostToEnjoy | null | undefined;
  print?: boolean;
}) {
  if (!cost) return <p className="tiny muted">Not priced yet: the driveway hasn&apos;t been routed.</p>;
  if (cost.kind === "noWay") return <p>{COST_WORDS.noWay}.</p>;
  const which: CostWhich[] = ["camp", "build"];
  return (
    <div className="cost-breakdown">
      {which.map((w) => (
        <section key={w} className="cost-estimate" aria-label={estimateTitle(w)}>
          <h4>
            {estimateTitle(w)}: <span className="cost-total">{estimateRange(cost[w])}</span>
          </h4>
          <ul className="cost-items">
            {breakdownRows(cost, w).map((row) => (
              <li key={row.label}>
                <div className="cost-item-head">
                  <span>{row.label}</span>
                  <span className="cost-item-total">{row.total}</span>
                </div>
                {row.parts.map((p) => (
                  <div key={p.text} className="tiny muted cost-item-part">
                    {p.text} ·{" "}
                    {print ? (
                      p.source
                    ) : (
                      <a href={p.url} target="_blank" rel="noopener noreferrer">
                        {p.source}
                      </a>
                    )}
                  </div>
                ))}
                {row.notes.map((n) => (
                  <div key={n} className="tiny muted cost-item-note">
                    {n}
                  </div>
                ))}
                {row.lower && <div className="tiny cost-item-lower">To lower it: {row.lower}</div>}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="tiny muted">{COST_WORDS.driveNote}</p>
      <p className="tiny cost-quote">{COST_WORDS.notAQuote}</p>
    </div>
  );
}
