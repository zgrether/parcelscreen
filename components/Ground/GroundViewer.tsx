"use client";
/**
 * The ground viewer (step 17; plan phase-0-17-ground.md §2, §9): standing at the evaluation point, on a
 * cylindrical panorama (azimuth across, altitude up). Full screen on phones, a large modal on desktop; Esc or ×
 * closes it.
 *
 * - Day (17a): the skyline the report's sun hours come from, the canopy allowance, and the sun's path for any
 *   date with each hour marked clear or blocked. The view follows the sun, as the prototype's scene 4 did
 *   (proto L1863); dragging looks elsewhere.
 * - Night (17b): the Milky Way by sidereal time, faded with the sky's brightness, the atlas's haze and light
 *   domes, and the stars, sunset to sunrise in civil time (UserConfig.timeZone). The prototype's scene 5
 *   (proto L1865). The view starts toward the core; drag to look round.
 *
 * Everything comes from the shown result (lib/render/ground, lib/render/night), plus the ridges by distance from
 * the screen's own 30 m DEM, fetched on open (useRidges).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  dateLabel,
  dayHours,
  groundDate,
  halfDay,
  clockHours,
  hOfInstant,
  hourMarksAt,
  instantOfH,
  isClear,
  lowScale,
  PRESETS,
  skylineAt,
  sunAt,
  sunPath,
  todayIn,
  type AzAlt,
  type GroundInputs,
} from "@/lib/render/ground";
import {
  clockIn,
  compassOf,
  coreLabel,
  domesOf,
  galaxyAt,
  hazeOf,
  milkyWay,
  milkyWayVisibility,
  nightCaption,
  nightInputs,
  nightSpan,
  nightTicks,
  twilightMarks,
} from "@/lib/render/night";
import type { Endpoints, PartialScreenResult } from "@/lib/screen/types";
import type { Feature, Polygon } from "geojson";
import { solarNoon, sunAltitude, sunrise, sunset } from "@/lib/render/sunclock";
import { drawDay } from "./drawGround";
import { drawNight } from "./drawNight";
import { TimeBar } from "./TimeBar";
import { useRidges } from "./useRidges";

/** The day (sunrise → sunset) or the night (sunset → sunrise) plays in this many seconds (proto timeTick). */
const SPAN_SECONDS = 24;

/** Cosmetic stars, as the prototype's (proto L1788): fixed for the session, fewer and dimmer under haze. */
function makeStars(haze: number): (AzAlt & { b: number })[] {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const n = Math.round(2500 * (1 - 0.9 * haze));
  return Array.from({ length: n }, () => ({
    az: rnd() * 360,
    alt: (Math.asin(rnd()) * 180) / Math.PI,
    b: (0.35 + rnd() ** 3 * 0.65) * (1 - 0.6 * haze),
  }));
}

