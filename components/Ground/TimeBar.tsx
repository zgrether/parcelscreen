"use client";
/**
 * The viewer's time bar (proto L280, buildTicks L1846, timeTick L1847): play/pause, a scrub across the span
 * (sunrise to sunset by day, sunset to sunrise by night), the hours along it, and the clock. Playing runs the
 * span in 24 seconds.
 */
export function TimeBar({
  f,
  ticks,
  marks = [],
  clock,
  label,
  playing,
  onPlay,
  onScrub,
}: {
  /** Where in the span, 0–1. */
  f: number;
  /** The hours along the bar, at their share of the span. */
  ticks: readonly { f: number; label: string }[];
  /** Moments marked above the bar: solar noon by day; the ends of twilight by night. */
  marks?: readonly { f: number; label: string; minor?: boolean }[];
  /** The time now, as shown at the end of the bar. */
  clock: string;
  /** The scrub's accessible name. */
  label: string;
  playing: boolean;
  onPlay(): void;
  onScrub(f: number): void;
}) {
  return (
    <div className="ground-time">
      <button className="ground-play" aria-label={playing ? "Pause" : "Play"} onClick={onPlay}>
        {playing ? "❚❚" : "▶"}
      </button>
      <div className="ground-scrub">
        {marks.length > 0 && (
          <div className="ground-marks" aria-hidden="true">
            {marks.map((m) => (
              <span key={m.label} data-minor={m.minor || undefined} style={{ left: `${m.f * 100}%` }}>
                {m.label}
              </span>
            ))}
          </div>
        )}
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(f * 1000)}
          aria-label={label}
          onChange={(e) => onScrub(+e.target.value / 1000)}
        />
        <div className="ground-ticks" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t.label + t.f} style={{ left: `${t.f * 100}%` }}>
              {t.label}
            </span>
          ))}
        </div>
      </div>
      <span className="ground-clock">{clock}</span>
    </div>
  );
}
