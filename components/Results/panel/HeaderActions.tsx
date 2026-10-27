"use client";
/**
 * The open parcel's actions (UX part 2 PR 3; the audit's P-2): one row under the header, each 44 px to tap.
 *   - ★ Add to list / On your list.
 *   - Not for us (P-4), or Move back once it's ruled out.
 *   - Ask Julie (Ask someone with more than one other member, or with none yet: it opens Household), on a kept parcel.
 *   - ⋯: Make a report, Copy summary, Save offline, Remove from Your list.
 * Not for us and Ask open in the row's place, as the mock-up has them. The other members' takes follow the row, with a
 * dot on one that was new when the parcel opened (opening it sees it, step 6b).
 */
import { useState } from "react";
import { Star } from "@/components/Favorites/Star";
import { ArchiveReason } from "@/components/Map/ParcelStanding";
import { useOtherMembers } from "@/components/Household/Others";
import { AskForm } from "@/components/Household/Takes";
import { useHouseholdDialog } from "@/components/Household/HouseholdDialog";
import { PanelMenu } from "@/components/Report/PanelMenu";
import { countyOf, isFavorite, starName } from "@/lib/client/favorites";
import { parcelName } from "@/lib/client/historyRows";
import type { SaveTarget } from "@/lib/client/saveOffline";
import { ownLand } from "@/lib/geo/recipe";
import { memberName, type Member } from "@/lib/client/household";
import { useHousehold, useNewTakes } from "@/lib/client/householdDoc";
import { statusLine } from "@/lib/client/parcelStatus";
import { currentProfileId } from "@/lib/client/profiles";
import { ANSWER_WORD, takeOf } from "@/lib/client/takes";
import type { ScreenIt } from "./ScreenIt";

/** The words on the row (interface, not report text). */
export const ACTION_WORDS = {
  ruleOut: "Not for us",
  ruleOutTitle: "Not for us?",
  moveBack: "Move back",
  ask: (name: string) => `Ask ${name}`,
  askSomeone: "Ask someone",
};

export function HeaderActions({ s }: { s: ScreenIt }) {
  const open = s.ctl.state.store.open;
  const serial = s.ctl.state.serial;
  const members = useOtherMembers();
  const household = useHouseholdDialog();
  const [form, setForm] = useState<"rule" | "ask" | null>(null);
  // Another parcel opened: the form it had open goes.
  const key = open?.key ?? null;
  const [formFor, setFormFor] = useState(key);
  if (formFor !== key) {
    setFormFor(key);
    setForm(null);
  }
  if (!open) return null;
  const ruledOut = open.status === "archived";
  // A parcel not kept yet can't be asked about (step 6 PR 3).
  const askable = key !== null && members.length > 0;
  const graded = !!s.shown && !s.runningHere;
  const adder = open.addedBy && open.addedBy !== currentProfileId() ? memberName(open.addedBy) : null;
  // Built when the ⋯ menu opens, not on every render: the boundary is a union of the pieces.
  const saveTarget = (): SaveTarget | null => {
    const land = key ? ownLand(open.pieces) : null;
    if (!key || !land) return null;
    return {
      key,
      name: parcelName(open).name,
      geo: land,
      pieces: open.pieces,
      screenIds: [
        ...open.screenIds.slice(-1),
        ...open.scenarios.flatMap((x) => [x.screens.left, x.screens.right]).filter((id) => id !== null),
      ],
    };
  };

  return (
    <div className="sh-acts-wrap">
      {form === "rule" ? (
        <div className="sh-form">
          <ArchiveReason
            title={ACTION_WORDS.ruleOutTitle}
            archive={(reason) => {
              s.ctl.archive(reason, serial);
              setForm(null);
            }}
            cancel={() => setForm(null)}
          />
        </div>
      ) : form === "ask" && askable ? (
        <div className="sh-form">
          <AskForm parcel={key} members={members} done={() => setForm(null)} />
        </div>
      ) : (
        <div className="sh-acts" role="group" aria-label="This parcel">
          <PanelStar s={s} adder={adder} />
          {ruledOut ? (
            <button className="sh-act" title={statusLine(open)} onClick={() => s.ctl.restore(serial)}>
              {ACTION_WORDS.moveBack}
            </button>
          ) : (
            <button className="sh-act" onClick={() => setForm("rule")}>
              {ACTION_WORDS.ruleOut}
            </button>
          )}
          {askable ? (
            <button className="sh-act" onClick={() => setForm("ask")}>
              {members.length === 1 ? ACTION_WORDS.ask(members[0]!.name) : ACTION_WORDS.askSomeone}
            </button>
          ) : (
            // P-8 (UX part 2 PR 5): with no one else in the household yet, Ask someone opens Household.
            key !== null && (
              <button className="sh-act" onClick={household.open}>
                {ACTION_WORDS.askSomeone}
              </button>
            )
          )}
          <PanelMenu
            parcelKey={key}
            graded={graded}
            copySummary={graded ? s.copySummary : null}
            remove={isFavorite(open) ? { adder, run: () => s.ctl.unstar(serial) } : null}
            saveTarget={saveTarget}
          />
        </div>
      )}
      {key && members.length > 0 && <HeaderTakes parcel={key} members={members} />}
    </div>
  );
}

