"use client";
/**
 * The explorer's layout (proto L26–33, L129–148): a full-screen map with the results over it.
 *   - Phones (narrow portrait): the results are a bottom sheet (useBottomSheet), hidden until a parcel is open.
 *   - Desktop, and phones on their side (owner, after 14d): the results float at the map's top left, as a
 *     compact card (the parcel, its acres, Screen it) until there's something to read; a run, or a kept
 *     result, grows the card into a full-height panel. The panel folds back to the card, which then shows
 *     the verdict line. The map is padded by whichever is showing, and never moves when it changes.
 * The parcel tools' state is shared by the panel and the map through ExploreContext.
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
import { loadUserConfig, saveUserConfig } from "@/lib/client/userConfig";
import type { UserConfig } from "@/lib/screen/types";
import { SettingsProvider } from "@/components/Settings/SettingsDialog";
import { MapArea } from "./MapArea";
import { HelpProvider } from "@/components/Help/HelpDialog";
import { ScreenItContext } from "@/components/Results/ScreenItContext";
import { ScreenBody, ScreenHeader, useScreenIt } from "@/components/Results/panel/ScreenIt";
import { useBottomSheet } from "./useBottomSheet";
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

export function ExploreShell({ children }: { children?: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  // Live (16a): a Settings save is used by the next run, and the open results get "used earlier settings".
  const [config, setConfig] = useState(loadUserConfig);
  const saveConfig = useCallback((c: UserConfig) => {
    saveUserConfig(c);
    setConfig(c);
  }, []);
  const [hint, setHintState] = useState("");
  const setHint = useCallback((t: string | ((prev: string) => string)) => setHintState(t), []);
  const explore = useExploreController(config.endpoints.parcels, setHint);
  // On phones the sheet steps aside to its peek while a map tool or the Info panel has the screen (13e-6).
  const { mode, split, info, store, serial } = explore.state;
  const sheet = useBottomSheet(root, panel, mode !== null || split !== null || (info && store.open !== null));
  const screen = useScreenIt(explore, config, sheet.raise, setHint);
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
  ].join(" ");

  return (
    <ExploreContext.Provider value={explore}>
      <HelpProvider>
        <SettingsProvider config={config} onSave={saveConfig}>
          <ScreenItContext.Provider value={screen}>
            <div ref={root} className="explore" style={vars as CSSProperties}>
              <div className="explore-map">
                <MapArea
                  config={config}
                  hint={hint}
                  setHint={setHint}
                  bottomInset={sheet.inset}
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
          </ScreenItContext.Provider>
        </SettingsProvider>
      </HelpProvider>
    </ExploreContext.Provider>
  );
}
