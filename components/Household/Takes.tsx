"use client";
/**
 * Asking for a take, and giving one (step 6, docs/plans/step-6-household.md §4). In-app only: no email or push.
 *   - TheirTake, in each other member's section: their take when they've given one, and **Ask Julie** with an
 *     optional note (or, once asked, "Asked … — waiting for Julie").
 *   - YourTake, under the card: "Zach asked for your take" with his note when an ask waits for you, then Yes / Maybe /
 *     No, an optional comment, and Save my take. A take can be changed, and doesn't need an ask.
 */
import { useState } from "react";
import { memberName, type Member } from "@/lib/client/household";
import { askFor, giveTake, useHousehold } from "@/lib/client/householdDoc";
import { currentProfileId } from "@/lib/client/profiles";
import { ANSWER_WORD, ANSWERS, askOf, takeOf, waits, type Answer } from "@/lib/client/takes";

const day = (iso: string) => new Date(iso).toLocaleDateString([], { month: "numeric", day: "numeric" });

export function TheirTake({ parcel, m }: { parcel: string; m: Member }) {
  const h = useHousehold();
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const take = takeOf(h, parcel, m.id);
  const ask = askOf(h, parcel, m.id);
  const waiting = ask && waits(h, ask);
  return (
    <div className="take-theirs">
      {take && (
        <p className="take-line">
          <span className={`take-chip a-${take.answer}`}>{ANSWER_WORD[take.answer]}</span>{" "}
          <span className="tiny muted">
            {m.name}&apos;s take, {day(take.at)}
          </span>
          {take.comment && <span className="take-comment">“{take.comment}”</span>}
        </p>
      )}
      {waiting ? (
        <p className="tiny muted">
          Asked {day(ask.at)}
          {ask.note ? `: “${ask.note}”` : ""} — it&apos;s in {m.name}&apos;s Waiting for you.
        </p>
      ) : asking ? (
        <form
          className="take-form"
          onSubmit={(e) => {
            e.preventDefault();
            askFor(parcel, m.id, note);
            setAsking(false);
            setNote("");
          }}
        >
          <label className="take-field">
            <span className="tiny muted">A note for {m.name} (optional)</span>
            <textarea
              rows={2}
              value={note}
              maxLength={500}
              placeholder="What to look at"
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <div className="take-buttons">
            <button className="btn" type="submit">
              Ask
            </button>
            <button className="btn secondary" type="button" onClick={() => setAsking(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button className="btn secondary small take-ask" onClick={() => setAsking(true)}>
          Ask {m.name}
        </button>
      )}
    </div>
  );
}

export function YourTake({ parcel }: { parcel: string }) {
  const h = useHousehold();
  const me = currentProfileId();
  const mine = me ? takeOf(h, parcel, me) : null;
  const ask = me ? askOf(h, parcel, me) : null;
  const waiting = ask && waits(h, ask);
  const [editing, setEditing] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(mine?.answer ?? null);
  const [comment, setComment] = useState(mine?.comment ?? "");
  // Polish (step 6's review): saved, it says so, and to whom when it answered an ask.
  const [sent, setSent] = useState<string | null>(null);
  if (!me) return null;
  const open = editing || waiting || !mine;
  return (
    <section className="block your-take" aria-label="Your take">
      <h3>Your take</h3>
      {waiting && (
        <p className="take-asked">
          {memberName(ask.from) ?? "Someone"} asked for your take
          {ask.note ? `: “${ask.note}”` : "."}
        </p>
      )}
      {!open && mine ? (
        <p className="take-line">
          <span className={`take-chip a-${mine.answer}`}>{ANSWER_WORD[mine.answer]}</span>{" "}
          <span className="tiny muted">{day(mine.at)}</span>
          {mine.comment && <span className="take-comment">“{mine.comment}”</span>}{" "}
          {sent !== null && (
            <span className="tiny take-sent" role="status">
              {sent ? `Sent to ${sent}.` : "Saved."}
            </span>
          )}{" "}
          <button className="btn secondary small" onClick={() => setEditing(true)}>
            Change
          </button>
        </p>
      ) : (
        <form
          className="take-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!answer) return;
            giveTake(parcel, answer, comment);
            setSent(waiting ? (memberName(ask.from) ?? "") : "");
            setEditing(false);
          }}
        >
          <div className="take-answers" role="group" aria-label="Your answer">
            {ANSWERS.map((a) => (
              <button
                key={a}
                type="button"
                className={`btn secondary take-answer a-${a}`}
                aria-pressed={answer === a}
                onClick={() => setAnswer(a)}
              >
                {ANSWER_WORD[a]}
              </button>
            ))}
          </div>
          <label className="take-field">
            <span className="tiny muted">A comment (optional)</span>
            <textarea
              rows={2}
              value={comment}
              maxLength={1000}
              onChange={(e) => setComment(e.target.value)}
            />
          </label>
          <div className="take-buttons">
            <button className="btn" type="submit" disabled={!answer}>
              Save my take
            </button>
            {mine && (
              <button className="btn secondary" type="button" onClick={() => setEditing(false)}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
