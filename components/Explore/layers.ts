/**
 * The Info panel's Layers tree (plan 13e §4): everything on the open parcel as a layer you can select, hide
 * or delete. Pure: built from the working parcel and its shapes; the panel renders the tree and the map
 * highlights the selected layer (overlays.selectionData).
 *
 * Before a split, the parts sit directly under the parcel. After one, the parcel shows "Made from" (its
 * parts and the road strip) and "Split into 2 pieces" (● the piece kept, ○ the other). Steps 14–15 add an
 * Analysis group after the house.
 */
import { difference, featureCollection } from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import type { WorkingParcel } from "@/lib/client/parcelStore";
import type { CombineLimits } from "@/lib/geo/combine";
import { memberLabel } from "@/lib/geo/combine";
import { parcelFacts } from "@/lib/geo/parcels";
import { parcelDisplayName } from "@/lib/client/historyRows";
import { deriveParcel, ownLand, splitPreview, type DerivedParcel } from "@/lib/geo/recipe";
import { sideName, type Side, type SplitPieces } from "@/lib/geo/split";

export type LayerId = "parcel" | "parts" | `part:${number}` | "strip" | "split" | `piece:${Side}` | "house";

/** The open parcel's shapes besides its boundary: what the tree measures and the map highlights. */
export interface ParcelShapes {
  /** The bridged road strip between the parts (not part of the listing), if any. */
  strip: Feature<Polygon | MultiPolygon> | null;
  stripAcres: number;
  /** The gap the strip bridges, m. */
  gapM: number;
  /** Both sides of the saved split, each with the acres keeping it gives; null when there's no split or it no
   * longer crosses the boundary. */
  pieces: SplitPieces | null;
}

export function parcelShapes(p: WorkingParcel, limits: CombineLimits): ParcelShapes {
  const none: ParcelShapes = { strip: null, stripAcres: 0, gapM: 0, pieces: null };
  const base = deriveParcel({ parts: p.pieces }, limits);
  if (!base.ok) return none;
  const own = ownLand(p.pieces);
  const strip =
    base.gapM > 0 && base.bridgeAcres > 0 && own
      ? difference(featureCollection<Polygon | MultiPolygon>([base.record.geo, own]))
      : null;
  const P = p.split ? splitPreview(base.record.geo, own, p.split.a, p.split.b) : null;
  return {
    strip,
    stripAcres: strip ? base.bridgeAcres : 0,
    gapM: base.gapM,
    pieces: P?.left && P.right ? P : null,
  };
}

export interface LayerNode {
  id: LayerId;
  kind: "parcel" | "group" | "part" | "strip" | "split" | "piece" | "house";
  name: string;
  acres: number | null;
  /** Has an eye: it can be hidden on the map. */
  hideable: boolean;
  hidden: boolean;
  /** Has a ×: what it does is deleteLayer's (take a part out, remove the cut, remove the house). */
  deletable: boolean;
  /** For a split piece: the one kept. */
  kept?: boolean;
  children: LayerNode[];
}

const node = (n: Omit<LayerNode, "hidden" | "children"> & { children?: LayerNode[] }, hidden: string[]) => ({
  ...n,
  hidden: hidden.includes(n.id),
  children: n.children ?? [],
});

export function layerTree(p: WorkingParcel, derived: DerivedParcel, shapes: ParcelShapes): LayerNode {
  const h = p.hidden;
  const parts = p.pieces.map((part, i) =>
    node(
      {
        id: `part:${i}`,
        kind: "part",
        name: part.source === "drawn" ? "Drawn shape" : memberLabel(part, i),
        acres: parcelFacts(part.geo, part.props).acres,
        hideable: false,
        // The last part can't be taken out: close the parcel instead.
        deletable: p.pieces.length > 1,
      },
      h,
    ),
  );
  const strip = shapes.strip
    ? [
        node(
          {
            id: "strip",
            kind: "strip",
            name: "Road strip (not in acres)",
            acres: shapes.stripAcres,
            hideable: false,
            deletable: false,
          },
          h,
        ),
      ]
    : [];

  const children: LayerNode[] = [];
  if (p.split) {
    children.push(
      node(
        {
          id: "parts",
          kind: "group",
          name: "Made from",
          acres: null,
          hideable: false,
          deletable: false,
          children: [...parts, ...strip],
        },
        h,
      ),
    );
    const P = shapes.pieces;
    const piece = (side: Side): LayerNode =>
      node(
        {
          id: `piece:${side}`,
          kind: "piece",
          name: `${sideName(p.split!.a, p.split!.b, side)} piece${side === p.split!.keep ? " · kept" : ""}`,
          acres: P ? (side < 0 ? P.leftAc : P.rightAc) : null,
          hideable: false,
          deletable: false,
          kept: side === p.split!.keep,
        },
        h,
      );
    children.push(
      node(
        {
          id: "split",
          kind: "split",
          name: P ? "Split into 2 pieces" : "Split (no longer crosses)",
          acres: null,
          hideable: false,
          deletable: true,
          children: P ? [piece(p.split.keep), piece(p.split.keep === 1 ? -1 : 1)] : [],
        },
        h,
      ),
    );
  } else children.push(...parts, ...strip);

  if (p.house)
    children.push(
      node(
        { id: "house", kind: "house", name: "Existing house", acres: null, hideable: true, deletable: true },
        h,
      ),
    );

  return node(
    {
      id: "parcel",
      kind: "parcel",
      name: parcelDisplayName(derived),
      acres: derived.ok ? derived.acres : null,
      hideable: true,
      deletable: false,
      children,
    },
    h,
  );
}

/** A layer by id, anywhere in the tree. */
export function findLayer(root: LayerNode, id: LayerId): LayerNode | null {
  if (root.id === id) return root;
  for (const c of root.children) {
    const f = findLayer(c, id);
    if (f) return f;
  }
  return null;
}
