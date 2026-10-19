"use client";
/**
 * The explorer's layout (proto L26–33, L129–148): a full-screen map with the results over it.
 *   - Phones (narrow portrait): the results are a bottom sheet (useBottomSheet), hidden until a parcel is open.
 *   - Desktop, and phones on their side: one docked panel at the left edge (step 4c, plan §1), Search its first row.
 *     With no parcel open it's that row alone; with one, it runs the window's height. It collapses to a slim tab
 *     (DockTab), remembered for the session. The map is padded by the full panel, and never moves when it changes;
 *     what's centred on the map's bottom (toolbar, hint) centres between the panel and the right-hand column.
 * The parcel tools' state is shared by the panel and the map through ExploreContext.
 * It stays mounted behind the other tabs (step 4b, components/Nav/AppFrame.tsx); Settings and the help dialog are the
 * frame's. On a phone the tab bar steps aside while a map tool is in use (html.map-tool).
 * Rendered client-side only (see ExploreClient): the map and the sheet need the browser.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useSettings } from "@/components/Settings/SettingsDialog";
import { GroundProvider } from "@/components/Ground/GroundContext";
import { PwaShell } from "@/components/Pwa/PwaShell";
import { MapArea } from "./MapArea";
import { Search } from "@/components/Map/Search";
import { mapShowing } from "@/lib/client/mapShowing";
import { ScreenItContext } from "@/components/Results/ScreenItContext";
import { debugFromUrl } from "@/lib/client/debugHandle";
import { DockTab, ScreenBody, ScreenHeader, useScreenIt } from "@/components/Results/panel/ScreenIt";
import { GradeAction } from "@/components/Results/panel/GradeAction";
import { PEEK, PEEK_WITH_ACTION, SHEET_QUERY, useBottomSheet } from "./useBottomSheet";
import { ExploreContext, useExploreController } from "./useExploreController";

/** The docked panel's width (desktop; step 4c). */
const DOCK_W = 380;
/** The right-hand column of map buttons: 44 px wide, 24 px from the edge (MapControls), or beside the Info panel. */
const COLUMN_W = 44;
const COLUMN_GAP = 24;

/** Narrower on a phone on its side: the panel keeps under half the screen. */
function useDockWidth(): number {
  const vw = useSyncExternalStore(
    (changed) => {
      window.addEventListener("resize", changed);
      return () => window.removeEventListener("resize", changed);
    },
    () => window.innerWidth,
    () => 1280,
  );
  return Math.min(DOCK_W, Math.round(vw * 0.48));
}

