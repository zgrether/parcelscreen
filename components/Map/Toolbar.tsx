"use client";
/**
 * The parcel toolbar on the map (13e): always one line.
 *   nothing open:  "Tap a parcel to select it or Draw a custom parcel" (no rule: the "or" separates them)
 *   a parcel open: "Add: Parcel · Custom · ⌂ │ Split │ 🗑   12.34 ac ▾" (the acres open the Info panel)
 *   a tool in use: what to do next, and its controls (Finish, Done, Keep…, Cancel)
 * The trash (built parcels only) asks inline before deleting. A tap refused because a built parcel is open
 * shows a brief note above the bar.
 */
import { area, length, lineString, polygon } from "@turf/turf";
import { useState, type ReactNode } from "react";
import { isBuilt } from "@/lib/client/parcelStore";
import { M2FT, M2_PER_ACRE } from "@/lib/geo/types";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";
import { useExplore, type ExploreController } from "@/components/Explore/useExploreController";

const ac = (n: number) => n.toFixed(2);

function Btn({
  kind = "tool",
  onClick,
  disabled,
  label,
  title,
  children,
}: {
  kind?: "tool" | "go" | "quiet" | "danger" | "icon";
  onClick: () => void;
  disabled?: boolean;
  label?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      className={`tb-btn ${kind}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={title}
    >
      {children}
    </button>
  );
}
const Sep = () => <span className="tb-sep" aria-hidden="true" />;
const Status = ({ children, bad }: { children: ReactNode; bad?: boolean }) => (
  <span className={`tb-status${bad ? " bad" : ""}`}>{children}</span>
);

const HouseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path
      d="M2.5 8.5 9 3l6.5 5.5M4.5 7v7.5h3.5v-4h2v4h3.5V7"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  </svg>
);
const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <path
      d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
  </svg>
);

export function Toolbar() {
  const ctl = useExplore();
  const open = ctl.state.store.open;
  return (
    <>
      {/* Keyed by the open parcel so a pending delete confirmation never carries over to another. */}
      <Bar key={open?.key ?? (open ? "plain" : "none")} ctl={ctl} />
    </>
  );
}

function Bar({ ctl }: { ctl: ExploreController }) {
  const { mode, store } = ctl.state;
  const open = store.open;
  const [confirming, setConfirming] = useState(false);
  const body = barBody(ctl, confirming, setConfirming);
  return (
    <div
      className="toolbar"
      role="toolbar"
      aria-label="Parcel tools"
      data-mode={mode ?? (open ? "open" : "idle")}
    >
      {body}
    </div>
  );
}

function barBody(
  ctl: ExploreController,
  confirming: boolean,
  setConfirming: (b: boolean) => void,
): ReactNode {
  const { mode, store, draft, split, combine } = ctl.state;
  const open = store.open;
  const cancel = (
    <Btn kind="quiet" onClick={ctl.cancelTool}>
      Cancel
    </Btn>
  );

  if (mode === "draw") {
    const n = draft.length;
    const acres =
      n >= 3
        ? area(polygon([[...draft.map(([lat, lon]) => [lon, lat]), [draft[0]![1], draft[0]![0]]]])) /
          M2_PER_ACRE
        : null;
    return (
      <>
        <Status>
          {n === 0 ? (
            open ? (
              <>
                Tap each corner of the shape to add
                <span className="sub long"> · corners snap to the parcel</span>
              </>
            ) : (
              "Tap each corner of the custom parcel"
            )
          ) : (
            <>
              <b>
                {n} corner{n > 1 ? "s" : ""}
              </b>
              {acres !== null && <span className="sub"> · {ac(acres)} ac</span>}
            </>
          )}
        </Status>
        <Btn kind="quiet" onClick={ctl.undoCorner} disabled={n === 0}>
          Undo corner
        </Btn>
        <Btn kind="go" onClick={ctl.finishDraw} disabled={n < 3}>
          Finish
        </Btn>
        {cancel}
      </>
    );
  }
  if (mode === "track" || mode === "easement") {
    // Follow-up 34: a line known from a deed, plat, survey or visit, kept with the parcel.
    const n = draft.length;
    const ft =
      n >= 2 ? length(lineString(draft.map(([lat, lon]) => [lon, lat])), { units: "meters" }) * M2FT : 0;
    return (
      <>
        <span className="tb-seg" role="group" aria-label="What the line is">
          {(["track", "easement"] as const).map((k) => (
            <button key={k} aria-pressed={mode === k} onClick={() => ctl.startLine(k)} disabled={n > 0}>
              {k === "track" ? "Track" : "Easement"}
            </button>
          ))}
        </span>
        <Status>
          {n === 0 ? (
            mode === "track" ? (
              "Tap along an existing drive or trail"
            ) : (
              "Tap along the easement or right-of-way"
            )
          ) : (
            <>
              <b>
                {n} point{n > 1 ? "s" : ""}
              </b>
              {n >= 2 && <span className="sub"> · {Math.round(ft).toLocaleString()} ft</span>}
            </>
          )}
        </Status>
        <Btn kind="quiet" onClick={ctl.undoCorner} disabled={n === 0}>
          Undo point
        </Btn>
        <Btn kind="go" onClick={ctl.finishLine} disabled={n < 2}>
          Finish
        </Btn>
        {cancel}
      </>
    );
  }
  if (mode === "house")
    return (
      <>
        <Status>Tap where the house stands</Status>
        {cancel}
      </>
    );
  if (mode === "split" || split) {
    if (!split || !split.b)
      return (
        <>
          <Status>{split ? "Tap the other end of the cut" : "Tap two points to draw the cut"}</Status>
          {cancel}
        </>
      );
    // Each piece's acres are on the map, on the piece; tapping the piece keeps it.
    const cuts = !!ctl.pieces?.left && !!ctl.pieces.right;
    return (
      <>
        {cuts ? (
          <Status>
            <b>Tap the piece to keep</b>
            <span className="sub"> · drag the ends to adjust</span>
          </Status>
        ) : (
          <Status bad>The cut misses the parcel · drag its ends across it</Status>
        )}
        {cancel}
      </>
    );
  }
  if (mode === "combine") {
    const n = combine?.length ?? 0,
      r = ctl.combined;
    const status =
      n === 0 ? (
        <Status>Tap parcels to add them; tap one again to take it out</Status>
      ) : r && !r.ok ? (
        <Status bad>
          {Math.round(r.gapM)} m apart, more than the {SCREEN_CONSTANTS.combine.maxGapM} m a road would
          explain
        </Status>
      ) : (
        <Status>
          <b>
            {n} parcel{n > 1 ? "s" : ""}
          </b>
          {r?.ok && <> · {ac(r.acres)} ac</>}
          {r?.ok && r.gapM > 0 && (
            <span className="sub">
              {" "}
              · bridges a {Math.round(r.gapM)} m gap
              <span className="long"> (the strip isn&apos;t counted)</span>
            </span>
          )}
        </Status>
      );
    return (
      <>
        {status}
        <Btn kind="go" onClick={ctl.applyCombination} disabled={!r?.ok}>
          Done
        </Btn>
        {cancel}
      </>
    );
  }

  if (!open)
    return (
      <>
        <Status>Tap a parcel to select it</Status>
        <span className="tb-lbl">or</span>
        <Btn onClick={ctl.startDraw}>Draw a custom parcel</Btn>
      </>
    );

  const built = isBuilt(open);
  if (confirming && built)
    return (
      <>
        <Status>
          Delete this parcel? <span className="sub long">It leaves History and the map.</span>
        </Status>
        <Btn
          kind="danger"
          onClick={() => {
            setConfirming(false);
            ctl.removeSaved(open.key!);
          }}
        >
          Delete
        </Btn>
        <Btn kind="quiet" onClick={() => setConfirming(false)}>
          Keep
        </Btn>
      </>
    );

  const acres = ctl.derived?.ok ? ctl.derived.acres : null;
  return (
    <>
      <span className="tb-lbl">Add:</span>
      <Btn onClick={ctl.startCombine} title="Add county parcels (or take one out)">
        Parcel
      </Btn>
      <Btn onClick={ctl.startDraw} title="Draw a custom shape to add, like a corner with no county record">
        Custom
      </Btn>
      <Btn
        kind="icon"
        onClick={() => ctl.setMode("house")}
        label={open.house ? "House (marked)" : "House"}
        title={open.house ? "House marked; tap to move it" : "Mark the existing house"}
      >
        <HouseIcon />
        {open.house && <span className="tb-dot" />}
      </Btn>
      <Btn
        onClick={() => ctl.startLine("track")}
        title="Draw an existing track, or an easement or right-of-way, known from a deed, plat, survey or visit"
      >
        Line
      </Btn>
      <Sep />
      <Btn onClick={ctl.startSplit} disabled={!ctl.parcel}>
        Split
      </Btn>
      {built && (
        <>
          <Sep />
          <Btn
            kind="icon"
            onClick={() => setConfirming(true)}
            label="Delete this parcel"
            title="Delete this parcel"
          >
            <TrashIcon />
          </Btn>
        </>
      )}
      {acres !== null && (
        <button
          className="tb-acres"
          aria-label={`${ac(acres)} acres: parcel info`}
          aria-expanded={ctl.state.info}
          title="Layers and details"
          onClick={() => ctl.setInfo(!ctl.state.info)}
        >
          {ac(acres)} ac <span aria-hidden="true">{ctl.state.info ? "▴" : "▾"}</span>
        </button>
      )}
    </>
  );
}
