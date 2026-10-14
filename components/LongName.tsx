"use client";
/**
 * A parcel's name where there's little room (owner, after #130): cut short with an ellipsis, the whole name on hover
 * (its title) or on a long press on a phone (a tooltip, until the next tap). The parcel's own pages show the full name.
 * With `full`, the text shown is short and `full` is what hover and a long press tell (a state, and its county).
 */
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";

/** A press this long shows the whole name, ms. */
const LONG_PRESS_MS = 500;

export function LongName({
  name,
  full = name,
  className = "",
}: {
  name: string;
  full?: string;
  className?: string;
}) {
  const [shown, setShown] = useState(false);
  const timer = useRef<number | null>(null);
  // The click a long press ends with isn't a tap on whatever holds the name (a row, a button).
  const pressed = useRef(false);
  const start = useRef<[number, number]>([0, 0]);
  const stop = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => {
    if (!shown) return;
    const hide = () => setShown(false);
    // The next tap anywhere hides it (after this press's own events).
    const t = window.setTimeout(() => document.addEventListener("pointerdown", hide, { once: true }), 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("pointerdown", hide);
    };
  }, [shown]);
  useEffect(() => stop, []);
  return (
    <span
      className={`long-name ${className}`}
      title={full}
      onPointerDown={(e: PointerEvent) => {
        if (e.pointerType !== "touch") return;
        stop();
        pressed.current = false;
        start.current = [e.clientX, e.clientY];
        timer.current = window.setTimeout(() => {
          pressed.current = true;
          setShown(true);
        }, LONG_PRESS_MS);
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      // A finger always moves a little: only a real move (a scroll) cancels the press.
      onPointerMove={(e: PointerEvent) => {
        if (Math.hypot(e.clientX - start.current[0], e.clientY - start.current[1]) > 8) stop();
      }}
      onContextMenu={(e) => shown && e.preventDefault()}
      onClickCapture={(e: MouseEvent) => {
        if (!pressed.current) return;
        pressed.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <span className="long-name-text">{name}</span>
      {shown && (
        <span className="long-name-tip" role="tooltip">
          {full}
        </span>
      )}
    </span>
  );
}
