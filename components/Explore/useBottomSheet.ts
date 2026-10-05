"use client";
/**
 * On narrow screens (≤ 860 px) the panel is a bottom sheet over the map (proto L1622–1642): drag the handle
 * or header to resize, tap to cycle between snap heights (peek 92 px, 46%, 88%), and below 110 px the sheet
 * is in "map mode" with its content hidden. The height persists (ps.sheet). Desktop leaves the panel alone.
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { getPref, setPref } from "@/lib/client/prefs";

const MOBILE = 860;
const isMobile = () => typeof window !== "undefined" && window.innerWidth <= MOBILE;
const snaps = () => [92, Math.round(window.innerHeight * 0.46), Math.round(window.innerHeight * 0.88)];

export function useBottomSheet(panel: RefObject<HTMLElement | null>) {
  // Restored from the last visit on mobile. The explorer renders client-side only, so this runs in the browser.
  const [height, setHeight] = useState<number | null>(() => (isMobile() ? getPref("ps.sheet") : null));
  const [animating, setAnimating] = useState(false);
  const drag = useRef<{ startY: number; startH: number; moved: boolean } | null>(null);

  const setH = useCallback((px: number) => {
    const h = Math.max(72, Math.min(window.innerHeight * 0.92, px));
    setHeight(h);
    setPref("ps.sheet", h);
  }, []);

  const snapTo = useCallback(
    (px: number) => {
      const s = snaps();
      const target = s.reduce((a, b) => (Math.abs(b - px) < Math.abs(a - px) ? b : a), s[0]!);
      setAnimating(true);
      setH(target);
      setTimeout(() => setAnimating(false), 200);
    },
    [setH],
  );

  useEffect(() => {
    const onResize = () => {
      if (!isMobile()) setHeight(null);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handlers = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (!isMobile() || (e.target as HTMLElement).closest("button,select,input")) return;
      drag.current = {
        startY: e.clientY,
        startH: panel.current?.getBoundingClientRect().height ?? 0,
        moved: false,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d) return;
      const dy = d.startY - e.clientY;
      if (Math.abs(dy) > 4) d.moved = true;
      setH(d.startH + dy);
    },
    onPointerUp: () => {
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      const h = panel.current?.getBoundingClientRect().height ?? 0;
      if (!d.moved) {
        const s = snaps();
        snapTo(h < s[1]! * 0.8 ? s[1]! : h < s[2]! * 0.9 ? s[2]! : s[0]!);
      } else snapTo(h);
    },
  };

  const mapMode = height != null && height < 110;
  /** The header's Map / Panel button. */
  const toggleMapMode = () => {
    const s = snaps();
    snapTo(mapMode ? s[1]! : s[0]!);
  };

  return {
    height,
    animating,
    mapMode,
    handlers: { ...handlers, onPointerCancel: handlers.onPointerUp },
    toggleMapMode,
  };
}
