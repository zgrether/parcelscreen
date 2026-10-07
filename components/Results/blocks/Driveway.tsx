/**
 * Driveway (proto L1515–1532): entrance candidates, each routed alignment with its cost and elevation
 * profile, and the pioneer-track option. When no route fits the grade limit, the least-steep one, as suspect.
 */
import { drivewayView } from "@/lib/report/driveway";
import { Facts, Note } from "./shared";
import type { BlockProps } from "./types";

export function Driveway({ result, variant }: BlockProps) {
  const v = drivewayView(result);
  if (!v) return null;
  return (
    <>
      {v.note && <p>{v.note}</p>}
      {v.entrances && <p className="tiny muted">{v.entrances}</p>}
      {v.routes.map((rt) => (
        <div key={rt.title} className="site">
          <div>
            <b className="font-semibold">{rt.title}</b> <span className="muted">{rt.from}</span>
            <span className="grade cost">{rt.cost}</span>
          </div>
          <Facts rows={rt.rows} />
          <ProfileChart path={rt.profile} />
        </div>
      ))}
      {v.overLimit && (
        <div className="site suspect">
          <div>
            <b className="font-semibold">{v.overLimit.title}</b>{" "}
            <span className="muted">{v.overLimit.from}</span>
            <span className="grade cost">{v.overLimit.cost}</span>
          </div>
          <Facts rows={v.overLimit.rows} />
          <ProfileChart path={v.overLimit.profile} />
        </div>
      )}
      {v.track && (
        <div className="site">
          <b className="font-semibold">Pioneer 4×4 track first</b>
          <Facts rows={v.track.rows} />
          <p className="tiny muted">{v.track.note}</p>
        </div>
      )}
      <Note parts={v.caveat} variant={variant} />
    </>
  );
}

/** The route's elevation profile: a 360 × 100 SVG, no axes (proto L1527). viewBox-based, so print can size it. */
export function ProfileChart({ path }: { path: string }) {
  return (
    <svg
      className="horizon"
      viewBox="0 0 360 100"
      preserveAspectRatio="none"
      aria-label="Driveway profile"
      role="img"
    >
      <path d={path} fill="none" stroke="#e0c43c" strokeWidth={2} />
    </svg>
  );
}
