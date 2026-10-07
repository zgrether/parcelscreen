"use client";
/**
 * The viewer's time bar (proto L280, buildTicks L1846, timeTick L1847): play/pause, a scrub from sunrise to
 * sunset, the whole solar hours along it, and the solar clock. Playing runs the day in 24 seconds.
 */
import { fmtSolar, hourLabel } from "@/lib/render/ground";

export function TimeBar({
  H,
  halfDay,
  playing,
  onPlay,
  onScrub,
}: {
  /** Hour angle now, degrees from solar noon. */
  H: number;
  /** Sunrise at −halfDay, sunset at +halfDay. */
  halfDay: number;
  playing: boolean;
  onPlay(): void;
  onScrub(H: number): void;
}) {
  const first = Math.ceil(12 - halfDay / 15),
    last = Math.floor(12 + halfDay / 15);
  const ticks = [];
  for (let hr = first; hr <= last; hr++) ticks.push({ hr, f: ((hr - 12) * 15 + halfDay) / (2 * halfDay) });
  const f = halfDay > 0 ? (H + halfDay) / (2 * halfDay) : 0.5;
  return (
    <div className="ground-time">
      <button className="ground-play" aria-label={playing ? "Pause" : "Play"} onClick={onPlay}>
        {playing ? "❚❚" : "▶"}
      </button>
      <div className="ground-scrub">
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(f * 1000)}
          aria-label="Time of day"
          onChange={(e) => onScrub(-halfDay + (2 * halfDay * +e.target.value) / 1000)}
        />
        <div className="ground-ticks" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t.hr} style={{ left: `${t.f * 100}%` }}>
              {hourLabel(t.hr).replace(" ", "")}
            </span>
          ))}
        </div>
      </div>
      <span className="ground-clock">{fmtSolar(H)} solar</span>
    </div>
  );
}
