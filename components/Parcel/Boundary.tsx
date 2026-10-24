"use client";
/**
 * Details › Boundary (step 8b, docs/plans/step-8b-parcel-panel.md §3): how the open parcel's boundary is made, from the
 * same layer tree the Info panel drew. Its county facts; each part when there are several (Take out of this parcel);
 * the road strip a combine bridges; a split saved before step 14, its two pieces (● kept, Keep this piece) and Remove split;
 * and Edit parcels and Split, the toolbar's Boundary ▾ tools.
 */
import { ParcelFacts } from "@/components/Explore/ParcelFacts";
import type { LayerId, LayerNode } from "@/components/Explore/layers";
import type { ExploreController } from "@/components/Explore/useExploreController";
import { SCREEN_CONSTANTS } from "@/lib/screen/config";
import { Btn } from "./MarkupDetails";

const ac = (n: number) => `${n.toFixed(2)} ac`;
const BOUNDARY_KINDS: ReadonlySet<LayerNode["kind"]> = new Set(["part", "strip", "split", "piece"]);

/** The boundary's layers, in the tree's order ("Made from" is only a heading there). */
export function boundaryNodes(root: LayerNode): LayerNode[] {
  const out: LayerNode[] = [];
  const walk = (n: LayerNode) => {
    if (BOUNDARY_KINDS.has(n.kind)) out.push(n);
    n.children.forEach(walk);
  };
  root.children.forEach(walk);
  return out;
}

export function Boundary({
  ctl,
  root,
  remove,
}: {
  ctl: ExploreController;
  root: LayerNode;
  remove(id: LayerId): void;
}) {
  const open = ctl.state.store.open!;
  const d = ctl.derived;
  const nodes = boundaryNodes(root);
  const parts = nodes.filter((n) => n.kind === "part");
  return (
    <>
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
      {/* One county parcel and no split: its facts above say it all. */}
      {(parts.length > 1 || nodes.some((n) => n.kind !== "part")) && (
        <ul className="pd-bound">
          {nodes.map((n) => (
            <li key={n.id} className="pd-bound-item">
              <BoundaryItem ctl={ctl} n={n} drawn={n.kind === "part" && isDrawn(ctl, n)} remove={remove} />
            </li>
          ))}
        </ul>
      )}
      <div className="pd-actions">
        <Btn onClick={ctl.startCombine}>Edit parcels</Btn>
        {!open.split && <Btn onClick={() => ctl.startSplit()}>Split</Btn>}
      </div>
    </>
  );
}

const isDrawn = (ctl: ExploreController, n: LayerNode) =>
  ctl.state.store.open?.pieces[Number(n.id.slice("part:".length))]?.source === "drawn";

function BoundaryItem({
  ctl,
  n,
  drawn,
  remove,
}: {
  ctl: ExploreController;
  n: LayerNode;
  drawn: boolean;
  remove(id: LayerId): void;
}) {
  const shapes = ctl.shapes;
  switch (n.kind) {
    case "part":
      return (
        <>
          <span className="pd-bound-name">
            {n.name}
            {n.acres !== null && <span className="muted"> · {ac(n.acres)}</span>}
          </span>
          {drawn && (
            <p className="ip-note">
              A shape you drew. It has no county record, so it adds no owner or parcel ID.
            </p>
          )}
          {n.deletable && <Btn onClick={() => remove(n.id)}>Take out of this parcel</Btn>}
        </>
      );
    case "strip":
      return (
        <>
          <span className="pd-bound-name">Road strip (not in acres)</span>
          <p className="ip-note">
            The parcels are {Math.round(shapes?.gapM ?? 0)} m apart (a road right-of-way?). The boundary
            bridges the gap so the screen sees one parcel, but the strip, {ac(n.acres ?? 0)}, isn&apos;t part
            of the listing: the acres leave it out.
          </p>
        </>
      );
    case "split":
      return (
        <>
          <span className="pd-bound-name">{n.name}</span>
          <p className="ip-note">
            {shapes?.pieces
              ? "A cut across the whole boundary. The piece kept is the parcel the screen sees."
              : "The cut no longer crosses the boundary (a part it went through was taken out), so it's left off."}
          </p>
          {/* Step 14: a split saved before reads as it was, and can be removed or switched; the Split tool now tries a
              scenario instead of moving this line. */}
          <span className="pd-actions">
            <Btn kind="danger" onClick={() => remove("split")}>
              Remove split
            </Btn>
          </span>
        </>
      );
    case "piece":
      return (
        <>
          <span className="pd-bound-name">
            {n.kept ? "● " : "○ "}
            {n.name}
            {n.acres !== null && <span className="muted"> · {ac(n.acres)}</span>}
          </span>
          {n.kept ? (
            <p className="ip-note">This is the parcel the screen sees.</p>
          ) : (
            <span className="pd-actions">
              <span className="ip-note">Left out of the parcel (dashed on the map).</span>
              <Btn kind="go" onClick={() => ctl.keepSide(n.id === "piece:1" ? 1 : -1)}>
                Keep this piece
              </Btn>
            </span>
          )}
        </>
      );
    default:
      return null;
  }
}
