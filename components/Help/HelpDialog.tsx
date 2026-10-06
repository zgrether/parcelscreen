"use client";
/**
 * The help dialog (proto L286–339, L1617–1622): "How to read this" from the app menu, and each report
 * section's "?" link, which opens it at that section's notes. A native <dialog>, so Esc closes it and focus
 * stays inside while it's open; a tap on the backdrop closes it too.
 */
import { createContext, useCallback, useContext, useRef, type ReactNode } from "react";
import { HelpText } from "./HelpText";

/** Opens the help, at an anchor (`h-verdict`, …) or at the top. */
type OpenHelp = (anchor?: string) => void;

const HelpContext = createContext<OpenHelp>(() => {});

export const useHelp = (): OpenHelp => useContext(HelpContext);

export function HelpProvider({ children }: { children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);

  const open = useCallback<OpenHelp>((anchor) => {
    const d = dialog.current;
    if (!d) return;
    if (!d.open) d.showModal();
    const target = anchor ? body.current?.querySelector<HTMLElement>(`#${anchor}`) : null;
    body.current?.querySelector("h3.hit")?.classList.remove("hit");
    if (target) {
      target.scrollIntoView({ block: "start" });
      // The last few sections can't reach the top of the box: light the one asked for.
      void target.offsetWidth; // restart the animation if it's the same section again
      target.classList.add("hit");
    } else body.current?.scrollTo({ top: 0 });
  }, []);

  return (
    <HelpContext.Provider value={open}>
      {children}
      <dialog
        ref={dialog}
        className="help-dialog"
        aria-labelledby="help-title"
        // A click on the dialog element itself is a click on its backdrop: its content fills it.
        onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
      >
        <header className="help-head">
          <h2 id="help-title">How to read this</h2>
          <button className="btn secondary small" onClick={() => dialog.current?.close()}>
            Close
          </button>
        </header>
        <div ref={body} className="help-body">
          <HelpText />
        </div>
      </dialog>
    </HelpContext.Provider>
  );
}
