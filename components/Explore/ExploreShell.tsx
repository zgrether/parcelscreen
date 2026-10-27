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
  useLayoutEffect,
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
import { HeaderActions } from "@/components/Results/panel/HeaderActions";
import { GradeNote } from "@/components/Results/panel/GradeNote";
import { GradeAction } from "@/components/Results/panel/GradeAction";
import { PEEK, PEEK_ANSWER, PEEK_WITH_ACTION, SHEET_QUERY, useBottomSheet } from "./useBottomSheet";
import { ExploreContext, useExploreController } from "./useExploreController";
import { Details } from "@/components/Parcel/Details";
import { Uses } from "@/components/Parcel/Uses";
import { NOT_GRADED, ParcelSwitch, SHOW_BOUNDARY } from "@/components/Parcel/ParcelSwitch";
import { AreaBox } from "@/components/Areas/AreaBox";
import { ScenarioGradingContext, useScenarioGrading } from "@/components/Split/useScenarioGrading";

/** The docked panel's width (desktop; step 4c). */
const DOCK_W = 380;
/** The right-hand column of map buttons: 44 px wide, 24 px from the edge (MapControls), or beside Map layers. */
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
  // On phones the sheet steps aside to its peek while a map tool has the screen (13e-6).
  const { mode, split, info, uses, store } = explore.state;
  // Polish 2 (P4): a parcel, and each of its tabs, opens at its top, not where the last one was scrolled. A layout
  // effect, so a tab's own scroll on mounting (Details at Boundary, a selected line's row) still wins.
  const scroller = useRef<HTMLDivElement>(null);
  const openKey = store.open?.key ?? null;
  useLayoutEffect(() => {
    scroller.current?.scrollTo?.({ top: 0 });
  }, [openKey, info, uses]);
  // The screen's "after a run, rise" calls the sheet's, which is made below (the sheet's peek depends on the screen).
  const raiseSheet = useRef<(tall?: boolean) => void>(() => {});
  // After a run the sheet rises, and the panel shows Grade (step 8b).
  const exploreNow = useRef(explore);
  useEffect(() => {
    exploreNow.current = explore;
  });
  const raise = useCallback((tall?: boolean) => {
    raiseSheet.current(tall);
    exploreNow.current.setInfo(false);
  }, []);
  const screen = useScreenIt(explore, config, raise, setHint);
  // Step 14: Grade both pieces, in a worker of its own; the panel shows it on Uses (the reducer opened it), the sheet up.
  const raiseOnly = useCallback(() => raiseSheet.current(), []);
  const scenarios = useScenarioGrading(explore, config, raiseOnly);
  // The phone's peek holds the grade button under the header while it shows (owner, 4c: 148 px), else 92 px.
  // Step 7: otherwise, the answer's reason under the grade, on two lines at most, while a graded parcel is open. The
  // grade button keeps its place when it shows ("Try again: …"): the peek stays within 4c's 148 px, clear of the map's
  // buttons on a short phone, and the answer is one swipe up.
  const withAction = !explore.docked && !!store.open && !!screen.grade;
  const answered = !!store.open && !!screen.shown && !screen.stale && !screen.runningHere && !withAction;
  const peek = withAction ? PEEK_WITH_ACTION : PEEK + (answered ? PEEK_ANSWER : 0);
  // Step 8b: Details is in the sheet, so only a map tool steps it aside now.
  const sheet = useBottomSheet(root, panel, mode !== null || split !== null, peek);
  useEffect(() => {
    raiseSheet.current = sheet.raise;
  });
  // Step 8b (plan §2): each parcel opens on Grade, or on Details when never graded; a line or mark selected raises the
  // sheet to show its row.
  const { serial, layer } = explore.state;
  const ungraded = !!store.open && store.open.screenIds.length === 0;
  const { setInfo } = explore;
  useEffect(() => {
    // Not remembered between parcels (plan §2): Grade for a graded one, Details for one never graded.
    if (store.open && ungraded !== explore.state.info) setInfo(ungraded);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per parcel opened
  }, [serial]);
  useEffect(() => {
    if (layer) raiseSheet.current();
  }, [layer]);
  // The toolbar's acres (Details at Boundary) raises it too.
  useEffect(() => {
    const up = () => raiseSheet.current();
    window.addEventListener(SHOW_BOUNDARY, up);
    return () => window.removeEventListener(SHOW_BOUNDARY, up);
  }, []);
  // A card panel (the Easement's, say) is Grade's: Details or Uses closes it, so it doesn't cover the switch.
  const { closePanel } = screen;
  useEffect(() => {
    if (info || uses) closePanel();
  }, [info, uses, closePanel]);
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
      // Details' own Esc closes an open row first (step 8b).
      if (!s.store.open || s.mode || s.split || s.layer || s.mapPanel) return;
      if ((e.target as HTMLElement | null)?.closest("input,select,textarea,[contenteditable]")) return;
      if (document.querySelector(".menu-panel, .ground-layer, dialog[open], .rubric-sheet-scrim")) return;
      x.dismiss(); // as the × (J-2: it closes)
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
  // The sheet raised past the middle (its 88% snap): the map's floating toolbar and notes would sit among the map's
  // buttons along the top (the UX audit's B-7), over a map that's barely showing. They step aside until it's lowered.
  const sheetTall =
    !docked && !sheetHidden && sheet.height != null && typeof window !== "undefined"
      ? sheet.height > window.innerHeight * 0.6
      : false;

  const vars: Record<string, string> = {};
  // The sheet's height, for what sits on the map above it (hint, attribution).
  if (sheet.height != null) vars["--sheet-h"] = sheetHidden ? "0px" : `${sheet.height}px`;
  if (docked) {
    vars["--dock-w"] = `${dockW}px`;
    // What's centred along the map's bottom (toolbar, hint) centres on the visible map: clear of the full panel on the
    // left and of the right-hand column (or Map layers, which it sits beside) on the right.
    vars["--float-l"] = `${leftInset}px`;
    const columnRight = explore.panelInset ? explore.panelInset + 10 : COLUMN_GAP;
    vars["--col-r"] = `${columnRight + COLUMN_W}px`;
    // The toolbar clears the column alone: Map layers ends above its row, so it needn't squeeze for it (polish).
    vars["--bar-r"] = `${COLUMN_GAP + COLUMN_W}px`;
  }
  const panelClass = [
    "explore-panel",
    sheet.mapMode ? "mapmode" : "",
    // Step 7: the header shows the answer's reason only while the sheet rests at its peek.
    sheet.atPeek && !withAction ? "at-peek" : "",
    sheetHidden ? "sheet-hidden" : "",
    docked ? (collapsed ? "dock collapsed" : full ? "dock full" : "dock search-only") : "",
    // The phone sheet with a parcel open and nothing run yet: the header alone (17e).
    !docked && explore.state.store.open && !info && !uses && !screen.display && !screen.showSteps
      ? "bare"
      : "",
  ].join(" ");

  return (
    <ExploreContext.Provider value={explore}>
      <ScreenItContext.Provider value={screen}>
        <GroundProvider timeZone={config.timeZone} endpoints={config.endpoints}>
          <div
            ref={root}
            className={sheetTall ? "explore sheet-tall" : "explore"}
            style={vars as CSSProperties}
          >
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
              {/* A button, so a tap on it stays on it: the browser's touch adjustment moves a tap on a plain element to the
                  nearest button, which since 8c is the header's "Add to list" just below. Out of the tab order, as the
                  sheet's drag is. */}
              <button
                type="button"
                className="sheet-handle"
                title="Drag or tap to resize"
                tabIndex={-1}
                aria-hidden="true"
                {...sheet.handlers}
              />
              {/* The desktop panel's first row: Search (step 4c). */}
              {docked && (
                <div className="dock-search">
                  <Search docked photonUrl={config.endpoints.photon} hint={setHint} />
                </div>
              )}
              {/* Step 13: with nothing open, where to look. */}
              {docked && !parcelOpen && (
                <div className="dock-areas">
                  <AreaBox where="map" />
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
                  {/* UX part 2 PR 3 (P-2): ★, Not for us, Ask and ⋯, then the household's takes. */}
                  {store.open && <HeaderActions s={screen} />}
                  {/* Step 8b: what an edit changed on the card, for a few seconds; then Grade | Uses | Details. */}
                  {store.open && <GradeNote s={screen} />}
                  {store.open && <ParcelSwitch ctl={explore} />}
                  <div className="explore-scroll" ref={scroller}>
                    {info && store.open ? (
                      <Details ctl={explore} />
                    ) : uses && store.open ? (
                      <ScenarioGradingContext.Provider value={scenarios}>
                        <Uses s={screen} />
                      </ScenarioGradingContext.Provider>
                    ) : (
                      <>
                        <ScreenBody s={screen} />
                        {store.open && !store.open.screenIds.length && !screen.showSteps && (
                          <p className="muted parcel-ungraded">{NOT_GRADED}</p>
                        )}
                      </>
                    )}
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
