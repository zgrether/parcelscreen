"use client";
/**
 * The rubric editor's four columns (step 3, docs/plans/step-3-rubric-editor.md §1, §6): Must, Should, Could and Won't,
 * each a sortable list, and each a drop target even when it's empty. A card moves by its handle, with a mouse, a long
 * press on a phone, or the keyboard (Space to pick up, the arrows, Space to drop), through @dnd-kit, as My order's rows
 * do (components/Library/MyOrder.tsx); a tap on the card opens its sheet, whose "Move to…" does the same without
 * dragging. A drop becomes one `moveCard` (lib/rubric/edit.ts), which applies the columns' rules.
 */
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import { columnsOf, hasMinimum, type Columns, type EditorCard } from "@/lib/rubric/edit";
import type { Factor, MustCard, RowKey, Rubric } from "@/lib/rubric/types";
import { weightsOf } from "@/lib/rubric/weights";
import { cardLine, FACTOR_LABELS, isGate, minimumLine, type Tier } from "@/lib/rubric/words";

/** A press on a handle this long picks the card up on a phone, ms; a finger may wander this far, px (as My order). */
const LONG_PRESS_MS = 250;
const PRESS_TOLERANCE_PX = 6;

export const TIERS: readonly Tier[] = ["must", "should", "could", "wont"];

export const TIER_NAMES: Record<Tier, string> = {
  must: "Must",
  should: "Should",
  could: "Could",
  wont: "Won't",
};

/** Each column's rule, in a few words, under its name. */
export const TIER_RULES: Record<Tier, string> = {
  must: "A fail is a Pass",
  should: "Counts in your grade, by rank",
  could: "Counts at three quarters",
  wont: "Left out of your grade",
};

/** An empty column's line (plan §6.3). Should's depends on Could. */
export function emptyLine(tier: Tier, columns: Columns): string {
  switch (tier) {
    case "must":
      return "No dealbreakers: any parcel can be a Contender. Move a card here to make it one.";
    case "should":
      return columns.could.length
        ? "Nothing ranked first. Your grade comes from Could alone."
        : "Nothing counts toward a grade: move a card to Should.";
    case "could":
      return "Nothing here. Drag a card here, or tap one and choose Move to… Could.";
    case "wont":
      return "Everything counts. Move a card here to leave it out of your grade.";
  }
}

export const cardId = (c: EditorCard): string => `${c.kind === "minimum" ? "min" : "card"}:${c.factor}`;

export const cardFromId = (id: string): EditorCard => {
  const [kind, factor] = id.split(":") as [string, string];
  return kind === "min"
    ? { kind: "minimum", factor: factor as RowKey }
    : { kind: "factor", factor: factor as Factor };
};

/** The card's name for a screen reader and its title. */
export const cardName = (c: EditorCard): string =>
  c.kind === "minimum" ? `${FACTOR_LABELS[c.factor]} minimum` : FACTOR_LABELS[c.factor];

/** Where a card or a column is: its tier, and its place in the tier's list (the end, for the column itself). */
function placeOf(columns: Columns, id: string): { tier: Tier; index: number } | null {
  if (id.startsWith("col:")) {
    const tier = id.slice(4) as Tier;
    return { tier, index: columns[tier].length };
  }
  for (const tier of TIERS) {
    const i = columns[tier].findIndex((c) => cardId(c) === id);
    if (i >= 0) return { tier, index: i };
  }
  return null;
}

