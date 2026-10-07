"use client";
/**
 * The app menu (owner, after 14d): ☰ at the map's top left opens a drawer from the left with what isn't
 * about the open parcel — History, How to read this, and Settings (16a).
 * It closes with ×, Esc, a tap on the scrim, opening a parcel from History, or opening the help.
 * The drawer is portalled to <body> so it sits above the bottom sheet on phones, not inside the map.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useHelp } from "@/components/Help/HelpDialog";
import { useOpenSettings } from "@/components/Settings/SettingsDialog";
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
  const settings = useOpenSettings();
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
          <History onOpened={close} />
          <ul className="menu-items">
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
                  settings();
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
