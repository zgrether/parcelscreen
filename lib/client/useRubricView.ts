"use client";
/**
 * The rubric on show (step 1, PR 5): the profile's rubrics and the one the switch has chosen, remembered per profile
 * (`ps.rubricView`). The card, the parcel detail, Compare and the rulebook share it.
 */
import { useCallback, useMemo, useState } from "react";
import type { NamedRubric } from "@/lib/rubric/types";
import { profileRubrics, setViewedRubric, viewedRubric } from "./rubrics";

export function useRubricView(): {
  rubrics: NamedRubric[];
  rubric: NamedRubric;
  setRubric(id: string): void;
} {
  const rubrics = useMemo(() => profileRubrics(), []);
  const [rubric, setState] = useState<NamedRubric>(() => viewedRubric(rubrics));
  const setRubric = useCallback(
    (id: string) => {
      const next = rubrics.find((r) => r.id === id);
      if (!next) return;
      setViewedRubric(id);
      setState(next);
    },
    [rubrics],
  );
  return { rubrics, rubric, setRubric };
}