export function RubricColumns({
  rubric,
  move,
  open,
  onHover,
}: {
  rubric: Rubric;
  move(card: EditorCard, to: Tier, index?: number): void;
  /** A tap on a card: its sheet. */
  open(card: EditorCard): void;
  /** Where a held card would land, for the preview (PR 3); null when it's dropped or put back. */
  onHover?: (hover: { card: EditorCard; tier: Tier; index: number } | null) => void;
}) {
  const columns = columnsOf(rubric);
  const [active, setActive] = useState<EditorCard | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: LONG_PRESS_MS, tolerance: PRESS_TOLERANCE_PX } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const describe = (id: string | number) => {
    const at = placeOf(columns, String(id));
    return at ? `${TIER_NAMES[at.tier]}, place ${at.index + 1}` : "off the columns";
  };
  const announcements: Announcements = {
    onDragStart: ({ active: a }) => `Picked up ${cardName(cardFromId(String(a.id)))}, in ${describe(a.id)}.`,
    onDragOver: ({ active: a, over }) =>
      over ? `${cardName(cardFromId(String(a.id)))} is over ${describe(over.id)}.` : "Off the columns.",
    onDragEnd: ({ active: a, over }) =>
      over ? `${cardName(cardFromId(String(a.id)))} dropped in ${describe(over.id)}.` : "Put back.",
    onDragCancel: ({ active: a }) => `${cardName(cardFromId(String(a.id)))} put back.`,
  };
  const onStart = ({ active: a }: DragStartEvent) => setActive(cardFromId(String(a.id)));
  const onOver = ({ active: a, over }: DragOverEvent) => {
    const at = over ? placeOf(columns, String(over.id)) : null;
    onHover?.(at ? { card: cardFromId(String(a.id)), ...at } : null);
  };
  const onEnd = ({ active: a, over }: DragEndEvent) => {
    setActive(null);
    onHover?.(null);
    if (!over || a.id === over.id) return;
    const at = placeOf(columns, String(over.id));
    if (at) move(cardFromId(String(a.id)), at.tier, at.index);
  };
  const w = weightsOf(rubric);
  const total = Object.values(w).reduce((x, y) => x + y, 0) || 1;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onStart}
      onDragOver={onOver}
      onDragEnd={onEnd}
      onDragCancel={() => {
        setActive(null);
        onHover?.(null);
      }}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            "To move a card, press Space or Enter, then the arrow keys; Space or Enter puts it down, Escape puts it back. Or open the card and choose Move to.",
        },
      }}
    >
      <div className="rubric-columns">
        {TIERS.map((tier) => (
          <Column key={tier} tier={tier} columns={columns}>
            {columns[tier].map((card, i) => (
              <SortableCard
                key={cardId(card)}
                card={card}
                rubric={rubric}
                rank={tier === "should" || tier === "could" ? rankOf(rubric, card) : null}
                weight={
                  card.kind === "factor" && !isGate(card.factor) && (tier === "should" || tier === "could")
                    ? (w[card.factor] / total) * 100
                    : null
                }
                open={() => open(card)}
                index={i}
              />
            ))}
          </Column>
        ))}
      </div>
      {/* No drop animation: the card settles where it lands at once. */}
      <DragOverlay dropAnimation={null}>
        {active ? (
          <CardBody card={active} rubric={rubric} rank={rankOf(rubric, active)} weight={null} lifted />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

const rankOf = (r: Rubric, c: EditorCard): number | null => {
  if (c.kind !== "factor") return null;
  const i = r.ranked.findIndex((x) => x.factor === c.factor);
  return i >= 0 ? i + 1 : null;
};

function Column({ tier, columns, children }: { tier: Tier; columns: Columns; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${tier}` });
  const cards = columns[tier];
  return (
    <section
      className={`rubric-col rubric-col-${tier}${isOver ? " over" : ""}`}
      aria-label={TIER_NAMES[tier]}
    >
      <header className="rubric-col-head">
        <h2>
          {TIER_NAMES[tier]} <span className="muted">{cards.length}</span>
        </h2>
        <p className="tiny muted">{TIER_RULES[tier]}</p>
      </header>
      <SortableContext items={cards.map(cardId)} strategy={verticalListSortingStrategy}>
        <ol ref={setNodeRef} className="rubric-list">
          {children}
          {cards.length === 0 && <li className="rubric-empty">{emptyLine(tier, columns)}</li>}
        </ol>
      </SortableContext>
    </section>
  );
}

function SortableCard({
  card,
  rubric,
  rank,
  weight,
  open,
}: {
  card: EditorCard;
  rubric: Rubric;
  rank: number | null;
  weight: number | null;
  open(): void;
  index: number;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: cardId(card) });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`rubric-card-li${isDragging ? " dragging" : ""}`}
    >
      <CardBody
        card={card}
        rubric={rubric}
        rank={rank}
        weight={weight}
        open={open}
        handle={
          <button
            type="button"
            className="rubric-handle"
            aria-label={`Move ${cardName(card)}`}
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
          >
            ⠿
          </button>
        }
      />
    </li>
  );
}

/** A card: its handle, its name and words, its rank and weight, and the "min" badge on a row with a minimum. */
export function CardBody({
  card,
  rubric,
  rank,
  weight,
  open,
  handle,
  lifted,
}: {
  card: EditorCard;
  rubric: Rubric;
  rank: number | null;
  weight: number | null;
  open?: () => void;
  handle?: React.ReactNode;
  lifted?: boolean;
}) {
  const words =
    card.kind === "minimum" ? minimumLine(minimumOf(rubric, card.factor)) : cardLine(rubric, card.factor);
  return (
    <div className={`rubric-card${lifted ? " lifted" : ""}${card.kind === "minimum" ? " minimum" : ""}`}>
      {handle ?? (
        <span className="rubric-handle" aria-hidden="true">
          ⠿
        </span>
      )}
      <button
        type="button"
        className="rubric-card-body"
        onClick={open}
        aria-label={`${cardName(card)}: ${words}`}
      >
        <span className="rubric-card-name">
          {card.kind === "minimum" ? "Minimum" : FACTOR_LABELS[card.factor]}
          {card.kind === "factor" && !isGate(card.factor) && hasMinimum(rubric, card.factor) && (
            <span className="rubric-min-badge" title="Also a minimum in Must">
              min
            </span>
          )}
        </span>
        <span className="rubric-card-words">{words}</span>
      </button>
      {rank !== null && (
        <span className="rubric-card-rank tiny muted">
          #{rank}
          {weight !== null && ` · ${Math.round(weight)}%`}
        </span>
      )}
    </div>
  );
}

const minimumOf = (r: Rubric, row: RowKey): MustCard =>
  r.musts.find((m) => m.factor === row && m.threshold !== undefined) ?? { factor: row };
