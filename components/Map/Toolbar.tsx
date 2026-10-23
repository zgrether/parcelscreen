"use client";
/**
 * The parcel toolbar on the map (13e): always one line.
 *   nothing open:  "Tap a parcel to select it or Draw a custom parcel" (no rule: the "or" separates them)
 *   a parcel open: "Boundary ▾ · + Mark · Grade this parcel │ 🗑   12.34 ac ▾" (the grade button on a desktop only,
 *                  step 4c; owner, after #136: Boundary holds Parcel, Custom and
 *                  Split; + Mark opens the Mark picker, which holds the house site and the lines; the acres open the
 *                  parcel panel's Details at Boundary, step 8b)
 *   a tool in use: what to do next, and its controls (Finish, Done, Keep…, Cancel)
 * The trash (built parcels only) asks inline before deleting. A tap refused because a built parcel is open
 * shows a brief note above the bar.
 */
import { area, length, lineString, polygon } from "@turf/turf";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useKeepInView } from "@/lib/client/keepInView";
import { isBuilt } from "@/lib/client/parcelStore";
import { CHOICE_LABEL, type MarkChoice } from "@/lib/client/markChoices";
import { MarkIcon } from "./markIcons";
import { M2FT, M2_PER_ACRE } from "@/lib/geo/types";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";
import { useExplore, type ExploreController } from "@/components/Explore/useExploreController";
import { GradeAction } from "@/components/Results/panel/GradeAction";
import { showBoundary } from "@/components/Parcel/ParcelSwitch";
import { NEIGHBOUR_WORDS } from "@/lib/report/raise";
import { isPreview } from "@/lib/client/samples";
import { SAMPLE_WORDS } from "@/lib/areas/words";

const GRADE_COMBINATION = NEIGHBOUR_WORDS.go;

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
  // Step 13: a sample parcel isn't the person's to edit until it's on their list.
  if (!mode && isPreview(open)) return <Status>{SAMPLE_WORDS.readOnly}</Status>;

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
  if (mode === "track" || mode === "easement" || mode === "drive") {
    // Follow-up 34: a line known from a deed, plat, survey or visit, kept with the parcel.
    const n = draft.length;
    const ft =
      n >= 2 ? length(lineString(draft.map(([lat, lon]) => [lon, lat])), { units: "meters" }) * M2FT : 0;
    return (
      <>
        <span className="tb-seg" role="group" aria-label="What the line is">
          {(["track", "drive", "easement"] as const).map((k) => (
            <button key={k} aria-pressed={mode === k} onClick={() => ctl.startLine(k)} disabled={n > 0}>
              {CHOICE_LABEL[k]}
            </button>
          ))}
        </span>
        <Status>
          {n === 0 ? (
            mode === "easement" ? (
              "Tap along the easement or right-of-way"
            ) : (
              "Tap along the drive or trail"
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
  if (mode === "point" || mode === "area") {
    // The Mark picker chose the kind (owner, after #136); here, where it goes.
    const kind = ctl.state.markKind as MarkChoice | null;
    const n = draft.length;
    if (!kind)
      return (
        <>
          <Btn onClick={() => ctl.openPicker()}>Pick what to mark</Btn>
          {cancel}
        </>
      );
    const septic = kind === "septic" && mode === "area";
    const acres =
      mode === "area" && n >= 3
        ? area(polygon([[...draft.map(([lat, lon]) => [lon, lat]), [draft[0]![1], draft[0]![0]]]])) /
          M2_PER_ACRE
        : null;
    return (
      <>
        <span className="tb-kind">
          <MarkIcon kind={kind} px={20} /> {CHOICE_LABEL[kind]}
        </span>
        <Status>
          {mode === "point" ? (
            ctl.state.editing ? (
              "Tap where it goes"
            ) : (
              "Tap where it is"
            )
          ) : n === 0 ? (
            septic ? (
              "Tap the permit's spot, or its field's corners"
            ) : (
              "Tap its corners"
            )
          ) : septic && n === 1 ? (
            <>
              <b>Its spot</b>
              <span className="sub long"> · or tap on to outline its field</span>
            </>
          ) : (
            <>
              <b>
                {n} corner{n > 1 ? "s" : ""}
              </b>
              {acres !== null && <span className="sub"> · {ac(acres)} ac</span>}
            </>
          )}
        </Status>
        {mode === "area" && (
          <>
            <Btn kind="quiet" onClick={ctl.undoCorner} disabled={n === 0}>
              Undo
            </Btn>
            {/* A septic permit: one tap is its point (Done), three or more its field (owner, after #136). */}
            <Btn kind="go" onClick={ctl.finishArea} disabled={septic ? n === 0 || n === 2 : n < 3}>
              {septic && n === 1 ? "Done" : "Finish"}
            </Btn>
          </>
        )}
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
          {ctl.state.combineAsNew ? GRADE_COMBINATION : "Done"}
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
          Delete this parcel? <span className="sub long">It leaves your list and the map.</span>
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
      <BoundaryMenu ctl={ctl} />
      <Btn
        kind="go"
        onClick={() => ctl.openPicker()}
        title="Mark the house site, a way in, water and utilities, or something on the land"
      >
        + Mark
      </Btn>
      {/* The parcel's one action (step 4c): here on a desktop; under the sheet's header on a phone. */}
      {ctl.docked && <GradeAction where="toolbar" />}
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
          aria-label={`${ac(acres)} acres: parcel details`}
          title="The parcel's details and boundary"
          onClick={() => {
            // Step 8b: always Details at Boundary (it was a toggle for the Info panel).
            ctl.setInfo(true);
            showBoundary();
          }}
        >
          {ac(acres)} ac <span aria-hidden="true">▾</span>
        </button>
      )}
    </>
  );
}

/**
 * Boundary ▾ (owner, after #136): the tools that change the parcel's boundary, Parcel (add or take out county
 * parcels), Custom (a drawn shape) and Split. Its menu opens above the bar, placed against the window: the bar
 * scrolls sideways on a phone, and would cut it off.
 */
function BoundaryMenu({ ctl }: { ctl: ExploreController }) {
  const [at, setAt] = useState<CSSProperties | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLSpanElement>(null);
  const open = at !== null;
  useKeepInView(list, open, button);
  useEffect(() => {
    if (!open) return;
    const close = () => setAt(null);
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, [open]);
  const toggle = () => {
    const r = button.current?.getBoundingClientRect();
    setAt(open || !r ? null : { position: "fixed", left: r.left, bottom: window.innerHeight - r.top + 6 });
  };
  const go = (f: () => void) => {
    setAt(null);
    f();
  };
  return (
    <span
      className="tb-menu"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.preventDefault();
          setAt(null);
          button.current?.focus();
        }
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setAt(null);
      }}
    >
      <button ref={button} className="tb-btn tool" aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
        Boundary ▾
      </button>
      {open && (
        <span ref={list} className="tb-menu-list" role="menu" style={at}>
          <button
            role="menuitem"
            onClick={() => go(ctl.startCombine)}
            title="Add county parcels (or take one out)"
          >
            Parcel
          </button>
          <button
            role="menuitem"
            onClick={() => go(ctl.startDraw)}
            title="Draw a custom shape to add, like a corner with no county record"
          >
            Custom
          </button>
          <button role="menuitem" onClick={() => go(ctl.startSplit)} disabled={!ctl.parcel}>
            Split
          </button>
        </span>
      )}
    </span>
  );
}
