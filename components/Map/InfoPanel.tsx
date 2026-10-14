"use client";
/**
 * The Info panel (plan 13e §4), opened from the toolbar's acres: a dark, see-through panel docked on the map
 * (right edge on desktop, above the toolbar on phones). Its Layers tab lists everything on the open parcel:
 * select a row to highlight it on the map and see its details; the eye hides it, × deletes it. Three regions:
 * the tree and the details each scroll on their own, and the selected layer's actions sit in a footer pinned
 * to the bottom. The Notes tab (13e-5) takes the tree's place; the details and the actions below stay.
 * The panel reopens on the last tab used.
 *
 * Keys: Delete or Backspace deletes the selected layer; Esc clears the selection, then closes the panel.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { length, lineString } from "@turf/turf";
import {
  isBuilt,
  KIND_NAME,
  LINE_CONDITIONS,
  type LineCondition,
  type Markup,
  type MarkupKind,
} from "@/lib/client/parcelStore";
import { M2FT } from "@/lib/geo/types";
import { getPref, setPref } from "@/lib/client/prefs";
import type { ParcelRecord } from "@/lib/geo/parcels";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";
import { findLayer, layerLine, type LayerId, type LayerNode } from "@/components/Explore/layers";
import { ParcelFacts } from "@/components/Explore/ParcelFacts";
import { ListingFacts } from "./ListingFacts";
import { parcelDisplayName } from "@/lib/client/historyRows";
import { useExplore, type ExploreController } from "@/components/Explore/useExploreController";
import { AnalysisGroup } from "./results/AnalysisGroup";
import { useScreenItContext } from "@/components/Results/ScreenItContext";
import { lineSummary } from "@/lib/report/lines";
import { RoadsToggle } from "./RoadsToggle";
import { TerrainControls } from "./TerrainControls";

const ac = (n: number) => `${n.toFixed(2)} ac`;

export function InfoPanel() {
  const ctl = useExplore();
  const { info } = ctl.state;
  const open = ctl.state.store.open;
  if (!info || !open || !ctl.layers) return null;
  // Keyed by which parcel is open, so a pending confirmation or an error never carries over to another (and a
  // first note, which gives the parcel its key, doesn't remount the box being typed in).
  return <Panel key={ctl.state.serial} ctl={ctl} root={ctl.layers} />;
}

function Panel({ ctl, root }: { ctl: ExploreController; root: LayerNode }) {
  const { layer, mode } = ctl.state;
  const [collapsed, setCollapsed] = useState<ReadonlySet<LayerId>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"layers" | "notes">(() => getPref("ps.infoTab"));
  const selected = (layer && findLayer(root, layer)) || root;
  const showTab = (t: "layers" | "notes") => {
    setTab(t);
    setPref("ps.infoTab", t);
  };
  // Selecting a layer on the map (the house) shows it in the Layers tab. (Adjusted while rendering, as React
  // recommends for state that follows a prop, rather than in an effect.)
  const [shownLayer, setShownLayer] = useState(layer);
  if (layer !== shownLayer) {
    setShownLayer(layer);
    if (layer) setTab("layers");
  }
  const hasNotes = (ctl.state.store.open?.notes ?? "").trim() !== "";
  // Owner, #127: a line's name is edited in place (double-click, or a long press on a phone).
  const [renaming, setRenaming] = useState<LayerId | null>(null);
  const tree = useRef<HTMLDivElement>(null);
  // A line tapped on the map: its row scrolls into view.
  useEffect(() => {
    tree.current?.querySelector<HTMLElement>(".ip-row.sel")?.scrollIntoView?.({ block: "nearest" });
  }, [layer, tab]);
  // A hovered row's line stops glowing when the panel goes.
  const { setHoverLine } = ctl;
  useEffect(() => () => setHoverLine(null), [setHoverLine]);

  const remove = (id: LayerId) => setError(ctl.deleteLayer(id));
  const select = (id: LayerId | null) => {
    setError(null);
    ctl.selectLayer(id);
  };

  // Keys, while no tool is in use (the tools have their own Esc) and no field has focus.
  const keys = useRef({ ctl, selected, remove, select });
  useEffect(() => {
    keys.current = { ctl, selected, remove, select };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keys.current;
      const s = k.ctl.current();
      if (e.defaultPrevented || s.mode || s.split) return;
      if ((e.target as HTMLElement | null)?.closest("input,select,textarea")) return;
      if ((e.key === "Delete" || e.key === "Backspace") && s.layer && k.selected.deletable) {
        e.preventDefault();
        k.remove(k.selected.id);
      } else if (e.key === "Escape") {
        if (s.layer) k.select(null);
        else k.ctl.setInfo(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const { body, actions } = details(ctl, selected, remove);
  return (
    <section className="info-panel" aria-label="Parcel info" data-tool={mode ? "" : undefined}>
      <header className="ip-head">
        <div className="ip-tabs" role="tablist" aria-label="Info panel">
          <button
            className="ip-tab"
            role="tab"
            aria-selected={tab === "layers"}
            onClick={() => showTab("layers")}
          >
            Layers
          </button>
          <button
            className="ip-tab"
            role="tab"
            aria-selected={tab === "notes"}
            onClick={() => showTab("notes")}
          >
            Notes
            {hasNotes && <span className="ip-dot" aria-label="(has notes)" />}
          </button>
        </div>
        <button className="ip-x" aria-label="Close the Info panel" onClick={() => ctl.setInfo(false)}>
          ×
        </button>
      </header>
      {tab === "notes" ? (
        <Notes ctl={ctl} name={root.name} />
      ) : (
        <div className="ip-tree" role="tree" aria-label="Layers" ref={tree}>
          <Rows
            nodes={[root]}
            depth={0}
            ctl={ctl}
            layer={layer}
            collapsed={collapsed}
            toggle={(id) =>
              setCollapsed((c) => {
                const n = new Set(c);
                if (!n.delete(id)) n.add(id);
                return n;
              })
            }
            select={select}
            remove={remove}
            renaming={renaming}
            setRenaming={setRenaming}
          />
          <AnalysisGroup />
          <RoadsToggle variant="info" />
          <TerrainControls variant="info" />
        </div>
      )}
      <div className="ip-details" aria-live="polite">
        {body}
        {error && <p className="ip-error">{error}</p>}
      </div>
      <footer className="ip-actions">{actions}</footer>
    </section>
  );
}

function Rows(props: {
  nodes: LayerNode[];
  depth: number;
  ctl: ExploreController;
  layer: LayerId | null;
  collapsed: ReadonlySet<LayerId>;
  toggle(id: LayerId): void;
  select(id: LayerId | null): void;
  remove(id: LayerId): void;
  renaming: LayerId | null;
  setRenaming(id: LayerId | null): void;
}) {
  const { nodes, depth, ctl, layer, collapsed, toggle, select, remove, renaming, setRenaming } = props;
  const press = useRef<number | null>(null);
  const endPress = () => {
    if (press.current !== null) window.clearTimeout(press.current);
    press.current = null;
  };
  return (
    <>
      {nodes.map((n) => {
        const kids = n.children.length > 0;
        const isOpen = kids && !collapsed.has(n.id);
        // "Made from" is a heading: it folds, but there's nothing to select.
        const heading = n.kind === "group";
        const cls = ["ip-row", layer === n.id && "sel", n.hidden && "off", heading && "sub"].filter(Boolean);
        return (
          <div key={n.id} role="none">
            <div
              role="treeitem"
              aria-level={depth + 1}
              aria-selected={layer === n.id}
              aria-expanded={kids ? isOpen : undefined}
              className={cls.join(" ")}
              style={{ "--d": depth } as CSSProperties}
              onClick={() => (heading ? toggle(n.id) : select(n.id))}
              {...(n.kind === "line" && {
                onDoubleClick: () => setRenaming(n.id),
                onMouseEnter: () => ctl.setHoverLine(layerLine(n.id)),
                onMouseLeave: () => ctl.setHoverLine(null),
                onPointerDown: (e) => {
                  if (e.pointerType !== "touch") return;
                  endPress();
                  press.current = window.setTimeout(() => setRenaming(n.id), LONG_PRESS_MS);
                },
                onPointerUp: endPress,
                onPointerMove: endPress,
                onPointerCancel: endPress,
              })}
            >
              {kids ? (
                <button
                  className="tw"
                  aria-label={isOpen ? `Fold ${n.name}` : `Unfold ${n.name}`}
                  aria-expanded={isOpen}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(n.id);
                  }}
                >
                  <Chevron />
                </button>
              ) : (
                <span />
              )}
              {n.hideable ? (
                <button
                  className={`eye${n.hidden ? " off" : ""}`}
                  aria-label={n.hidden ? `Show ${n.name}` : `Hide ${n.name}`}
                  aria-pressed={n.hidden}
                  onClick={(e) => {
                    e.stopPropagation();
                    ctl.toggleHidden(n.id);
                  }}
                >
                  <Eye off={n.hidden} />
                </button>
              ) : n.kind === "piece" ? (
                n.kept ? (
                  <span className="eye radio" aria-hidden="true">
                    ●
                  </span>
                ) : (
                  <button
                    className="eye radio"
                    aria-label={`Keep the ${n.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      ctl.keepSide(n.id === "piece:1" ? 1 : -1);
                    }}
                  >
                    ○
                  </button>
                )
              ) : (
                <span />
              )}
              {renaming === n.id ? (
                <RowName
                  name={n.name}
                  done={(name) => {
                    const line = layerLine(n.id);
                    if (line && name !== null) ctl.renameMarkup(line, name, ctl.state.serial);
                    setRenaming(null);
                  }}
                />
              ) : (
                <span className="nm">{n.name}</span>
              )}
              <span className="mt">{n.acres !== null ? ac(n.acres) : (n.meta ?? "")}</span>
              {n.deletable ? (
                <button
                  className="del"
                  aria-label={`Delete ${n.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(n.id);
                  }}
                >
                  ×
                </button>
              ) : (
                <span />
              )}
            </div>
            {isOpen && <Rows {...props} nodes={n.children} depth={depth + 1} />}
          </div>
        );
      })}
    </>
  );
}

/** A press this long on a phone renames a line's row (owner, #127), ms. */
const LONG_PRESS_MS = 500;

