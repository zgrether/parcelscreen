"use client";
/**
 * Details › Lines & marks (step 8b, docs/plans/step-8b-parcel-panel.md §3): the house site, the drawn lines and the
 * marks on the open parcel, a row each (its icon, name, what it is, an eye to hide it on the map, ×). A tap opens the row
 * in place with its details and actions; selecting it on the map opens it too (the explorer's `layer`). Draw a line and
 * + Mark start the toolbar's own tools.
 */
import { useEffect, useRef } from "react";
import { layerLine, type LayerId, type LayerNode } from "@/components/Explore/layers";
import type { ExploreController } from "@/components/Explore/useExploreController";
import { MarkIcon } from "@/components/Map/markIcons";
import { useMapLayerPrefs } from "@/components/Map/useMapLayerPrefs";
import { Btn, LineDetails, MarkDetails } from "./MarkupDetails";

export const LINES_EMPTY = "Nothing drawn yet. Draw a line or add a mark, here or from the toolbar.";
/** With Map layers' Your lines and marks off. */
export const hiddenOnMap = (n: number): string => `${n} hidden on the map. Show them in Map layers.`;

const ac = (n: number) => `${n.toFixed(2)} ac`;

/** The house, then each line and mark, in the tree's order. */
export function markupNodes(root: LayerNode): LayerNode[] {
  const out: LayerNode[] = [];
  const walk = (n: LayerNode) => {
    if (n.kind === "house" || n.kind === "line" || n.kind === "mark") out.push(n);
    n.children.forEach(walk);
  };
  root.children.forEach(walk);
  return out;
}

export function LinesMarks({
  ctl,
  root,
  remove,
}: {
  ctl: ExploreController;
  root: LayerNode;
  remove(id: LayerId): void;
}) {
  const nodes = markupNodes(root);
  // Map layers' Your lines and marks off: none is drawn, whatever its eye says (plan §4).
  const shown = useMapLayerPrefs().marks;
  const layer = ctl.state.layer;
  const list = useRef<HTMLUListElement>(null);
  // A line or mark selected on the map: its row, open, comes into view.
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(".pd-row.sel")?.scrollIntoView?.({ block: "nearest" });
  }, [layer]);
  return (
    <>
      {!shown && nodes.length > 0 && <p className="ip-note pd-hidden">{hiddenOnMap(nodes.length)}</p>}
      {nodes.length === 0 ? (
        <p className="muted pd-empty">{LINES_EMPTY}</p>
      ) : (
        <ul className="pd-rows" ref={list}>
          {nodes.map((n) => (
            <Row key={n.id} ctl={ctl} n={n} open={layer === n.id} remove={remove} />
          ))}
        </ul>
      )}
    </>
  );
}

function Row({
  ctl,
  n,
  open,
  remove,
}: {
  ctl: ExploreController;
  n: LayerNode;
  open: boolean;
  remove(id: LayerId): void;
}) {
  const line = layerLine(n.id);
  return (
    <li>
      <div
        className={`pd-row${open ? " sel" : ""}${n.hidden ? " off" : ""}`}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={`${n.name}: ${open ? "close" : "open"} its details`}
        onClick={() => ctl.selectLayer(open ? null : n.id)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
          e.preventDefault();
          ctl.selectLayer(open ? null : n.id);
        }}
        onMouseEnter={() => line && ctl.setHoverLine(line)}
        onMouseLeave={() => ctl.setHoverLine(null)}
      >
        <span className="pd-ico">{n.icon && <MarkIcon kind={n.icon} px={22} />}</span>
        <span className="pd-text">
          <span className="pd-name">{n.name}</span>
          <span className="pd-meta">{n.acres !== null ? ac(n.acres) : (n.meta ?? "")}</span>
        </span>
        {n.hideable ? (
          <button
            className={`pd-eye${n.hidden ? " off" : ""}`}
            aria-label={n.hidden ? `Show ${n.name} on the map` : `Hide ${n.name} on the map`}
            aria-pressed={n.hidden}
            title={n.hidden ? "Hidden on the map" : "Shown on the map"}
            onClick={(e) => {
              e.stopPropagation();
              ctl.toggleHidden(n.id);
            }}
          >
            <Eye off={n.hidden} />
          </button>
        ) : (
          <span />
        )}
        {n.deletable ? (
          <button
            className="pd-del"
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
      {open && <Open ctl={ctl} n={n} remove={remove} />}
    </li>
  );
}

/** The open row: its details, then its actions (Edit on the map, Move it or Redraw; Delete). */
function Open({ ctl, n, remove }: { ctl: ExploreController; n: LayerNode; remove(id: LayerId): void }) {
  const open = ctl.state.store.open!;
  if (n.kind === "house")
    return (
      <div className="pd-open">
        <p className="ip-note">
          {open.house ? `${open.house[0].toFixed(6)}, ${open.house[1].toFixed(6)}. ` : ""}
          Drag the bulls-eye on the map to move it.
        </p>
        <div className="pd-actions">
          <Btn onClick={() => ctl.setMode("house")}>Move it</Btn>
          <Btn kind="danger" onClick={() => remove("house")}>
            Remove house
          </Btn>
        </div>
      </div>
    );
  const m = open.markup.find((x) => x.id === layerLine(n.id));
  if (!m) return null;
  return (
    <div className="pd-open">
      {m.shape === "line" ? (
        <LineDetails key={m.id} ctl={ctl} m={m} />
      ) : (
        <MarkDetails key={m.id} ctl={ctl} m={m} />
      )}
      <div className="pd-actions">
        <Btn onClick={() => ctl.editLine(m.id)}>
          {m.shape === "line" ? "Edit on the map" : m.shape === "point" ? "Move it" : "Redraw"}
        </Btn>
        <Btn kind="danger" onClick={() => remove(n.id)}>
          Delete
        </Btn>
      </div>
    </div>
  );
}

const Eye = ({ off }: { off: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
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
