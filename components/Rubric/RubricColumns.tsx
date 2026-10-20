"use client";
/**
 * The priorities page's four columns (step 3, docs/plans/step-3-rubric-editor.md §1, §6; named by the owner, 10/18):
 * Must have, Really want, Nice to have and Don't care (Must, Should, Could and Won't in the code),
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
import { EDITOR_TITLES, isGate, minimumWords, plainLine, TIER_NAMES, type Tier } from "@/lib/rubric/words";

export { TIER_NAMES };

/** A press on a handle this long picks the card up on a phone, ms; a finger may wander this far, px (as My order). */
const LONG_PRESS_MS = 250;
const PRESS_TOLERANCE_PX = 6;

export const TIERS: readonly Tier[] = ["must", "should", "could", "wont"];

/** An empty column's line (plan §6.3), in the columns' own words. Really want's depends on Nice to have. */
export function emptyLine(tier: Tier, columns: Columns): string {
  switch (tier) {
    case "must":
      return "Nothing is a must have, so no parcel is ruled out. Move an item here to make it one.";
    case "should":
      return columns.could.length
        ? "Nothing here: your grade comes from Nice to have alone."
        : "Nothing counts toward the grade. Move an item here.";
    case "could":
      return "Nothing here yet. Drag an item here, or select one and choose Nice to have.";
    case "wont":
      return "Nothing ignored: everything counts. Move an item here to ignore it.";
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
  c.kind === "minimum" ? `${EDITOR_TITLES[c.factor]} limit` : EDITOR_TITLES[c.factor];

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
                open={() => open(card)}
                index={i}
              />
            ))}
          </Column>
        ))}
      </div>
      {/* No drop animation: the card settles where it lands at once. */}
      <DragOverlay dropAnimation={null}>
        {active ? <CardBody card={active} rubric={rubric} lifted /> : null}
      </DragOverlay>
    </DndContext>
  );
}

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
  open,
}: {
  card: EditorCard;
  rubric: Rubric;
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

/**
 * A card: its handle, its title and one plain line (the exact number is in its sheet), and the "limit" badge on a row
 * that also has a limit in Must have. No rank or weight: the order shows the rank, and the weights are in "See what
 * changed" and the rulebook (owner, 10/18).
 */
export function CardBody({
  card,
  rubric,
  open,
  handle,
  lifted,
}: {
  card: EditorCard;
  rubric: Rubric;
  open?: () => void;
  handle?: React.ReactNode;
  lifted?: boolean;
}) {
  const words =
    card.kind === "minimum"
      ? `Limit: ${minimumWords(card.factor, minimumOf(rubric, card.factor).threshold ?? 0)}`
      : plainLine(rubric, card.factor);
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
          {EDITOR_TITLES[card.factor]}
          {card.kind === "factor" && !isGate(card.factor) && hasMinimum(rubric, card.factor) && (
            <span className="rubric-min-badge" title="It also has a limit in Must have">
              also a limit
            </span>
          )}
        </span>
        <span className="rubric-card-words">{words}</span>
      </button>
      {/* Tapping a card opens it (the fresh-eyes review: nothing said a card could be tapped). */}
      <span className="rubric-card-more" aria-hidden="true">
        ›
      </span>
    </div>
  );
}

const minimumOf = (r: Rubric, row: RowKey): MustCard =>
  r.musts.find((m) => m.factor === row && m.threshold !== undefined) ?? { factor: row };
