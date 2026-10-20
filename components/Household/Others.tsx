"use client";
/**
 * How each other member would rate the parcel (step 6, docs/plans/step-6-household.md §3.2), under the report card on
 * the map's panel and in the parcel's detail on Your list. From their own rubric over the stored measurements: no
 * re-screen, no network.
 *   - With priorities: their grade and verdict, their verdict's reason line, and up to three rows that differ most from
 *     mine, each with their why line.
 *   - Without: "Julie hasn't set priorities yet.", how to start them on Julie's phone, and "Answer as Julie here",
 *     which switches this device to Julie and opens the questions.
 * Nothing shows in a household of one.
 */
import { useSyncExternalStore } from "react";
import { otherMembers, type Member } from "@/lib/client/household";
import { RUBRICS_CHANGED } from "@/lib/client/profileEvents";
import { switchProfile } from "@/lib/client/profiles";
import { profileRubrics } from "@/lib/client/rubrics";
import { reportCard } from "@/lib/report/card";
import type { Drawn } from "@/lib/report/marks";
import type { PartialScreenResult as Result } from "@/lib/screen/types";
import { differences } from "@/lib/report/household";
import { TheirTake, YourTake } from "./Takes";

const subscribe = (changed: () => void) => {
  window.addEventListener(RUBRICS_CHANGED, changed);
  return () => window.removeEventListener(RUBRICS_CHANGED, changed);
};
/** A stable snapshot: the members list is replaced whole when it changes. */
let last: { list: Member[]; key: string } = { list: [], key: "" };
function snapshot(): Member[] {
  const list = otherMembers();
  const key = list.map((m) => `${m.id}:${m.name}:${m.rubric ? JSON.stringify(m.rubric) : ""}`).join("|");
  if (key !== last.key) last = { list, key };
  return last.list;
}
const none: Member[] = [];

export function Others({ result, drawn, parcel }: { result: Result; drawn?: Drawn; parcel: string | null }) {
  const members = useSyncExternalStore(subscribe, snapshot, () => none);
  if (!members.length) return null;
  return (
    <>
      {members.map((m) => (
        <section key={m.id} className="block others" aria-label={`How ${m.name} would rate it`}>
          <h3>How {m.name} would rate it</h3>
          {m.rubric ? <Rated m={m} result={result} drawn={drawn} /> : <NoPriorities m={m} />}
          {/* Step 6 PR 3: their take, and Ask. A parcel not on the list yet can't be asked about. */}
          {parcel && <TheirTake parcel={parcel} m={m} />}
        </section>
      ))}
      {parcel && <YourTake parcel={parcel} />}
    </>
  );
}

function Rated({ m, result, drawn }: { m: Member; result: Result; drawn?: Drawn }) {
  const theirs = reportCard(result, { id: m.id, name: m.name, rubric: m.rubric! }, drawn);
  const mine = reportCard(result, profileRubrics()[0]!, drawn);
  const diffs = differences(mine, theirs, m.why);
  return (
    <>
      <p className="others-grade">
        <span className={`card-grade small g-${theirs.grade ?? "none"}`}>{theirs.grade ?? "–"}</span>{" "}
        <span className={`card-word small v-${theirs.verdict.toLowerCase()}`}>{theirs.verdict}</span>
      </p>
      <p className="tiny others-reason">{theirs.reason}</p>
      {diffs.length > 0 ? (
        <ul className="others-diffs">
          {diffs.map((d) => (
            <li key={d.key}>
              <b>{d.label}:</b> you {d.mine}, {m.name} {d.theirs}
              <span className="tiny muted others-why">
                Why, for {m.name}: {d.why}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="tiny muted">Every row counts the same for {m.name} as for you.</p>
      )}
    </>
  );
}

function NoPriorities({ m }: { m: Member }) {
  return (
    <>
      <p className="others-none">{m.name} hasn&apos;t set priorities yet.</p>
      <p className="tiny muted">On {m.name}&apos;s phone: More → Answer a few questions.</p>
      <button className="btn secondary small" onClick={() => void switchProfile(m.id, "/interview")}>
        Answer as {m.name} here
      </button>
    </>
  );
}
