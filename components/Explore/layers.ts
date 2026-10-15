/**
 * The Info panel's Layers tree (plan 13e §4): everything on the open parcel as a layer you can select, hide
 * or delete. Pure: built from the working parcel and its shapes; the panel renders the tree and the map
 * highlights the selected layer (overlays.selectionData).
 *
 * Before a split, the parts sit directly under the parcel. After one, the parcel shows "Made from" (its
 * parts and the road strip) and "Split into 2 pieces" (● the piece kept, ○ the other). Steps 14–15 add an
 * Analysis group after the house. Drawn lines come last (owner, #127): each by its name ("Track 2"), with its
 * condition and length where a part has its acres, and its details below the tree.
 */
import { area, difference, featureCollection, length, lineString } from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { KIND_NAME, type LineMarkup, type Markup, type WorkingParcel } from "@/lib/client/parcelStore";
import { areaPolygon } from "@/lib/report/marks";
import type { MarkChoice } from "@/lib/client/markChoices";
import type { CombineLimits } from "@/lib/geo/combine";
import { memberLabel } from "@/lib/geo/combine";
import { parcelFacts } from "@/lib/geo/parcels";
import { parcelDisplayName } from "@/lib/client/historyRows";
import { deriveParcel, ownLand, splitPreview, type DerivedParcel } from "@/lib/geo/recipe";
import { sideName, type Side, type SplitPieces } from "@/lib/geo/split";
import { M2FT, M2_PER_ACRE } from "@/lib/geo/types";

export type LayerId =
  "parcel" | "parts" | `part:${number}` | "strip" | "split" | `piece:${Side}` | "house" | `line:${string}`;

/** A drawn line's layer (owner, #127), or a marker's (WF4), and the markup a layer names, if it is one. */
export const lineLayer = (id: string): LayerId => `line:${id}`;
export const layerLine = (id: LayerId | null): string | null =>
  id?.startsWith("line:") ? id.slice("line:".length) : null;

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
  kind: "parcel" | "group" | "part" | "strip" | "split" | "piece" | "house" | "line" | "mark";
  name: string;
  acres: number | null;
  /** What shows in place of acres, for a drawn line ("pioneer · 849 ft") or a marker ("spring", "clearing · 0.42 ac"). */
  meta?: string;
  /** Has an eye: it can be hidden on the map. */
  hideable: boolean;
  hidden: boolean;
  /** Has a ×: what it does is deleteLayer's (take a part out, remove the cut, remove the house, delete a line). */
  deletable: boolean;
  /** The kind's icon, for the house and what's drawn or marked (owner, after #136). */
  icon?: MarkChoice;
  /** For a split piece: the one kept. */
  kept?: boolean;
  children: LayerNode[];
}

const node = (n: Omit<LayerNode, "hidden" | "children"> & { children?: LayerNode[] }, hidden: string[]) => ({
  ...n,
  hidden: hidden.includes(n.id),
  children: n.children ?? [],
});

/** A drawn line's length on the ground's plan, ft. */
export const lineFt = (m: Pick<LineMarkup, "line">): number =>
  length(lineString(m.line.map(([lat, lon]) => [lon, lat])), { units: "meters" }) * M2FT;

/** A markup's line in the tree: a line's condition and length; a marker's kind, a permit's class, an area's acres. */
function markupMeta(m: Markup): string {
  if (m.shape === "line") return `${m.condition} · ${Math.round(lineFt(m)).toLocaleString("en-US")} ft`;
  const what = [KIND_NAME[m.kind].toLowerCase(), ...(m.septicClass ? [m.septicClass] : [])];
  if (m.shape === "area") what.push(`${(area(areaPolygon(m.ring)) / M2_PER_ACRE).toFixed(2)} ac`);
  return what.join(" · ");
}

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
        {
          id: "house",
          kind: "house",
          name: "Existing house",
          acres: null,
          icon: "house",
          hideable: true,
          deletable: true,
        },
        h,
      ),
    );

  for (const m of p.markup)
    children.push(
      node(
        {
          id: lineLayer(m.id),
          kind: m.shape === "line" ? "line" : "mark",
          name: m.name,
          acres: null,
          meta: markupMeta(m),
          icon: m.kind,
          hideable: false,
          deletable: true,
        },
        h,
      ),
    );

  return node(
    {
      id: "parcel",
      kind: "parcel",
      // The household's name for it (WF1), else the derived one.
      name: p.name.trim() || parcelDisplayName(derived),
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
