"use client";
/**
 * The rubric on show (step 1, PR 5): the profile's rubrics and the one the switch has chosen, remembered per profile
 * (`ps.rubricView`). The card, the parcel detail, Compare and the rulebook share it. An import that replaces the
 * profile's rubrics (PR 6) is heard, so the switch follows without a reload.
 */
import { useCallback, useEffect, useState } from "react";
import type { NamedRubric } from "@/lib/rubric/types";
import { profileRubrics, RUBRICS_CHANGED, setViewedRubric, viewedRubric } from "./rubrics";

export function useRubricView(): {
  rubrics: NamedRubric[];
  rubric: NamedRubric;
  setRubric(id: string): void;
} {
  const [rubrics, setRubrics] = useState<NamedRubric[]>(() => profileRubrics());
  const [rubric, setState] = useState<NamedRubric>(() => viewedRubric(rubrics));
  useEffect(() => {
    const refresh = () => {
      const next = profileRubrics();
      setRubrics(next);
      setState(viewedRubric(next));
    };
    window.addEventListener(RUBRICS_CHANGED, refresh);
    return () => window.removeEventListener(RUBRICS_CHANGED, refresh);
  }, []);
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
