"use client";
/**
 * Map layers › Motor-vehicle routes (roadmap step 16, docs/plans/step-16-public-lands.md §6): the toggle, then (while
 * it's on) a line swatch for each class and a dashed one for seasonal, the MVUM's own caution, and the note on
 * dispersed camping, both linking to the MVUM page of the forest in view (else the Forest Service's). Remembered per
 * device (ps.mvum).
 */
import { ROUTE_CASING, ROUTE_CLASSES, ROUTE_COLOR, MVUM_WORDS as W } from "@/lib/mvum/card";
import { useMvumPageInView } from "./MvumLayer";
import { setMapLayerPrefs, useMapLayerPrefs } from "./useMapLayerPrefs";

/** A route as the map draws it: the class's colour over the dark casing, dashed when seasonal. */
const Line = ({ color, dash }: { color: string; dash?: string }) => (
  <svg className="mk-line pl-swatch" width="28" height="12" viewBox="0 0 28 12" aria-hidden="true">
    <line x1="2" y1="6" x2="26" y2="6" stroke={ROUTE_CASING} strokeOpacity="0.6" strokeWidth="5" />
    <line x1="2" y1="6" x2="26" y2="6" stroke={color} strokeWidth="2.5" strokeDasharray={dash} />
  </svg>
);

export function MvumControls() {
  const { mvum } = useMapLayerPrefs();
  const page = useMvumPageInView();
  const check = (
    <a className="mvum-link" href={page} target="_blank" rel="noopener noreferrer">
      {W.check}
    </a>
  );
  return (
    <>
      <button className="tc-toggle" aria-pressed={mvum} onClick={() => setMapLayerPrefs({ mvum: !mvum })}>
        {W.toggle}
      </button>
      {mvum && (
        <div className="lidar-controls mvum-controls">
          <ul className="lidar-bands pl-key" aria-label="Motor-vehicle routes, by what's allowed">
            {ROUTE_CLASSES.map((c) => (
              <li key={c}>
                <Line color={ROUTE_COLOR[c]} />
                {W.legend[c]}
              </li>
            ))}
            <li>
              <Line color="#9aa29c" dash="4 3" />
              {W.seasonal}
            </li>
          </ul>
          <p className="tiny muted lidar-info">
            {W.info} {check} {W.beforeDriving}
          </p>
          <p className="tiny muted lidar-info">
            {W.dispersed} {check}.
          </p>
        </div>
      )}
    </>
  );
}
