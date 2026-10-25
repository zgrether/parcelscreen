"use client";
/**
 * Asking for a take, and giving one (step 6, docs/plans/step-6-household.md §4). In-app only: no email or push.
 *   - TheirTake, in each other member's section: their take when they've given one, or, once asked, "Asked … — it's
 *     in Julie's Waiting for you". Ask itself is the header's (UX part 2, PR 3): AskForm, with an optional note.
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
  const take = takeOf(h, parcel, m.id);
  const ask = askOf(h, parcel, m.id);
  const waiting = ask && waits(h, ask);
  if (!take && !waiting) return null;
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
      {waiting && (
        <p className="tiny muted">
          Asked {day(ask.at)}
          {ask.note ? `: “${ask.note}”` : ""} — it&apos;s in {m.name}&apos;s Waiting for you.
        </p>
      )}
    </div>
  );
}

/**
 * Ask for a take (the header's Ask, UX part 2 PR 3): whom, when there's more than one other member, and an optional
 * note. Someone already asked isn't asked twice: the form says when, as their section does.
 */
export function AskForm({
  parcel,
  members,
  done,
}: {
  parcel: string;
  members: readonly Member[];
  done(): void;
}) {
  const h = useHousehold();
  const [to, setTo] = useState(members[0]!.id);
  const [note, setNote] = useState("");
  const who = members.find((m) => m.id === to) ?? members[0]!;
  const ask = askOf(h, parcel, who.id);
  const waiting = ask && waits(h, ask);
  return (
    <form
      className="take-form sh-ask"
      aria-label="Ask for a take"
      onSubmit={(e) => {
        e.preventDefault();
        if (waiting) return;
        askFor(parcel, who.id, note);
        done();
      }}
      onKeyDown={(e) => {
        // Esc cancels the ask, not the parcel (the UX audit's B-4).
        if (e.key !== "Escape") return;
        e.preventDefault();
        done();
      }}
    >
      {members.length > 1 && (
        <div className="ip-chips" role="group" aria-label="Ask whom">
          {members.map((m) => (
            <button
              key={m.id}
              type="button"
              className="chip"
              aria-pressed={m.id === to}
              onClick={() => setTo(m.id)}
            >
              {m.name}
            </button>
          ))}
        </div>
      )}
      {waiting && (
        <p className="tiny muted">
          Asked {day(ask.at)}
          {ask.note ? `: “${ask.note}”` : ""} — it&apos;s in {who.name}&apos;s Waiting for you.
        </p>
      )}
      <label className="take-field">
        <span className="tiny muted">A note for {who.name} (optional)</span>
        <textarea
          rows={2}
          value={note}
          maxLength={500}
          placeholder="What to look at"
          autoFocus
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <div className="take-buttons">
        <button className="btn" type="submit" disabled={!!waiting}>
          Ask
        </button>
        <button className="btn secondary" type="button" onClick={done}>
          Cancel
        </button>
      </div>
    </form>
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