export function GroundViewer({
  result,
  inputs,
  parcel,
  endpoints,
  timeZone,
  close,
}: {
  result: PartialScreenResult;
  inputs: GroundInputs;
  /** The open parcel, for the screen's wide-DEM request (the ridges by distance); null without one. */
  parcel: Feature<Polygon> | null;
  endpoints: Endpoints;
  timeZone: string;
  close(): void;
}) {
  const year = todayIn(timeZone).slice(0, 4);
  const [iso, setIso] = useState(`${year}-12-21`);
  const date = groundDate(iso) ?? groundDate(`${year}-12-21`)!;
  const { lat, lon, profile, canopyDeg, label } = inputs;
  const ridges = useRidges(parcel, [lat, lon], endpoints);
  const night = useMemo(() => nightInputs(result), [result]);
  const [mode, setMode] = useState<"day" | "night">("day");
  const isNight = mode === "night" && night !== null;

  // The time as a share of the span (day: sunrise → sunset; night: sunset → sunrise), so a new date keeps
  // the moment.
  const [fDay, setFDay] = useState(0.2);
  const [fNight, setFNight] = useState(0.3);
  const [playing, setPlaying] = useState(true);
  // Where the eye looks: by day relative to the sun, by night relative to the core.
  const [dAz, setDAz] = useState(0);

  // Playing: the span in SPAN_SECONDS, then round again.
  useEffect(() => {
    if (!playing) return;
    let raf = 0,
      last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      (isNight ? setFNight : setFDay)((x) => (x + dt / SPAN_SECONDS) % 1);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, isNight]);

  // Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  // ---------- the day ----------
  const lim = halfDay(lat, date.doy);
  const H = -lim + 2 * lim * fDay;
  const path = useMemo(() => sunPath(lat, date.doy), [lat, date.doy]);
  // Clock time (owner, before #64): the day's whole hours in the Settings time zone, from the date's solar noon
  // with the equation of time; the clear/blocked rule at each is the report's.
  const noon = useMemo(() => solarNoon(date.iso, lon), [date.iso, lon]);
  const clockHrs = useMemo(
    () =>
      clockHours(instantOfH(noon, -lim), instantOfH(noon, lim), timeZone).map((h) => ({
        H: hOfInstant(noon, h.t),
        hour: h.hour,
        label: h.label,
      })),
    [noon, lim, timeZone],
  );
  const marks = useMemo(
    () => hourMarksAt(lat, date.doy, profile, canopyDeg, clockHrs),
    [lat, date.doy, profile, canopyDeg, clockHrs],
  );
  const hours = useMemo(() => dayHours(result, date.doy), [result, date.doy]);
  const sun = sunAt(lat, date.doy, H);
  const clear = isClear(lat, date.doy, H, profile, canopyDeg);
  const rise = sunrise(date.iso, lat, lon),
    set = sunset(date.iso, lat, lon);

  // ---------- the night ----------
  const span = useMemo(() => nightSpan(date.iso, lat, lon), [date.iso, lat, lon]);
  const t = span.start + (span.end - span.start) * fNight;
  const galaxy = galaxyAt(lat, lon, t);
  const band = useMemo(() => milkyWay(galaxy.core, galaxy.pole), [galaxy.core, galaxy.pole]);
  const haze = night ? hazeOf(night.ratio) : 0;
  const stars = useMemo(() => makeStars(haze), [haze]);
  const domes = useMemo(() => (night ? domesOf(night.domes) : []), [night]);
  const mwVis = night ? milkyWayVisibility(night.mag) : 0;
  const sunAltNow = sunAltitude(t, lat, lon);
  const twilight = Math.max(0, Math.min(1, (sunAltNow + 18) / 18));

  const heading = ((((isNight ? galaxy.core.az : sun.az) + dAz) % 360) + 360) % 360;

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
  // Azimuth at the same pixels per degree as the altitude scale's linear part (−5° to 30°), so the land keeps
  // its true proportions; the whole sky to 90° is always in frame (lib/render/ground altToY).
  const kx = size.h ? lowScale(size.h) : 10;
  useEffect(() => {
    const c = canvas.current;
    if (!c || !size.w || !size.h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(size.w * dpr);
    c.height = Math.round(size.h * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const view = { heading, width: size.w, height: size.h, kx };
    const shaded = ridges.state === "ready" ? ridges.bands : null;
    if (isNight)
      drawNight(ctx, {
        view,
        profile,
        canopyDeg,
        ridges: shaded,
        twilight,
        haze,
        domes,
        stars,
        band,
        mwVis,
        core: galaxy.core,
        coreLabel: coreLabel(galaxy.core, (az) => skylineAt(profile, az), mwVis),
      });
    else drawDay(ctx, { view, profile, canopyDeg, path, marks, sun, ridges: shaded });
  });

  // Drag to look around, round all 360°: the azimuth under the pointer follows it.
  const drag = useRef<number | null>(null);
  const onDown = useCallback((e: React.PointerEvent) => {
    drag.current = e.clientX;
    (e.target as Element).setPointerCapture(e.pointerId);
  }, []);
  const onMove = (e: React.PointerEvent) => {
    if (drag.current === null) return;
    const dx = e.clientX - drag.current;
    drag.current = e.clientX;
    setDAz((d) => d - dx / kx);
  };
  const onUp = () => (drag.current = null);
  const switchMode = (m: "day" | "night") => {
    setMode(m);
    setDAz(0);
    setPlaying(true);
  };

  const today = todayIn(timeZone);
  const presets = [
    ...PRESETS.map((p) => ({ key: p.key, label: p.label, iso: `${year}-${p.monthDay}` })),
    { key: "today", label: "Today", iso: today },
  ];
  const long = dateLabel(date.iso, true);
  const ridgeAt = (az: number) => skylineAt(profile, az);
  const nightText = night ? nightCaption(night, galaxy.core, ridgeAt, canopyDeg) : "";

  return createPortal(
    <div className="ground-layer">
      <div className="ground-scrim" onClick={close} />
      <section className="ground" role="dialog" aria-modal="true" aria-label={`Standing at ${label}`}>
        <header className="ground-head">
          <div className="ground-title">
            <b>Standing at {label}</b>
            {isNight ? (
              <span className="ground-hours">
                The night of {long}: sunset {clockIn(timeZone, span.start)}, sunrise{" "}
                {clockIn(timeZone, span.end)}.
              </span>
            ) : (
              hours && (
                <span className="ground-hours">
                  {long}: {hours.directH.toFixed(1)} of {hours.daylightH.toFixed(1)} daylight hours are direct
                  sun
                  {hours.stored ? "" : " (from this screen's skyline)"}.
                  {rise !== null && set !== null && (
                    <>
                      {" "}
                      Sunrise {clockIn(timeZone, rise)}, sunset {clockIn(timeZone, set)}.
                    </>
                  )}
                </span>
              )
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
          {night && (
            <span className="ground-mode" role="group" aria-label="Day or night">
              <button
                className={mode === "day" ? "on" : ""}
                aria-pressed={mode === "day"}
                onClick={() => switchMode("day")}
              >
                Day
              </button>
              <button
                className={mode === "night" ? "on" : ""}
                aria-pressed={mode === "night"}
                onClick={() => switchMode("night")}
              >
                Night
              </button>
            </span>
          )}
        </div>
        <div
          ref={box}
          className={`ground-stage${isNight ? " night" : ""}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <canvas
            ref={canvas}
            aria-label={
              isNight ? "The night sky from this point" : "The skyline and the sun's path from this point"
            }
          />
          {ridges.state !== "ready" && (
            <div className="ground-status">
              {ridges.state === "loading"
                ? "Shading the ridges…"
                : "Ridge shading unavailable: the skyline alone."}
            </div>
          )}
          <div className="ground-heading" aria-live="off">
            {compassOf(heading)} {Math.round(heading)}°
            {isNight
              ? galaxy.core.alt > 0
                ? ` · core ${galaxy.core.alt.toFixed(0)}° up`
                : " · core below the horizon"
              : ` · ${clear ? "direct sun" : "sun behind the ridge"}`}
          </div>
        </div>
        {isNight ? (
          <TimeBar
            f={fNight}
            ticks={nightTicks(span, timeZone)}
            marks={twilightMarks(span, date.iso, lat, lon)}
            clock={clockIn(timeZone, t)}
            label="Time of night"
            playing={playing}
            onPlay={() => setPlaying((p) => !p)}
            onScrub={(f) => {
              setPlaying(false);
              setFNight(f);
            }}
          />
        ) : (
          <TimeBar
            f={fDay}
            ticks={clockHrs.map((h) => ({ f: (h.H + lim) / (2 * lim), label: h.label.replace(" ", "") }))}
            marks={[{ f: 0.5, label: "solar noon" }]}
            clock={clockIn(timeZone, instantOfH(noon, H))}
            label="Time of day"
            playing={playing}
            onPlay={() => setPlaying((p) => !p)}
            onScrub={(f) => {
              setPlaying(false);
              setFDay(f);
            }}
          />
        )}
        {isNight ? (
          <p className="ground-caption tiny">
            {nightText}
            {twilight > 0.05 &&
              ` The sun is ${Math.max(0, -sunAltNow).toFixed(0)}° below the horizon: twilight still lifts the sky.`}{" "}
            Stars are illustrative. Moon not shown — check the moon phase for your date. Drag to look around.
            <br />
            Shaded ridges are the full 30 m terrain; the white line is the report&apos;s 5° skyline, which can
            miss narrow peaks between samples.
          </p>
        ) : (
          <p className="ground-caption tiny">
            Eye height at the selected site. The gold arc is the sun&apos;s path on {long}. Each hour has a
            tick from the skyline up to the sun — red where the sun is behind the ridge at that hour. Trees
            are not shown. The dashed line is the {canopyDeg}° tree-canopy allowance the report counts as
            blocking. Ridges are shaded by distance (0–½, ½–1½, 1½–3 and 3–6 km). Above 30° the altitude scale
            is compressed. Drag to look around.
            <br />
            Shaded ridges are the full 30 m terrain; the white line is the report&apos;s 5° skyline, which can
            miss narrow peaks between samples.
          </p>
        )}
      </section>
    </div>,
    document.body,
  );
}
