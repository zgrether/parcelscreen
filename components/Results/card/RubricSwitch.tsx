/**
 * The rubric switch (VR5; owner #110: on the sheet; step 1): one chip per rubric the profile holds, "My grade" first.
 * Nothing to switch between (a profile with its own rubric alone) draws nothing.
 */
import { switchLabel } from "@/lib/client/rubrics";
import type { NamedRubric } from "@/lib/rubric/types";

export function RubricSwitch({
  rubrics,
  current,
  setRubric,
  label,
}: {
  rubrics: readonly NamedRubric[];
  /** The id of the rubric on show. */
  current: string;
  setRubric(id: string): void;
  label: string;
}) {
  if (rubrics.length < 2) return null;
  return (
    <div className="card-person" role="group" aria-label={label}>
      {rubrics.map((nr) => (
        <button
          key={nr.id}
          className="chip"
          aria-pressed={current === nr.id}
          onClick={() => setRubric(nr.id)}
        >
          {switchLabel(nr)}
        </button>
      ))}
    </div>
  );
}
