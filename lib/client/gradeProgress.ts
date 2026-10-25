/**
 * The grade's progress while it runs (UX part 2 PR 3b; Zach's Z-9): "Finding hospitals, groceries and trailheads… 8 of
 * 11", and how far along the bar is. On a phone it's a slim bar under the header, with the step list one tap away; the
 * sheet doesn't rise to show the steps. Pure, from the run's step states.
 */
import { STEPS } from "@/lib/screen/config";
import type { Step } from "@/lib/screen/types";

/** Each step as it's happening (interface words; the step list keeps the config's own labels). */
export const PROGRESS_WORD: Record<Step, string> = {
  dem: "Pulling elevation",
  terrain: "Finding benches and slopes",
  soils: "Querying soils",
  sun: "Tracing the December horizon",
  sky: "Measuring the night sky",
  flood: "Checking the FEMA floodplain",
  padus: "Checking public land nearby",
  near: "Finding hospitals, groceries and trailheads",
  rank: "Ranking the homesites",
  driveway: "Routing the driveway",
  drive: "Routing drive times",
};

export interface Progress {
  /** "Querying soils… 3 of 11". */
  text: string;
  /** Its two parts, "Querying soils…" and "3 of 11": the step's words give way on a narrow phone, the count doesn't. */
  step: string;
  count: string;
  /** Steps ended (done, failed or skipped), for the bar. */
  ended: number;
  total: number;
}

type States = Partial<Record<Step, { status: "run" | "done" | "fail" | "skip" }>>;

/**
 * Where the run is: the first step running, numbered after the steps that have ended. Before any step starts, the first
 * step's words; with every step ended (the moment before the result lands), the last one's.
 */
export function gradeProgress(steps: States): Progress {
  const total = STEPS.length;
  const ended = STEPS.filter(([id]) => {
    const s = steps[id]?.status;
    return s === "done" || s === "fail" || s === "skip";
  }).length;
  const now = STEPS.find(([id]) => steps[id]?.status === "run") ?? STEPS[Math.min(ended, total - 1)]!;
  const step = `${PROGRESS_WORD[now[0]]}…`;
  const count = `${Math.min(ended + 1, total)} of ${total}`;
  return { text: `${step} ${count}`, step, count, ended, total };
}