/**
 * The open parcel's list button (step 8's star, in words since 8c: "Add to list", "★ On your list"): adding names it
 * (prefilled from its own name, its listing's address, or its acres, road and county) and builds a plain parcel;
 * removing asks first.
 */
function PanelStar({ s, adder }: { s: ScreenIt; adder: string | null }) {
  const open = s.ctl.state.store.open!;
  const serial = s.ctl.state.serial;
  const d = s.ctl.derived;
  const prefill = () =>
    starName(open, {
      acres: d?.ok ? d.acres : null,
      road: s.shown?.result.driveFrom?.road ?? null,
      county: countyOf(open),
    });
  return (
    <Star
      className="sh-star sh-act"
      words
      on={isFavorite(open)}
      prefill={prefill}
      star={(name) => s.ctl.star(name, serial)}
      unstar={() => s.ctl.unstar(serial)}
      adder={adder}
    />
  );
}

/** "Julie · Maybe ● “Steep drive, lovely spring.”": each other member's take, under the actions (P-2). */
function HeaderTakes({ parcel, members }: { parcel: string; members: readonly Member[] }) {
  const h = useHousehold();
  const fresh = useNewTakes();
  // What was new as the parcel opened: opening it marks its takes seen at once, and the dot says what's changed since.
  const [atOpen, setAtOpen] = useState<{ parcel: string; keys: ReadonlySet<string> }>(() => ({
    parcel,
    keys: newKeys(fresh, parcel),
  }));
  if (atOpen.parcel !== parcel) setAtOpen({ parcel, keys: newKeys(fresh, parcel) });
  const takes = members.flatMap((m) => {
    const t = takeOf(h, parcel, m.id);
    return t ? [{ m, t }] : [];
  });
  if (!takes.length) return null;
  return (
    <ul className="sh-takes" aria-label="Takes">
      {takes.map(({ m, t }) => (
        <li key={t.key} className="sh-take">
          <b>
            {m.name} · {ANSWER_WORD[t.answer]}
          </b>
          {(atOpen.keys.has(`${t.key}@${t.at}`) || fresh.some((x) => x.key === t.key && x.at === t.at)) && (
            <span className="new-dot" role="img" aria-label={`New take from ${m.name}`} />
          )}
          {t.comment && <span className="sh-take-comment">“{t.comment}”</span>}
        </li>
      ))}
    </ul>
  );
}

const newKeys = (fresh: readonly { parcel: string; key: string; at: string }[], parcel: string) =>
  new Set(fresh.filter((t) => t.parcel === parcel).map((t) => `${t.key}@${t.at}`));
