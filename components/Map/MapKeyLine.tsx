"use client";
/**
 * The map's key line (UX part 2 PR 3b2; the audit's P-2): under the map while a graded parcel is open, naming what it
 * draws, each beside a small copy of how it looks ("1 Best homesite · The app's driveway · Horizon fan"), then "All map
 * marks", which opens Map layers at the full key (MapKey) with its Every pin toggle. Hidden while a tool is open, and on
 * a phone with the sheet raised, as the map's other notes are (B-7).
 */
import { useExplore } from "@/components/Explore/useExploreController";
import { useScreenItContext } from "@/components/Results/ScreenItContext";
import { ALL_MARKS, KEY_WORDS, keyEntries, type KeyEntry } from "@/lib/render/keyLine";
import { requestKeyOpen } from "./MapKey";
import { useOverlayPrefs } from "./results/useOverlayPrefs";

const SWATCH: Record<KeyEntry, React.ReactNode> = {
  best: (
    <span className="sitepin top mk-pin" aria-hidden="true">
      1
    </span>
  ),
  driveway: <span className="mkl-line route" aria-hidden="true" />,
  yourRoute: <span className="mkl-line route" aria-hidden="true" />,
  fan: <span className="mkl-line fan" aria-hidden="true" />,
  allPins: (
    <span className="sitepin shelf mk-pin" aria-hidden="true">
      S
    </span>
  ),
};

export function MapKeyLine() {
  const s = useScreenItContext();
  const ctl = useExplore();
  const on = useOverlayPrefs();
  const tool = ctl.state.mode !== null || ctl.state.split !== null;
  const r = s && !s.stale && !tool ? s.display : null;
  if (!s || !r) return null;
  const h = r.house;
  const house = !!h && !("outside" in h);
  const d = r.driveway;
  const entries = keyEntries({
    bestPin: on.pins && !house && !!s.card?.sites.length,
    route: on.driveway && !!d && (d.routes.length > 0 || !!d.overLimit),
    yourRoute: !!ctl.state.store.open?.drivewayLine,
    fan: on.fan && !!s.view,
    allPins: on.pins && on.allPins,
  });
  return (
    <div className="map-key-line" role="note" aria-label="What the map shows">
      {entries.map((e) => (
        <span key={e} className="mkl-entry">
          {SWATCH[e]}
          {KEY_WORDS[e]}
        </span>
      ))}
      <button
        className="link-btn mkl-all"
        onClick={() => {
          requestKeyOpen();
          ctl.setMapPanel(true);
        }}
      >
        {ALL_MARKS}
      </button>
    </div>
  );
}
