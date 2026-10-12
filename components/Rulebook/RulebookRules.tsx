/**
 * The rulebook's rules (value-ranking.md §8; VR7), drawn from its model (lib/report/rulebook.ts): the parcel grade
 * (the verdict's rules, each person's weights, every dealbreaker and graded row as its panel, with every band and what
 * it means), then the homesite grade (its quality parts and their weights, its build-cost points). Every number here
 * comes from config; a test renders this and checks it. No parcel's numbers: the breakdown bar is apart.
 */
import { ScaleBar } from "@/components/Results/card/CardPanel";
import { fmt } from "@/lib/format";
import type { Person } from "@/lib/report/card";
import { ruleAnchor } from "@/lib/report/cardPanels";
import type { RulePanel, RuleScale, Rulebook } from "@/lib/report/rulebook";

const PEOPLE: { key: Person; name: string }[] = [
  { key: "zach", name: "Zach" },
  { key: "julie", name: "Julie" },
];

function RuleScaleView({ scale }: { scale: RuleScale }) {
  return (
    <div className="scale-group">
      <ScaleBar
        scale={{
          id: scale.id,
          name: scale.name,
          bands: scale.bands.map((b) => b.label),
          at: null,
          value: "",
          ...(scale.marks ? { marks: scale.marks } : {}),
        }}
      />
      {scale.bands.some((b) => b.meanings.length > 0) && (
        <h5 className="rule-meanings-head">What it means for you</h5>
      )}
      {scale.bands.some((b) => b.meanings.length > 0) && (
        <dl className="rule-meanings">
          {scale.bands.map((b) => (
            <div key={b.label}>
              <dt>{b.label}</dt>
              <dd>
                <ul>
                  {b.meanings.map((m, i) => (
                    <li key={i}>
                      {m.for && <b>{m.for}: </b>}
                      {m.text}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function RulePanelView({ panel }: { panel: RulePanel }) {
  return (
    <section className="rule-panel" id={ruleAnchor(panel.key)}>
      <h4>{panel.title}</h4>
      <p className="panel-question">{panel.question}</p>
      {panel.scales.map((s) => (
        <RuleScaleView key={s.name} scale={s} />
      ))}
      <p className="tiny muted panel-scored">How it&apos;s scored: {panel.howScored}</p>
    </section>
  );
}

export function RulebookRules({ rb, person }: { rb: Rulebook; person: Person }) {
  const h = rb.homesite;
  return (
    <div className="rulebook-rules">
      <section>
        <h2>The parcel grade</h2>
        <p>
          What money can&apos;t add, graded A to F, weighted by whose grade it is. What money can fix is a
          dealbreaker check or a cost, never a grade.
        </p>
        <RulePanelView panel={rb.card.verdict} />
        <h3>Weights</h3>
        <table className="rule-weights">
          <thead>
            <tr>
              <th scope="col">Row</th>
              {PEOPLE.map((p) => (
                <th key={p.key} scope="col" aria-current={p.key === person ? "true" : undefined}>
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rb.card.weights.map((w) => (
              <tr key={w.key}>
                <th scope="row">
                  <a href={`#rule-${w.key}`}>{w.label}</a>
                </th>
                {PEOPLE.map((p) => (
                  <td key={p.key} className={p.key === person ? "current" : undefined}>
                    {w.byPerson[p.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td />
              <td />
              <td className="tiny muted">Placeholder until Julie sets her own</td>
            </tr>
          </tfoot>
        </table>
        <h3>Dealbreakers</h3>
        {rb.card.gates.map((g) => (
          <RulePanelView key={g.key} panel={g} />
        ))}
        <h3>The graded rows</h3>
        {rb.card.rows.map((r) => (
          <RulePanelView key={r.key} panel={r} />
        ))}
        {/* The card's last line: every panel has its section here, for its "How it's scored" link (follow-up 52). */}
        <RulePanelView panel={rb.card.cost} />
      </section>

      <section>
        <h2>The homesite grade</h2>
        <p>{h.intro}</p>
        <h3>Quality</h3>
        <ul className="rule-parts">
          {h.quality.map((q) => (
            <li key={q.key}>
              <b>
                {q.label} ({fmt(q.weightPct ?? 0)}%)
              </b>
              : {q.how}
            </li>
          ))}
        </ul>
        <p>{h.flood}</p>
        <p>{h.grades}</p>
        <h3>What it costs to build there</h3>
        <p>{h.costIntro}</p>
        <ul className="rule-parts">
          {h.cost.map((c) => (
            <li key={c.key}>
              <b>{c.label}</b>: {c.how}
            </li>
          ))}
        </ul>
        <p>{h.tiers}</p>
        <p>{h.overall}</p>
      </section>
    </div>
  );
}
