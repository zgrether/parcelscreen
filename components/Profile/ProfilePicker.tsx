"use client";
/**
 * The profile picker (step 1, PR 5b; docs/plans/step-1-profiles-grading.md §3.4): the current profile's name, and
 * under it the profiles to switch to (the most recently opened first), each with Rename and Delete (a confirm naming
 * what goes), and "Add a profile". Switching, adding and deleting the current profile reload the page, so nothing of
 * the previous profile survives. In the menu (step 4b: it left the pages' headers). Where the browser
 * refused storage it says so instead: one profile, in memory, until the page closes.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  addProfile,
  currentProfile,
  deleteProfile,
  listProfiles,
  reloadAfterWrites,
  renameProfile,
  storageUnavailable,
  switchProfile,
} from "@/lib/client/profiles";
import { useKeepInView } from "@/lib/client/keepInView";
import type { Profile } from "@/lib/client/profileStore";

/** The menu's line where IndexedDB is refused (owner, step 1 plan §8 Q5). */
export const NOTHING_KEPT =
  "This browser refused storage: this profile lasts until the page closes, and nothing is kept.";

export function ProfilePicker() {
  const [name, setName] = useState(() => currentProfile()?.name ?? "");
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  useKeepInView(pop, open, trigger);
  const currentId = currentProfile()?.id ?? null;
  const unavailable = storageUnavailable();

  const refresh = () => void listProfiles().then(setProfiles);
  useEffect(() => {
    if (open) refresh();
  }, [open]);
  // A click outside closes the list.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const placeholder = `Profile ${profiles.length + 1}`;
  // A new profile starts with the interview, its name first (step 4, §6.1): no name asked here.
  const add = async () => {
    if (busy) return;
    setBusy(true);
    const p = await addProfile(placeholder);
    await switchProfile(p.id, "/interview");
  };
  const rename = async (e: FormEvent, p: Profile) => {
    e.preventDefault();
    const next = draft.trim();
    if (!next) return;
    await renameProfile(p.id, next);
    if (p.id === currentId) setName(next);
    setRenaming(null);
    refresh();
  };
  const remove = async (p: Profile) => {
    if (busy) return;
    setBusy(true);
    const { wasCurrent } = await deleteProfile(p.id);
    if (wasCurrent) {
      await reloadAfterWrites();
      return;
    }
    setDeleting(null);
    setBusy(false);
    refresh();
  };

  return (
    <div className="profile-picker" ref={box}>
      <button
        ref={trigger}
        className="profile-btn"
        aria-label="Switch profile"
        aria-expanded={open}
        title="Switch profile"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="profile-btn-name">{name}</span>
        <span aria-hidden="true"> ▾</span>
      </button>
      {open && (
        <div ref={pop} className="profile-pop" role="group" aria-label="Profiles">
          {unavailable && <p className="tiny muted m-0">{NOTHING_KEPT}</p>}
          <ul className="profile-list">
            {profiles.map((p) => {
              const current = p.id === currentId;
              return (
                <li key={p.id}>
                  {renaming === p.id ? (
                    <form className="profile-form" onSubmit={(e) => void rename(e, p)}>
                      <input
                        aria-label={`New name for ${p.name}`}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        autoFocus
                      />
                      <button className="btn small" type="submit">
                        Save
                      </button>
                      <button className="btn small secondary" type="button" onClick={() => setRenaming(null)}>
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <button
                      className="profile-name"
                      disabled={current}
                      aria-current={current ? "true" : undefined}
                      onClick={() => void switchProfile(p.id)}
                    >
                      {p.name}
                      {current && <span className="tiny muted"> · current</span>}
                    </button>
                  )}
                  {deleting === p.id ? (
                    <span className="tiny profile-confirm" role="alert">
                      Delete {p.name}? Its parcels, screens and settings go with it.{" "}
                      <button className="btn small danger" disabled={busy} onClick={() => void remove(p)}>
                        Delete
                      </button>{" "}
                      <button className="btn small secondary" onClick={() => setDeleting(null)}>
                        Keep
                      </button>
                    </span>
                  ) : (
                    renaming !== p.id &&
                    !unavailable && (
                      <>
                        <button
                          className="btn secondary small"
                          onClick={() => {
                            setDraft(p.name);
                            setRenaming(p.id);
                          }}
                        >
                          Rename
                        </button>
                        <button className="btn secondary small" onClick={() => setDeleting(p.id)}>
                          Delete
                        </button>
                      </>
                    )
                  )}
                </li>
              );
            })}
          </ul>
          {!unavailable && (
            <div className="profile-add">
              <button className="btn small" type="button" disabled={busy} onClick={() => void add()}>
                Add a profile
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
