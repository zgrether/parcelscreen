"use client";
/**
 * The explorer's layout (proto L26–33, L129–148): a full-screen map with the results over it.
 *   - Phones (narrow portrait): the results are a bottom sheet (useBottomSheet), hidden until a parcel is open.
 *   - Desktop, and phones on their side (owner, after 14d): the results float at the map's top left, as a
 *     compact card (the parcel, its acres, Screen it) until there's something to read; a run, or a kept
 *     result, grows the card into a full-height panel. The panel folds back to the card, which then shows
 *     the verdict line. The map is padded by whichever is showing, and never moves when it changes.
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
import { mapShowing } from "@/lib/client/mapShowing";
import { ScreenItContext } from "@/components/Results/ScreenItContext";
import { debugFromUrl } from "@/lib/client/debugHandle";
import { ScreenBody, ScreenHeader, useScreenIt } from "@/components/Results/panel/ScreenIt";
import { SHEET_QUERY, useBottomSheet } from "./useBottomSheet";
import { ExploreContext, useExploreController } from "./useExploreController";

/** The floating card's and panel's widths, and their gap from the map's edge (desktop). */
const CARD_W = 340;
const PANEL_W = 420;
const EDGE = 10;

/** Narrower on a phone on its side: the panel keeps under half the screen. */
function useFloatWidths(): { card: number; panel: number } {
  const vw = useSyncExternalStore(
    (changed) => {
      window.addEventListener("resize", changed);
      return () => window.removeEventListener("resize", changed);
    },
    () => window.innerWidth,
    () => 1280,
  );
  const panel = Math.min(PANEL_W, Math.round(vw * 0.48));
  return { card: Math.min(CARD_W, panel), panel };
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
  const { mode, split, info, store, serial } = explore.state;
  const sheet = useBottomSheet(root, panel, mode !== null || split !== null || (info && store.open !== null));
  // A map tool has the screen: on a phone the tab bar steps aside too (step 4b; CSS, only while the map is showing).
  const tool = mode !== null || split !== null;
  useEffect(() => {
    document.documentElement.classList.toggle("map-tool", tool);
    return () => document.documentElement.classList.remove("map-tool");
  }, [tool]);
  const tabs = useTabsHeight();
  const screen = useScreenIt(explore, config, sheet.raise, setHint);
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

  // Desktop: card or panel. There's something to read once a run starts (its steps), or a result is kept.
  // Folding is remembered for this parcel and this run; a new run, or another parcel, unfolds it.
  const { docked } = explore;
  const widths = useFloatWidths();
  const readable = screen.showSteps || screen.display !== null || screen.error !== null;
  const foldKey = `${serial}:${screen.runningHere ? "run" : "idle"}`;
  const [foldedAt, setFoldedAt] = useState<string | null>(null);
  const expanded = docked && readable && foldedAt !== foldKey;
  const fold = docked && readable ? () => setFoldedAt(expanded ? foldKey : null) : null;
  const leftInset = docked ? EDGE + (expanded ? widths.panel : widths.card) : 0;

  // Phones: with no parcel open the sheet would only repeat the toolbar's "Tap a parcel…", so it's hidden
  // until one is (owner, #48). The map keeps its bottom padding, so nothing moves when the sheet comes in.
  const sheetHidden = !docked && store.open === null;

  const vars: Record<string, string> = {};
  // The sheet's height, for what sits on the map above it (hint, attribution).
  if (sheet.height != null) vars["--sheet-h"] = sheetHidden ? "0px" : `${sheet.height}px`;
  if (docked) {
    vars["--float-w"] = `${expanded ? widths.panel : widths.card}px`;
    // What's centred along the map's bottom (toolbar, hint) keeps clear of the full-height panel.
    vars["--float-l"] = `${expanded ? EDGE + widths.panel : 0}px`;
  }
  const panelClass = [
    "explore-panel",
    sheet.mapMode ? "mapmode" : "",
    sheetHidden ? "sheet-hidden" : "",
    docked ? (expanded ? "float expanded" : "float card") : "",
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
              {/* One line, always: the parcel and the screen button (owner, after 14d). On phones it's the peek. */}
              <header className="explore-header" {...sheet.handlers}>
                <ScreenHeader s={screen} desk={docked ? { expanded, fold } : null} />
              </header>
              {(!docked || expanded) && (
                <div className="explore-scroll">
                  <ScreenBody s={screen} />
                  {children}
                </div>
              )}
            </aside>
          </div>
          <PwaShell running={screen.running} />
        </GroundProvider>
      </ScreenItContext.Provider>
    </ExploreContext.Provider>
  );
}