/** The panel collapsed to its tab, for this tab's session (owner, 4c Q6): a new window starts with it open. */
const COLLAPSED_KEY = "ps.dockCollapsed";
function useDockCollapsed(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => {
    try {
      return sessionStorage.getItem(COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const set = useCallback((next: boolean) => {
    setOn(next);
    try {
      if (next) sessionStorage.setItem(COLLAPSED_KEY, "1");
      else sessionStorage.removeItem(COLLAPSED_KEY);
    } catch {
      /* storage blocked: it lasts until the page closes */
    }
  }, []);
  return [on, set];
}

/**
 * The phone's tab bar height, px: the map reaches under it (its canvas, .map-canvas), so the map's padding keeps the
 * view's centre above it. Held while the bar steps aside for a tool, so the map doesn't move under the tool.
 */
function useTabsHeight(): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    const measure = () => {
      if (!window.matchMedia(SHEET_QUERY).matches) return setH(0);
      const nav = document.querySelector<HTMLElement>(".app-nav");
      const px = nav?.offsetHeight ?? 0;
      if (px > 0 || !nav) setH(px);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  return h;
}

export function ExploreShell({ children }: { children?: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  // Live (16a): a Settings save is used by the next run, and the open results get "used earlier settings".
  const { config } = useSettings();
  const [hint, setHintState] = useState("");
  const setHint = useCallback((t: string | ((prev: string) => string)) => setHintState(t), []);
  const explore = useExploreController(config.endpoints.parcels, setHint);
  // On phones the sheet steps aside to its peek while a map tool or the Info panel has the screen (13e-6).
  const { mode, split, info, store } = explore.state;
  // The screen's "after a run, rise" calls the sheet's, which is made below (the sheet's peek depends on the screen).
  const raiseSheet = useRef<() => void>(() => {});
  const raise = useCallback(() => raiseSheet.current(), []);
  const screen = useScreenIt(explore, config, raise, setHint);
  // The phone's peek holds the grade button under the header while it shows (owner, 4c: 148 px), else 92 px.
  const peek = !explore.docked && store.open && screen.grade ? PEEK_WITH_ACTION : PEEK;
  const sheet = useBottomSheet(
    root,
    panel,
    mode !== null || split !== null || (info && store.open !== null),
    peek,
  );
  useEffect(() => {
    raiseSheet.current = sheet.raise;
  });
  // A map tool has the screen: on a phone the tab bar steps aside too (step 4b; CSS, only while the map is showing).
  const tool = mode !== null || split !== null;
  useEffect(() => {
    document.documentElement.classList.toggle("map-tool", tool);
    return () => document.documentElement.classList.remove("map-tool");
  }, [tool]);
  const tabs = useTabsHeight();
  // Esc on desktop closes the open parcel (17e), when nothing else should take it: no map tool, no panel, no
  // menu, viewer or dialog, no text field. Those keep their own Esc.
  const escape = useRef({ explore, docked: explore.docked });
  useEffect(() => {
    escape.current = { explore, docked: explore.docked };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { explore: x, docked: desk } = escape.current;
      if (e.key !== "Escape" || e.defaultPrevented || !desk || !mapShowing()) return;
      const s = x.current();
      if (!s.store.open || s.mode || s.split || s.info || s.mapPanel) return;
      if ((e.target as HTMLElement | null)?.closest("input,select,textarea,[contenteditable]")) return;
      if (document.querySelector(".menu-panel, .ground-layer, dialog[open]")) return;
      x.close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  // ?debug=1 / ?debug=0 (A4b PR B), before anything reads the setting.
  useEffect(() => debugFromUrl(window.location.search), []);
  // The headless checks read the live session view, like window.__psMap (MapView): only with ps.debug set.
  useEffect(() => {
    try {
      if (localStorage.getItem("ps.debug") === "1") (window as { __psScreen?: unknown }).__psScreen = screen;
    } catch {
      /* storage blocked: no debug handle */
    }
  });

  // Desktop: the docked panel. No parcel open: Search alone. One open: the window's height, unless it's collapsed to
  // its tab (which only a parcel has).
  const { docked } = explore;
  const dockW = useDockWidth();
  const [collapsedPref, setCollapsed] = useDockCollapsed();
  const parcelOpen = store.open !== null;
  const collapsed = docked && parcelOpen && collapsedPref;
  const full = docked && parcelOpen && !collapsed;
  const leftInset = full ? dockW : 0;

  // Phones: with no parcel open the sheet would only repeat the toolbar's "Tap a parcel…", so it's hidden
  // until one is (owner, #48). The map keeps its bottom padding, so nothing moves when the sheet comes in.
  const sheetHidden = !docked && store.open === null;

  const vars: Record<string, string> = {};
  // The sheet's height, for what sits on the map above it (hint, attribution).
  if (sheet.height != null) vars["--sheet-h"] = sheetHidden ? "0px" : `${sheet.height}px`;
  // The right-hand column ends above the peek, whichever it is (step 4c).
  vars["--peek"] = `${peek}px`;
  if (docked) {
    vars["--dock-w"] = `${dockW}px`;
    // What's centred along the map's bottom (toolbar, hint) centres on the visible map: clear of the full panel on the
    // left and of the right-hand column (or the Info panel it sits beside) on the right.
    vars["--float-l"] = `${leftInset}px`;
    const columnRight = explore.panelInset ? explore.panelInset + 10 : COLUMN_GAP;
    vars["--col-r"] = `${columnRight + COLUMN_W}px`;
  }
  const panelClass = [
    "explore-panel",
    sheet.mapMode ? "mapmode" : "",
    sheetHidden ? "sheet-hidden" : "",
    docked ? (collapsed ? "dock collapsed" : full ? "dock full" : "dock search-only") : "",
    // The phone sheet with a parcel open and nothing run yet: the header alone (17e).
    !docked && explore.state.store.open && !screen.display && !screen.showSteps ? "bare" : "",
  ].join(" ");

  return (
    <ExploreContext.Provider value={explore}>
      <ScreenItContext.Provider value={screen}>
        <GroundProvider timeZone={config.timeZone} endpoints={config.endpoints}>
          <div ref={root} className="explore" style={vars as CSSProperties}>
            <div className="explore-map">
              <MapArea
                config={config}
                hint={hint}
                setHint={setHint}
                bottomInset={sheet.inset + tabs}
                leftInset={leftInset}
              />
            </div>
            <aside
              ref={panel}
              className={panelClass}
              style={sheet.height != null ? { height: sheet.height } : undefined}
            >
              <div className="sheet-handle" title="Drag or tap to resize" {...sheet.handlers} />
              {/* The desktop panel's first row: Search (step 4c). */}
              {docked && (
                <div className="dock-search">
                  <Search docked photonUrl={config.endpoints.photon} hint={setHint} />
                </div>
              )}
              {(!docked || parcelOpen) && (
                <>
                  {/* The parcel and the screen button (owner, after 14d). On phones it's the peek. */}
                  <header className="explore-header" {...sheet.handlers}>
                    <ScreenHeader s={screen} desk={docked} />
                  </header>
                  {/* The phone's grade button, under the header (owner, 4c Q1); the desktop's is the toolbar's. */}
                  {!docked && <GradeAction where="sheet" />}
                  <div className="explore-scroll">
                    <ScreenBody s={screen} />
                    {children}
                  </div>
                </>
              )}
              {full && (
                <button
                  className="dock-edge"
                  aria-label="Collapse the panel"
                  aria-expanded={true}
                  title="Collapse the panel"
                  onClick={() => setCollapsed(true)}
                >
                  ‹
                </button>
              )}
            </aside>
            {collapsed && <DockTab s={screen} reopen={() => setCollapsed(false)} />}
          </div>
          <PwaShell running={screen.running} />
        </GroundProvider>
      </ScreenItContext.Provider>
    </ExploreContext.Provider>
  );
}
