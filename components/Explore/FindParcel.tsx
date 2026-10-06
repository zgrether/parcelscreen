"use client";
/**
 * The panel's "Find the parcel" section (proto L209–225): how to find a parcel, and the open parcel's facts.
 * The coordinates search and the tools are on the map (13e-2b); the split and combine details below move into
 * the toolbar in 13e-3.
 */
import { useState } from "react";
import { memberLabel } from "@/lib/geo/combine";
import { boundarySourceLabel, parcelFacts, type ParcelRecord } from "@/lib/geo/parcels";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";
import { sideName, type Side } from "@/lib/geo/split";
import { useExplore } from "./useExploreController";

export function FindParcel() {
  const ctl = useExplore();
  const { parcel, derived } = ctl;

  return (
    <section className="block">
      <h2>Find the parcel</h2>
      <p className="tiny muted">
        Pan the imagery to the spot you recognized in Google Earth (or paste its coordinates at the top of the
        map), then tap the lot to select it: zoom in until its outline shows. Tap it again to unselect. With
        no outline there, draw it from the toolbar.
      </p>
      <div className="mt-2">
        {parcel && <ParcelFacts parcel={parcel} />}
        {derived?.ok && derived.splitDropped && (
          <p className="tiny muted">The split no longer crosses the boundary, so it&apos;s left off.</p>
        )}
        {derived && !derived.ok && (
          <p className="tiny muted">
            These pieces don&apos;t make one boundary ({Math.round(derived.gapM)} m apart). Combine them again
            or close the parcel.
          </p>
        )}
      </div>
      <SplitPanel />
      <CombinePanel />
    </section>
  );
}

/** The loaded parcel's facts (proto L693–704). */
function ParcelFacts({ parcel }: { parcel: ParcelRecord }) {
  const f = parcelFacts(parcel.geo, parcel.props);
  return (
    <table className="facts">
      <tbody>
        <tr>
          <td>Acres (from boundary)</td>
          <td className="num">{f.acres.toFixed(2)}</td>
        </tr>
        {f.owner && (
          <tr>
            <td>Owner of record</td>
            <td>{f.owner}</td>
          </tr>
        )}
        {f.parcelId && (
          <tr>
            <td>Parcel ID</td>
            <td>{f.parcelId}</td>
          </tr>
        )}
        {f.address && (
          <tr>
            <td>Site address</td>
            <td>{f.address}</td>
          </tr>
        )}
        {f.county && (
          <tr>
            <td>County</td>
            <td>{f.county}</td>
          </tr>
        )}
        <tr>
          <td>Boundary source</td>
          <td>{boundarySourceLabel(parcel.source, parcel.props)}</td>
        </tr>
        {parcel.multiPart && (
          <tr>
            <td>Note</td>
            <td>Multi-part parcel: only the first part screened</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

/** Acreage each side of the split line, fit-to-acres, and which piece to keep (proto L616–622). */
function SplitPanel() {
  const ctl = useExplore();
  const { split } = ctl.state;
  const [target, setTarget] = useState("");
  const [which, setWhich] = useState<Side>(-1);
  const P = ctl.pieces;
  if (!split?.b || !P) return null;
  const nl = sideName(split.a, split.b, -1),
    nr = sideName(split.a, split.b, 1);
  return (
    <div className="mt-2">
      <table className="facts">
        <tbody>
          <tr>
            <td>{nl} side (yellow)</td>
            <td className="num">{P.leftAc.toFixed(2)} ac</td>
          </tr>
          <tr>
            <td>{nr} side (blue)</td>
            <td className="num">{P.rightAc.toFixed(2)} ac</td>
          </tr>
        </tbody>
      </table>
      <div className="row mt-1.5">
        <input
          type="number"
          className="field w-[120px]"
          step={0.01}
          placeholder="target acres"
          aria-label="Target acres"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
        <select
          className="field w-auto"
          aria-label="Side to fit"
          value={which}
          onChange={(e) => setWhich(+e.target.value as Side)}
        >
          <option value={-1}>{nl} side</option>
          <option value={1}>{nr} side</option>
        </select>
        <button className="btn secondary small" onClick={() => ctl.fitSplit(+target, which)}>
          Fit to acres
        </button>
      </div>
      <div className="row mt-1.5">
        <button className="btn small" onClick={() => ctl.choosePiece(-1)}>
          Use {nl} piece
        </button>
        <button className="btn small" onClick={() => ctl.choosePiece(1)}>
          Use {nr} piece
        </button>
        <button className="btn secondary small" onClick={ctl.cancelSplit}>
          Cancel
        </button>
      </div>
      <p className="tiny muted">
        Drag the line&apos;s end markers. Fit slides the line sideways until the chosen side hits the target
        acreage.
      </p>
    </div>
  );
}

/** The parcels picked to combine, their total, and whether they make one boundary (step 13b). */
function CombinePanel() {
  const ctl = useExplore();
  const members = ctl.state.combine;
  const r = ctl.combined;
  if (!members) return null;
  const { maxGapM } = SCREEN_CONSTANTS.combine;
  return (
    <div className="mt-2">
      {members.length > 0 && (
        <table className="facts">
          <tbody>
            {members.map((m, i) => (
              <tr key={i}>
                <td>{memberLabel(m, i)}</td>
                <td className="num">
                  {parcelFacts(m.geo, m.props).acres.toFixed(2)} ac{" "}
                  <button
                    className="text-ink-2 ml-1.5 cursor-pointer px-1"
                    aria-label={`Take ${memberLabel(m, i)} out`}
                    onClick={() => ctl.combineRemove(i)}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            {r?.ok && (
              <tr>
                <td>Together</td>
                <td className="num">{r.acres.toFixed(2)} ac</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
      <p className="tiny muted">
        {!r
          ? "Tap at least two parcels."
          : r.ok
            ? r.gapM > 0
              ? `They're ${Math.round(r.gapM)} m apart, so the boundary bridges the gap (a road right-of-way?). The strip, ${r.bridgeAcres.toFixed(2)} ac, isn't part of the listing; the acres above leave it out.`
              : "They make one boundary."
            : r.reason === "too far apart"
              ? `These are ${Math.round(r.gapM)} m apart, more than the ${maxGapM} m a road right-of-way would explain. Screen them separately.`
              : "These don't make a single boundary. Screen them separately."}
      </p>
      <div className="row mt-1.5">
        <button className="btn small" disabled={!r?.ok} onClick={ctl.applyCombination}>
          Use combined
        </button>
        <button className="btn secondary small" onClick={ctl.cancelCombine}>
          Cancel
        </button>
      </div>
    </div>
  );
}
