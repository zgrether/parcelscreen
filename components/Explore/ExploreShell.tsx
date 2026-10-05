"use client";
/**
 * The explorer's layout (proto L26–33, L129–148): the panel on the left and the map on the right; on narrow
 * screens the map fills the screen and the panel is a bottom sheet. The parcel tools' state is shared by the
 * panel and the map through ExploreContext.
 * Rendered client-side only (see ExploreClient): the map and the persisted sheet height need the browser.
 */
import { useCallback, useRef, useState, type ReactNode } from "react";
import { loadUserConfig } from "@/lib/client/userConfig";
import { FindParcel } from "./FindParcel";
import { MapArea } from "./MapArea";
import { useBottomSheet } from "./useBottomSheet";
import { ExploreContext, useExploreController } from "./useExploreController";

export function ExploreShell({ children }: { children?: ReactNode }) {
  const panel = useRef<HTMLElement>(null);
  const sheet = useBottomSheet(panel);
  const [config] = useState(loadUserConfig);
  const [hint, setHintState] = useState("");
  const setHint = useCallback((t: string | ((prev: string) => string)) => setHintState(t), []);
  const explore = useExploreController(config.endpoints.parcels, setHint);

  return (
    <ExploreContext.Provider value={explore}>
      <div className="explore">
        <aside
          ref={panel}
          className={`explore-panel${sheet.mapMode ? " mapmode" : ""}`}
          style={{
            ...(sheet.height != null ? { height: sheet.height } : {}),
            ...(sheet.animating ? { transition: "height .18s" } : {}),
          }}
        >
          <div className="sheet-handle" title="Drag or tap to resize" {...sheet.handlers} />
          <header className="explore-header" {...sheet.handlers}>
            <div>
              <h1 className="font-cond m-0 text-[22px] leading-none font-semibold tracking-[.01em]">
                Parcel Screen
              </h1>
              <div className="text-ink-2 text-[12.5px]">Kill parcels from your desk, before you drive.</div>
            </div>
            <button
              className="mapmode-toggle bg-ink text-paper rounded px-2.5 py-1 text-[13px] font-medium"
              onClick={(e) => {
                e.stopPropagation();
                sheet.toggleMapMode();
              }}
            >
              {sheet.mapMode ? "Panel" : "Map"}
            </button>
          </header>
          <div className="explore-scroll">
            <FindParcel />
            {children}
          </div>
        </aside>
        <div className="explore-map">
          <MapArea config={config} hint={hint} setHint={setHint} />
        </div>
      </div>
    </ExploreContext.Provider>
  );
}
