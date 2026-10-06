"use client";
/**
 * The explorer's layout (proto L26–33, L129–148): the panel on the left and the map on the right; on narrow
 * portrait screens the map fills the screen and the panel is a bottom sheet over it. The parcel tools' state
 * is shared by the panel and the map through ExploreContext.
 * Rendered client-side only (see ExploreClient): the map and the persisted sheet height need the browser.
 */
import { useCallback, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { loadUserConfig } from "@/lib/client/userConfig";
import { History } from "./History";
import { MapArea } from "./MapArea";
import { ScreenBody, ScreenHeader, useScreenIt } from "@/components/Results/panel/ScreenIt";
import { useBottomSheet } from "./useBottomSheet";
import { ExploreContext, useExploreController } from "./useExploreController";

export function ExploreShell({ children }: { children?: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const [config] = useState(loadUserConfig);
  const [hint, setHintState] = useState("");
  const setHint = useCallback((t: string | ((prev: string) => string)) => setHintState(t), []);
  const explore = useExploreController(config.endpoints.parcels, setHint);
  // On phones the sheet steps aside to its peek while a map tool or the Info panel has the screen (13e-6).
  const { mode, split, info, store } = explore.state;
  const sheet = useBottomSheet(root, panel, mode !== null || split !== null || (info && store.open !== null));
  const screen = useScreenIt(explore, config, sheet.raise);

  return (
    <ExploreContext.Provider value={explore}>
      <div
        ref={root}
        className="explore"
        // The sheet's height, for what sits on the map above it (hint, attribution).
        style={sheet.height != null ? ({ "--sheet-h": `${sheet.height}px` } as CSSProperties) : undefined}
      >
        <aside
          ref={panel}
          className={`explore-panel${sheet.mapMode ? " mapmode" : ""}`}
          style={sheet.height != null ? { height: sheet.height } : undefined}
        >
          <div className="sheet-handle" title="Drag or tap to resize" {...sheet.handlers} />
          {/* One line, always: the parcel and the screen button (owner, after 14d). On phones it's the peek. */}
          <header className="explore-header" {...sheet.handlers}>
            <ScreenHeader s={screen} />
          </header>
          <div className="explore-scroll">
            <ScreenBody s={screen} />
            {children}
            <History />
          </div>
        </aside>
        <div className="explore-map">
          <MapArea config={config} hint={hint} setHint={setHint} bottomInset={sheet.inset} />
        </div>
      </div>
    </ExploreContext.Provider>
  );
}