/** A line's name, edited in its row: kept on Enter or leaving the box, dropped on Esc (`done(null)`). */
function RowName({ name, done }: { name: string; done(name: string | null): void }) {
  const [text, setText] = useState(name);
  const finished = useRef(false);
  const finish = (v: string | null) => {
    if (finished.current) return;
    finished.current = true;
    done(v);
  };
  return (
    <input
      className="ip-row-name"
      aria-label="Name"
      autoFocus
      value={text}
      onChange={(e) => setText(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onBlur={() => finish(text)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") finish(text);
        else if (e.key === "Escape") finish(null);
      }}
    />
  );
}

const Btn = ({
  kind = "sec",
  onClick,
  children,
}: {
  kind?: "go" | "sec" | "danger";
  onClick(): void;
  children: ReactNode;
}) => (
  <button className={`ip-btn ${kind}`} onClick={onClick}>
    {children}
  </button>
);

/** What the details region and the footer show for the selected layer (the parcel when none is). */
function details(
  ctl: ExploreController,
  n: LayerNode,
  remove: (id: LayerId) => void,
): { body: ReactNode; actions: ReactNode } {
  const open = ctl.state.store.open!;
  const shapes = ctl.shapes;
  switch (n.kind) {
    case "part": {
      const i = Number(n.id.slice("part:".length));
      const part: ParcelRecord | undefined = open.pieces[i];
      if (!part) return { body: null, actions: null };
      return {
        body: (
          <>
            <h3>{n.name}</h3>
            {part.source === "drawn" ? (
              <p className="ip-note">
                A shape you drew, {ac(n.acres ?? 0)}. It has no county record, so it adds no owner or parcel
                ID.
              </p>
            ) : (
              <ParcelFacts parcel={part} />
            )}
          </>
        ),
        actions: (
          <>
            {n.deletable && <Btn onClick={() => remove(n.id)}>Take out of this parcel</Btn>}
            <Btn onClick={ctl.startCombine}>Edit parcels</Btn>
          </>
        ),
      };
    }
    case "strip":
      return {
        body: (
          <>
            <h3>Road strip</h3>
            <p className="ip-note">
              The parcels are {Math.round(shapes?.gapM ?? 0)} m apart (a road right-of-way?). The boundary
              bridges the gap so the screen sees one parcel, but the strip, {ac(n.acres ?? 0)}, isn&apos;t
              part of the listing: the acres leave it out.
            </p>
          </>
        ),
        actions: null,
      };
    case "split": {
      const P = shapes?.pieces;
      return {
        body: (
          <>
            <h3>{n.name}</h3>
            {P ? (
              <p className="ip-note">
                A cut across the whole boundary. The piece kept is the parcel the screen sees; tap ○ to keep
                the other one instead.
              </p>
            ) : (
              <p className="ip-note">
                The cut no longer crosses the boundary (a part it went through was taken out), so it&apos;s
                left off.
              </p>
            )}
          </>
        ),
        actions: (
          <>
            {P && <Btn onClick={ctl.startSplit}>Adjust the line</Btn>}
            <Btn kind="danger" onClick={() => remove("split")}>
              Remove split
            </Btn>
          </>
        ),
      };
    }
    case "piece":
      return {
        body: (
          <>
            <h3>{n.name}</h3>
            <p className="ip-note">
              {ac(n.acres ?? 0)}.{" "}
              {n.kept ? "This is the parcel the screen sees." : "Left out of the parcel (dashed on the map)."}
            </p>
          </>
        ),
        actions: n.kept ? (
          <Btn onClick={ctl.startSplit}>Adjust the line</Btn>
        ) : (
          <Btn kind="go" onClick={() => ctl.keepSide(n.id === "piece:1" ? 1 : -1)}>
            Keep this piece
          </Btn>
        ),
      };
    case "house":
      return {
        body: (
          <>
            <h3>Existing house</h3>
            <p className="ip-note">
              {open.house ? `${open.house[0].toFixed(6)}, ${open.house[1].toFixed(6)}. ` : ""}
              Drag the bulls-eye on the map to move it.
            </p>
          </>
        ),
        actions: (
          <>
            <Btn onClick={() => ctl.setMode("house")}>Move it</Btn>
            <Btn kind="danger" onClick={() => remove("house")}>
              Remove house
            </Btn>
          </>
        ),
      };
    case "line": {
      const m = open.markup.find((x) => x.id === layerLine(n.id));
      if (!m) return { body: null, actions: null };
      return {
        body: <LineDetails key={m.id} ctl={ctl} m={m} />,
        actions: (
          <>
            <Btn onClick={() => ctl.editLine(m.id)}>Edit</Btn>
            <Btn kind="danger" onClick={() => remove(n.id)}>
              Delete
            </Btn>
          </>
        ),
      };
    }
    default:
      return { body: <ParcelDetails ctl={ctl} name={n.name} />, actions: <ParcelActions ctl={ctl} /> };
  }
}

function ParcelDetails({ ctl, name }: { ctl: ExploreController; name: string }) {
  const d = ctl.derived;
  return (
    <>
      <h3>{name}</h3>
      {ctl.parcel && <ParcelFacts parcel={ctl.parcel} unscreened={d?.ok ? d.unscreened : undefined} />}
      {d?.ok && d.splitDropped && (
        <p className="ip-note">The split no longer crosses the boundary, so it&apos;s left off.</p>
      )}
      {d && !d.ok && (
        <p className="ip-note">
          These parts don&apos;t make one boundary ({Math.round(d.gapM)} m apart, more than the{" "}
          {SCREEN_CONSTANTS.combine.maxGapM} m a road would explain). Take one out, or close the parcel.
        </p>
      )}
    </>
  );
}

/** Close, and for a built parcel Remove, with an inline confirm. */
function ParcelActions({ ctl }: { ctl: ExploreController }) {
  const open = ctl.state.store.open!;
  const [confirming, setConfirming] = useState(false);
  if (confirming)
    return (
      <>
        <span className="ip-ask">Remove it? It leaves History and the map.</span>
        <Btn kind="danger" onClick={() => ctl.removeSaved(open.key!)}>
          Remove
        </Btn>
        <Btn onClick={() => setConfirming(false)}>Keep</Btn>
      </>
    );
  return (
    <>
      <Btn onClick={ctl.close}>Close</Btn>
      {isBuilt(open) && open.key && (
        <Btn kind="danger" onClick={() => setConfirming(true)}>
          Remove
        </Btn>
      )}
    </>
  );
}

/** Notes save this long after the last keystroke (and at once when the box loses focus). */
const NOTES_DEBOUNCE_MS = 600;

const savedAt = (iso: string) =>
  new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * The Notes tab: the parcel's notes, saved as you type. The box keeps its own text; a save changes only the
 * "Saved" line and the tab's dot (and, the first time, makes the parcel built), so nothing around the box
 * redraws under the cursor. On phones the sheet and the toolbar step aside while it has focus.
 */
function Notes({ ctl, name }: { ctl: ExploreController; name: string }) {
  // The name the parcel has until one is typed (WF1).
  const derivedName = ctl.derived ? parcelDisplayName(ctl.derived) : name;
  const open = ctl.state.store.open!;
  const [text, setText] = useState(open.notes);
  const save = useRef({ ctl, serial: ctl.state.serial, text, timer: null as number | null });
  useEffect(() => {
    save.current.ctl = ctl;
  });
  const flush = () => {
    const s = save.current;
    if (s.timer === null) return;
    window.clearTimeout(s.timer);
    s.timer = null;
    s.ctl.saveNotes(s.text, s.serial);
  };
  const change = (v: string) => {
    setText(v);
    const s = save.current;
    s.text = v;
    if (s.timer !== null) window.clearTimeout(s.timer);
    s.timer = window.setTimeout(flush, NOTES_DEBOUNCE_MS);
  };
  // Leaving the tab or the panel saves what's pending; so does leaving the box (onBlur).
  useEffect(
    () => () => {
      flush();
      document.documentElement.classList.remove("note-typing");
    },
    [],
  );

  const pending = text !== open.notes;
  return (
    <div className="ip-notes">
      <ListingFacts ctl={ctl} derivedName={derivedName} />
      <div className="ip-notes-for">
        Notes <span>· {name}</span>
      </div>
      <textarea
        aria-label={`Notes for ${name}`}
        placeholder="What you learned: the listing, a call with the agent, what to check on the visit…"
        value={text}
        onChange={(e) => change(e.target.value)}
        onFocus={() => document.documentElement.classList.add("note-typing")}
        onBlur={() => {
          flush();
          document.documentElement.classList.remove("note-typing");
        }}
      />
      <div className="ip-notes-foot">
        <span>
          {pending ? "Saving…" : open.notesAt ? `Saved ${savedAt(open.notesAt)}` : "Notes save as you type."}
        </span>
        {text !== "" && (
          <button
            className="ip-link"
            onClick={() => {
              change("");
              flush();
            }}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

const KINDS: MarkupKind[] = ["track", "easement", "drive"];
const CONDITION_WORD: Record<LineCondition, string> = {
  uncleared: "Uncleared",
  pioneer: "Pioneer",
  improved: "Improved",
  paved: "Paved",
};

/**
 * A drawn line's details (owner, #127: in the Layers tree, where a tap on the line selects it): its name, what it is,
 * its ground's condition, its width, a note saying where it came from (deed, plat, survey, a visit), and its length
 * and grades once a screen has measured it (34-2). Keyed by the line, so the boxes start from its own values.
 */
function LineDetails({ ctl, m }: { ctl: ExploreController; m: Markup }) {
  const serial = ctl.state.serial;
  const s = useScreenItContext();
  const result = s?.shown && !s.stale ? s.shown.result : null;
  const measured = result?.lines.find((l) => l.id === m.id);
  const [note, setNote] = useState(m.note);
  const ft = length(lineString(m.line.map(([lat, lon]) => [lon, lat])), { units: "meters" }) * M2FT;
  const saveNote = () => {
    if (note !== m.note) ctl.saveMarkupNote(m.id, note, serial);
  };
  return (
    <>
      <LineName key={m.name} name={m.name} save={(name) => ctl.renameMarkup(m.id, name, serial)} />
      <p className="ip-note">
        {measured ? lineSummary(measured) : `${Math.round(ft).toLocaleString()} ft`}
        {!measured && result && " (run again to grade it)"}
      </p>
      <div className="ip-line-row" role="group" aria-label="What it is">
        {KINDS.map((k) => (
          <button
            key={k}
            className="chip"
            aria-pressed={m.kind === k}
            onClick={() => ctl.setMarkupKind(m.id, k, serial)}
          >
            {KIND_NAME[k]}
          </button>
        ))}
      </div>
      <div className="ip-line-row" role="group" aria-label="Its condition">
        {LINE_CONDITIONS.map((c) => (
          <button
            key={c}
            className="chip"
            aria-pressed={m.condition === c}
            onClick={() => ctl.setMarkupCondition(m.id, c, serial)}
          >
            {CONDITION_WORD[c]}
          </button>
        ))}
      </div>
      {/* Stored now; the parcel-workflow plan prices it (owner, A). */}
      <p className="ip-note">The condition doesn&apos;t change the cost yet.</p>
      <Width
        key={`${m.id} ${m.widthFt}`}
        widthFt={m.widthFt}
        // The screen reads an easement's width only (owner, #127).
        unused={m.kind !== "easement"}
        save={(w) => ctl.saveMarkupWidth(m.id, w, serial)}
      />
      <input
        className="ip-line-note"
        aria-label={`Note for ${m.name}`}
        placeholder="Where it comes from: the deed, a plat, a survey, a visit…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={saveNote}
        onKeyDown={(e) => {
          if (e.key === "Enter") saveNote();
        }}
      />
    </>
  );
}

/** The details' heading: the line's name, typed over (owner, #127); kept on Enter or leaving the box, unless blank. */
function LineName({ name, save }: { name: string; save(name: string): void }) {
  const [text, setText] = useState(name);
  const keep = () => {
    if (text.trim() && text.trim() !== name) save(text);
    else setText(name);
  };
  return (
    <input
      className="ip-line-name"
      aria-label="Name"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={keep}
      onKeyDown={(e) => {
        if (e.key === "Enter") keep();
      }}
    />
  );
}

/** A line's width, typed: kept on Enter or leaving the box when it's a positive number, else put back. */
function Width({
  widthFt,
  unused,
  save,
}: {
  widthFt: number | null;
  unused: boolean;
  save(w: number): void;
}) {
  const [width, setWidth] = useState(widthFt != null ? String(widthFt) : "");
  const keep = () => {
    const w = Number(width);
    if (Number.isFinite(w) && w > 0 && w !== widthFt) save(w);
    else setWidth(widthFt != null ? String(widthFt) : "");
  };
  return (
    <label className="ip-line-row ip-note">
      Width
      <input
        inputMode="decimal"
        aria-label="Width in feet"
        className="ip-line-width"
        value={width}
        onChange={(e) => setWidth(e.target.value)}
        onBlur={keep}
        onKeyDown={(e) => {
          if (e.key === "Enter") keep();
        }}
      />
      ft{unused && <span> · not used in costs yet</span>}
    </label>
  );
}

const Chevron = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
    <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const Eye = ({ off }: { off: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <path
      d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
    />
    <circle cx="8" cy="8" r="2" fill="currentColor" />
    {off && <path d="M2.5 13.5 13.5 2.5" stroke="currentColor" strokeWidth="1.3" />}
  </svg>
);
