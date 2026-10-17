"use client";
/**
 * The app menu (owner, after 14d): ☰ at the map's top left opens a drawer from the left with what isn't
 * about the open parcel — the profile and its picker (step 1), History with Export file / Import file (16b), Your list
 * (WF2b), Compare parcels (VR6), How to read this, and Settings (16a).
 * It closes with ×, Esc, a tap on the scrim, opening a parcel from History, or opening the help.
 * The drawer is portalled to <body> so it sits above the bottom sheet on phones, not inside the map.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useHelp } from "@/components/Help/HelpDialog";
import { ProfilePicker } from "@/components/Profile/ProfilePicker";
import { useSettings } from "@/components/Settings/SettingsDialog";
import { OLD_DATA_DROPPED } from "@/lib/client/oldData";
import { oldDataDropped } from "@/lib/client/profiles";
import { ExportImport } from "./ExportImport";
import { History } from "./History";

export function Menu() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="map-ctl-btn menu-btn"
        aria-label="Menu"
        title="Menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <MenuIcon />
      </button>
      {open && createPortal(<Drawer close={() => setOpen(false)} />, document.body)}
    </>
  );
}

function Drawer({ close }: { close(): void }) {
  const help = useHelp();
  const settings = useSettings();
  const closeBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <div className="menu-layer">
      <div className="menu-scrim" onClick={close} />
      <nav className="menu-drawer" aria-label="Menu">
        <header className="menu-head">
          <div>
            <div className="menu-title">Parcel Screen</div>
            <div className="tiny muted">Kill parcels from your desk, before you drive.</div>
          </div>
          <button ref={closeBtn} className="menu-close" aria-label="Close the menu" onClick={close}>
            ×
          </button>
        </header>
        <div className="menu-body">
          {/* Whose data this is (step 1, plan §3.4): the current profile, and the others to switch to. */}
          <section className="block profile-block">
            <h2>Profile</h2>
            <ProfilePicker />
            {/* Only on the boot that dropped data from before profiles (step 2 plan §9): the next one finds none. */}
            {oldDataDropped() && <p className="tiny muted m-0 old-data-note">{OLD_DATA_DROPPED}</p>}
          </section>
          <History onOpened={close} />
          <ExportImport />
          <ul className="menu-items">
            {/* WF2b: the household's list (docs/plans/parcel-workflow.md §5). */}
            <li>
              <Link href="/library">Your list</Link>
            </li>
            {/* VR6: History's parcels side by side (value-ranking.md §7). */}
            <li>
              <Link href="/compare">Compare parcels</Link>
            </li>
            {/* VR7: the rules of both grades, and a parcel's breakdown (value-ranking.md §8). */}
            <li>
              <Link href="/rulebook">What the grade means</Link>
            </li>
            <li>
              <button
                onClick={() => {
                  close();
                  help();
                }}
              >
                How to read this
              </button>
            </li>
            <li>
              <button
                onClick={() => {
                  close();
                  settings.open();
                }}
              >
                Settings
              </button>
            </li>
          </ul>
        </div>
      </nav>
    </div>
  );
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
