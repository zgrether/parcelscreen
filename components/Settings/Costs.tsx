/**
 * Settings → Costs (step 10 plan §1, §4): every published rate, low and high, with its unit and sources, by group. The
 * dialog owns the form and saves it with the rest; this only draws it.
 */
import { COST_GROUPS, COST_RATES, COSTS_CHECKED, type CostKey, type CostRate } from "@/lib/config/costs";
import type { CostForm } from "@/lib/client/costsForm";

export function Costs({
  form,
  bad,
  set,
}: {
  form: CostForm;
  /** The ids of the fields that failed the last Save. */
  bad: ReadonlySet<string>;
  set(key: CostKey, end: "low" | "high", value: string): void;
}) {
  const row = (r: CostRate) => (
    <div key={r.key} className="rate-row" role="group" aria-label={r.label}>
      <div className="rate-label">
        {r.label} <span className="muted">({r.unit})</span>
      </div>
      <div className="rate-range">
        {(["low", "high"] as const).map((end) => (
          <label key={end} className="settings-field">
            {end === "low" ? "Low" : "High"}
            <input
              type="text"
              inputMode="decimal"
              aria-label={`${r.label}: ${end}`}
              value={form[r.key][end]}
              aria-invalid={bad.has(`cost.${r.key}.${end}`) || undefined}
              onChange={(e) => set(r.key, end, e.target.value)}
            />
          </label>
        ))}
      </div>
      <div className="tiny muted rate-source">
        Source:{" "}
        {r.sources.map((s, i) => (
          <span key={s.url}>
            {i > 0 && "; "}
            <a href={s.url} target="_blank" rel="noopener noreferrer">
              {s.name}
            </a>{" "}
            · {s.date} · {s.where}
          </span>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <h3>Costs</h3>
      <p className="tiny muted">
        Published ranges, low to high, for Ready to camp and Ready to build. Edit them to your
        contractor&apos;s numbers. They apply to every parcel. Sources checked{" "}
        {new Date(`${COSTS_CHECKED}T12:00:00`).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
        .
      </p>
      {COST_GROUPS.map((g) => (
        <section key={g.id} className="rate-group" aria-label={g.label}>
          <h4>{g.label}</h4>
          {COST_RATES.filter((r) => r.group === g.id).map(row)}
        </section>
      ))}
    </>
  );
}
