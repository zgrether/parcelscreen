"use client";
/**
 * The menu (step 4b, plan §4): what isn't a place. The profile and its picker, the questions while the profile has no
 * answers (step 4's fix round), Help and Settings; the one-time "older version" line (step 2) at its top. It replaced
 * the map's drawer, which also held History (Your list has the same parcels) and Export / Import (now Settings' Your
 * data).
 *
 * - On a phone it's the tab bar's More: a sheet rising above the tabs, over a scrim, which keeps focus inside it.
 * - On a desktop it's ☰ at the top bar's right: a small panel under it, right-aligned and kept inside the window
 *   (useKeepInView, step 3's rule), which takes focus when it opens.
 * Either closes on Esc, a click outside it, or choosing an item, and focus goes back to the button.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useHelp } from "@/components/Help/HelpDialog";
import { ProfilePicker } from "@/components/Profile/ProfilePicker";
import { useSettings } from "@/components/Settings/SettingsDialog";
import { SHEET_QUERY } from "@/components/Explore/useBottomSheet";
import { useKeepInView } from "@/lib/client/keepInView";
import { OLD_DATA_DROPPED } from "@/lib/client/oldData";
import { oldDataDropped } from "@/lib/client/profiles";
import { getPref } from "@/lib/client/prefs";
import { MORE_LABEL } from "@/lib/client/places";
import { ANSWER_FIRST, menuOffersInterview } from "@/lib/rubric/interview/doc";

const FOCUSABLE = "a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex='-1'])";

export function Menu() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const help = useHelp();
  const settings = useSettings();
  useKeepInView(panel, open, button);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const first = panel.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        button.current?.focus();
        return;
      }
      // The phone's sheet is modal: Tab stays inside it.
      if (e.key !== "Tab" || !window.matchMedia(SHEET_QUERY).matches || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      const [a, z] = [items[0]!, items.at(-1)!];
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div ref={box} className="menu-box">
      <button
        ref={button}
        className="app-more"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
      >
        <MenuIcon />
        <span className="app-more-label">{MORE_LABEL}</span>
        <span className="app-more-sr">Menu</span>
      </button>
      {open && (
        <>
          <div className="menu-scrim" aria-hidden="true" />
          <div ref={panel} className="menu-panel" role="dialog" aria-label="Menu" tabIndex={-1}>
            {/* Only on the boot that dropped data from before profiles (step 2 plan §9): the next one finds none. */}
            {oldDataDropped() && <p className="tiny muted m-0 old-data-note">{OLD_DATA_DROPPED}</p>}
            {/* Whose data this is (step 1, plan §3.4): the current profile, and the others to switch to. */}
            <section className="menu-profile">
              <h2>Profile</h2>
              <ProfilePicker />
            </section>
            <ul className="menu-items">
              {/* Step 4: offered here only while the profile has no answers (owner, 10/18); after that it lives on
                  What matters to you. */}
              {menuOffersInterview(getPref("ps.interview")) && (
                <li>
                  <Link href="/interview" onClick={() => close(false)}>
                    {ANSWER_FIRST}
                  </Link>
                </li>
              )}
              <li>
                <button
                  onClick={() => {
                    close(false);
                    help();
                  }}
                >
                  Help
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    close(false);
                    settings.open();
                  }}
                >
                  Settings
                </button>
              </li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function MenuIcon() {
  return (
    <svg className="app-tab-icon" width="22" height="22" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
