"use client";
/** The panel's "Find the parcel" section (proto L209–225): coordinates, the tool buttons, and what was found. */
import { useState } from "react";
import { boundarySourceLabel, parcelFacts, type ParcelRecord } from "@/lib/geo/parcels";
import { sideName, type Side } from "@/lib/geo/split";
import { useExplore } from "./useExploreController";

export function FindParcel() {
  const ctl = useExplore();
  const { mode, parcel, noParcel } = ctl.state;
  const [coords, setCoords] = useState("");

  return (
    <section className="block">
      <h2>Find the parcel</h2>
      <p className="tiny muted">
        Pan the imagery to the spot you recognized in Google Earth, then tap the lot to load its recorded
        boundary. If parcel lines aren&apos;t available there, draw it.
      </p>
      <div className="row">
        <input
          type="text"
          className="field min-w-[200px] flex-1"
          placeholder="Paste lat, lon (e.g. 36.6293, -81.3542)"
          aria-label="Latitude, longitude"
          value={coords}
          onChange={(e) => setCoords(e.target.value)}
        />
        <button className="btn small" onClick={() => ctl.goTo(coords)}>
          Go
        </button>
      </div>
      <div className="row mt-2">
        <button className="btn secondary small" onClick={() => ctl.setMode("pick")}>
          Tap a parcel
        </button>
        <button className="btn secondary small" onClick={ctl.startDraw}>
          Draw boundary
        </button>
        <button className="btn secondary small" onClick={() => ctl.setMode("house")}>
          Mark existing house
        </button>
        <button className="btn secondary small" disabled={!parcel} onClick={ctl.startSplit}>
          Split parcel
        </button>
        {mode === "draw" && (
          <button className="btn small" onClick={ctl.finishDraw}>
            Finish boundary
          </button>
        )}
        <button className="btn secondary small" onClick={ctl.clear}>
          Clear
        </button>
      </div>
      <div className="mt-2">
        {noParcel ? <NoParcel report={noParcel.report} /> : parcel ? <ParcelFacts parcel={parcel} /> : null}
      </div>
      <SplitPanel />
    </section>
  );
}

/** What each parcel service said, and the square fallback (proto L675–683). */
function NoParcel({ report }: { report: string[] }) {
  const ctl = useExplore();
  const [acres, setAcres] = useState("5");
  return (
    <div>
      <p className="tiny muted">
        Parcel services cover North Carolina, Virginia and Tennessee. What each one said:
      </p>
      <ul className="plain tiny muted">
        {report.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
      <p className="tiny">No boundary? Screen a square centered where you tapped instead:</p>
      <div className="row">
        <input
          type="number"
          className="field w-[90px]"
          aria-label="Square size in acres"
          min={0.25}
          step={0.25}
          value={acres}
          onChange={(e) => setAcres(e.target.value)}
        />
        acres
        <button className="btn small" onClick={() => ctl.squareHere(Math.max(0.25, +acres || 5))}>
          Use a square here
        </button>
      </div>
    </div>
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
