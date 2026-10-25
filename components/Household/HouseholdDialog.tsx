"use client";
/**
 * Household (UX part 2 PR 5; the audit's P-8): its own item in the menu, above Settings. Who grades parcels with you,
 * each with Rename, and how to bring your own other devices in (the sync code, as Settings › Your data has it). Opened
 * from the menu, and from a parcel's Ask when there's no one yet to ask.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { RUBRICS_CHANGED } from "@/lib/client/profileEvents";
import { members, type Member } from "@/lib/client/household";
import { currentProfileId, renameProfile } from "@/lib/client/profiles";
import { SyncSection } from "@/components/Sync/SyncSection";

export const HOUSEHOLD_WORDS = {
  title: "Household",
  lead: "Everyone who grades parcels with you. Each has their own priorities; the list is shared.",
  you: "you",
  rename: "Rename",
  save: "Save",
  cancel: "Cancel",
  close: "Close",
  alone:
    "It's just you so far. Someone who joins on their own device, with your code and I'm new here, shows here, and you can ask for their take on a parcel.",
  devices: "Your devices",
};

interface HouseholdApi {
  open(): void;
}
const HouseholdContext = createContext<HouseholdApi>({ open: () => {} });
export const useHouseholdDialog = (): HouseholdApi => useContext(HouseholdContext);

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [list, setList] = useState<readonly Member[]>([]);
  const refresh = useCallback(() => setList([...members()]), []);
  // The members are reloaded after a rename or a sync, and announced with the rubrics (lib/client/household.ts).
  useEffect(() => {
    window.addEventListener(RUBRICS_CHANGED, refresh);
    return () => window.removeEventListener(RUBRICS_CHANGED, refresh);
  }, [refresh]);
  const open = useCallback(() => {
    refresh();
    dialog.current?.showModal();
  }, [refresh]);
  const close = () => dialog.current?.close();
  const api = useMemo(() => ({ open }), [open]);
  const me = currentProfileId();
  return (
    <HouseholdContext.Provider value={api}>
      {children}
      <dialog
        ref={dialog}
        className="help-dialog household-dialog"
        aria-labelledby="household-title"
        // A click on the dialog element itself is a click on its backdrop: its content fills it.
        onClick={(e) => e.target === e.currentTarget && close()}
      >
        <header className="help-head">
          <h2 id="household-title">{HOUSEHOLD_WORDS.title}</h2>
        </header>
        <div className="help-body household-body">
          <p className="tiny muted">{HOUSEHOLD_WORDS.lead}</p>
          <ul className="household-members" aria-label="Members">
            {list.map((m) => (
              <MemberRow key={m.id} m={m} me={m.id === me} />
            ))}
          </ul>
          {list.length < 2 && <p className="tiny muted">{HOUSEHOLD_WORDS.alone}</p>}
          <h3>{HOUSEHOLD_WORDS.devices}</h3>
          <SyncSection />
        </div>
        <footer className="settings-foot">
          <div className="settings-buttons">
            <button className="btn secondary" onClick={close}>
              {HOUSEHOLD_WORDS.close}
            </button>
          </div>
        </footer>
      </dialog>
    </HouseholdContext.Provider>
  );
}

function MemberRow({ m, me }: { m: Member; me: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  if (draft !== null)
    return (
      <li className="household-member">
        <form
          className="household-rename"
          onSubmit={(e) => {
            e.preventDefault();
            const next = draft.trim();
            if (!next) return;
            void renameProfile(m.id, next).then(() => setDraft(null));
          }}
        >
          <input
            aria-label={`New name for ${m.name}`}
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
          />
          <button className="btn small" type="submit" disabled={!draft.trim()}>
            {HOUSEHOLD_WORDS.save}
          </button>
          <button className="btn secondary small" type="button" onClick={() => setDraft(null)}>
            {HOUSEHOLD_WORDS.cancel}
          </button>
        </form>
      </li>
    );
  return (
    <li className="household-member">
      <span>
        {m.name}
        {me && <span className="tiny muted"> ({HOUSEHOLD_WORDS.you})</span>}
      </span>
      <button className="btn secondary small" onClick={() => setDraft(m.name)}>
        {HOUSEHOLD_WORDS.rename}
      </button>
    </li>
  );
}
