"use client";
/**
 * The ground viewer (step 17a; plan phase-0-17-ground.md §2): standing at the evaluation point, the skyline
 * the report's sun hours come from, the canopy allowance, and the sun's path for any date with each hour
 * marked clear or blocked. Full screen on phones, a large modal on desktop; Esc or × closes it.
 *
 * Like the prototype's scene 4 (proto L1863), the view follows the sun through the day; dragging looks
 * elsewhere (the offset is kept as the sun moves). Everything comes from the shown result (lib/render/ground).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  dateLabel,
  dayHours,
  groundDate,
  halfDay,
  hourMarks,
  isClear,
  PRESETS,
  sunAt,
  sunPath,
  todayIn,
  type GroundInputs,
} from "@/lib/render/ground";
import type { PartialScreenResult } from "@/lib/screen/types";
import { drawDay } from "./drawGround";
import { TimeBar } from "./TimeBar";

/** The day plays in this many seconds, sunrise to sunset (proto timeTick, L1847). */
const DAY_SECONDS = 24;
const COMPASS16 = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
];
const compassOf = (a: number) => COMPASS16[Math.round((((a % 360) + 360) % 360) / 22.5) % 16]!;

export function GroundViewer({
  result,
  inputs,
  timeZone,
  close,
}: {
  result: PartialScreenResult;
  inputs: GroundInputs;
  timeZone: string;
  close(): void;
}) {
  const year = todayIn(timeZone).slice(0, 4);
  const [iso, setIso] = useState(`${year}-12-21`);
  const date = groundDate(iso) ?? groundDate(`${year}-12-21`)!;
  const { lat, profile, canopyDeg, label } = inputs;

  const lim = halfDay(lat, date.doy);
  // The time as a share of daylight, 0 at sunrise and 1 at sunset, so a new date keeps the moment.
  const [f, setF] = useState(0.2);
  const H = -lim + 2 * lim * f;
  const [playing, setPlaying] = useState(true);
  // Where the eye looks, relative to the sun (heading) and above the default (pitch).
  const [look, setLook] = useState({ dAz: 0, dAlt: 0 });

  const path = useMemo(() => sunPath(lat, date.doy), [lat, date.doy]);
  const marks = useMemo(
    () => hourMarks(lat, date.doy, profile, canopyDeg),
    [lat, date.doy, profile, canopyDeg],
  );
  const hours = useMemo(() => dayHours(result, date.doy), [result, date.doy]);

  // Playing: sunrise → sunset in DAY_SECONDS, then round again.
  useEffect(() => {
    if (!playing) return;
    let raf = 0,
      last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setF((x) => (x + dt / DAY_SECONDS) % 1);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  const sun = sunAt(lat, date.doy, H);
  const clear = isClear(lat, date.doy, H, profile, canopyDeg);
  const heading = (((sun.az + look.dAz) % 360) + 360) % 360;

  // The canvas, sized to its box at the device's pixel ratio.
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const hfov = size.w && size.h && size.w < size.h ? 70 : 90;
  const vfov =
    size.w && size.h
      ? (2 * Math.atan(Math.tan((hfov / 2) * (Math.PI / 180)) * (size.h / size.w)) * 180) / Math.PI
      : 50;
  // The skyline stays in the frame: the view rises with the sun (the prototype's 6° for a low winter sun,
  // proto eyeLook) only until the horizon nears the bottom edge. A midday summer sun can sit above the frame;
  // dragging up looks at it.
  const pitch = Math.max(
    -5,
    Math.min(60, Math.max(6, Math.min(sun.alt - vfov * 0.3, vfov / 2 - 4)) + look.dAlt),
  );
  useEffect(() => {
    const c = canvas.current;
    if (!c || !size.w || !size.h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(size.w * dpr);
    c.height = Math.round(size.h * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawDay(ctx, {
      view: { heading, pitch, width: size.w, height: size.h, hfov },
      profile,
      canopyDeg,
      path,
      marks,
      sun,
    });
  });

  // Drag to look around: the angle under the pointer follows it.
  const drag = useRef<{ x: number; y: number } | null>(null);
  const onDown = useCallback((e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY };
    (e.target as Element).setPointerCapture(e.pointerId);
  }, []);
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || !size.w) return;
    const k = hfov / size.w;
    const dx = e.clientX - drag.current.x,
      dy = e.clientY - drag.current.y;
    drag.current = { x: e.clientX, y: e.clientY };
    setLook((l) => ({ dAz: l.dAz - dx * k, dAlt: Math.max(-40, Math.min(50, l.dAlt + dy * k)) }));
  };
  const onUp = () => (drag.current = null);

  const today = todayIn(timeZone);
  const presets = [
    ...PRESETS.map((p) => ({ key: p.key, label: p.label, iso: `${year}-${p.monthDay}` })),
    { key: "today", label: "Today", iso: today },
  ];
  const long = dateLabel(date.iso, true);

  return createPortal(
    <div className="ground-layer">
      <div className="ground-scrim" onClick={close} />
      <section className="ground" role="dialog" aria-modal="true" aria-label={`Standing at ${label}`}>
        <header className="ground-head">
          <div className="ground-title">
            <b>Standing at {label}</b>
            {hours && (
              <span className="ground-hours">
                {long}: {hours.directH.toFixed(1)} of {hours.daylightH.toFixed(1)} daylight hours are direct
                sun
                {hours.stored ? "" : " (from this screen's skyline)"}.
              </span>
            )}
          </div>
          <button className="ground-close" aria-label="Close the viewer" onClick={close}>
            ×
          </button>
        </header>
        <div className="ground-dates" role="group" aria-label="Date">
          {presets.map((p) => (
            <button
              key={p.key}
              className={p.iso === date.iso ? "on" : ""}
              aria-pressed={p.iso === date.iso}
              onClick={() => setIso(p.iso)}
            >
              {p.label}
            </button>
          ))}
          <input
            type="date"
            aria-label="Any date"
            value={date.iso}
            onChange={(e) => e.target.value && groundDate(e.target.value) && setIso(e.target.value)}
          />
        </div>
        <div
          ref={box}
          className="ground-stage"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <canvas ref={canvas} aria-label="The skyline and the sun's path from this point" />
          <div className="ground-heading" aria-live="off">
            {compassOf(heading)} {Math.round(heading)}° · {clear ? "direct sun" : "sun behind the ridge"}
          </div>
        </div>
        <TimeBar
          H={H}
          halfDay={lim}
          playing={playing}
          onPlay={() => setPlaying((p) => !p)}
          onScrub={(h) => {
            setPlaying(false);
            setF(lim > 0 ? (h + lim) / (2 * lim) : 0.5);
          }}
        />
        <p className="ground-caption tiny">
          Eye height at the selected site. The gold arc is the sun&apos;s path on {long}. Each hour has a tick
          from the skyline up to the sun — red where the sun is behind the ridge at that hour. Trees are not
          shown. The band above the skyline is the {canopyDeg}° tree-canopy allowance the report counts as
          blocking; the skyline is the screen&apos;s own horizon (bare earth, every 5°). Drag to look around.
        </p>
      </section>
    </div>,
    document.body,
  );
}
