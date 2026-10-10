/**
 * Driveway (proto L1515–1532): entrance candidates, each routed alignment with its cost and elevation
 * profile, and the pioneer-track option. When no route fits the grade limit, the least-steep one, as suspect; and
 * since #88's follow-up, first, when the route kept to the parcel over the limit is the one scored.
 */
import { drivewayView, type RouteView } from "@/lib/report/driveway";
import { Facts, Note } from "./shared";
import type { BlockProps } from "./types";

export function Driveway({ result, variant }: BlockProps) {
  const v = drivewayView(result);
  if (!v) return null;
  return (
    <>
      {v.note && <p>{v.note}</p>}
      {v.entrances && <p className="tiny muted">{v.entrances}</p>}
      {v.overLimit && (
        <div className="site suspect">
          <div>
            <b className="font-semibold">{v.overLimit.title}</b>{" "}
            <span className="muted">{v.overLimit.from}</span>
            <span className="grade cost">{v.overLimit.cost}</span>
          </div>
          <Facts rows={v.overLimit.rows} />
          <ProfileChart path={v.overLimit.profile} />
          <GradeDetails details={v.overLimit.details} />
        </div>
      )}
      {v.routes.map((rt) => (
        <div key={rt.title} className="site">
          <div>
            <b className="font-semibold">{rt.title}</b> <span className="muted">{rt.from}</span>
            <span className="grade cost">{rt.cost}</span>
          </div>
          <Facts rows={rt.rows} />
          <ProfileChart path={rt.profile} />
          <GradeDetails details={rt.details} />
        </div>
      ))}
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

/** The grade over 15 and 60 m, and the ground-vs-road note, behind a disclosure (A4b, owner 2026-10-10). */
function GradeDetails({ details }: { details: RouteView["details"] }) {
  return (
    <details className="grade-details tiny">
      <summary>Grade over 15 and 60 m</summary>
      <Facts rows={details.rows} />
      <p className="muted">{details.note}</p>
    </details>
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
