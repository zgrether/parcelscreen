"use client";
/**
 * My order's drag and its menu (WF3, docs/plans/parcel-workflow.md §5): rows and cards move by their handle, with a
 * mouse, a long press on a phone, or the keyboard (Space to pick up, the arrows, Space to drop), through @dnd-kit; and
 * each has Move up and Move down in a small menu, for the keyboard and screen readers. Only in My order: under another
 * sort the handles hide. The list (Library.tsx) turns a drop into one parcel's new rank (lib/client/myOrder.ts).
 */
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/** A press on a handle this long picks the row up on a phone, ms: shorter than a name's long press (LongName). */
const LONG_PRESS_MS = 250;
/** How far a finger may wander during it, px, before it's a scroll instead. */
const PRESS_TOLERANCE_PX = 6;

/** Rows move up and down only. */
const vertically: Modifier = ({ transform }) => ({ ...transform, x: 0 });

export interface Mover {
  /** Moves a parcel to this place among the rows shown. */
  move(key: string, to: number): void;
}

/** The rows that can move: their keys in the order shown, and each one's name for what a screen reader is told. */
export function SortableRows({
  keys,
  names,
  mover,
  children,
}: {
  keys: string[];
  names: ReadonlyMap<string, string>;
  mover: Mover;
  children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: LONG_PRESS_MS, tolerance: PRESS_TOLERANCE_PX } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const name = (id: string | number) => names.get(String(id)) ?? "the parcel";
  const place = (id: string | number) => `${keys.indexOf(String(id)) + 1} of ${keys.length}`;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${name(active.id)}, at ${place(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `${name(active.id)} is at ${place(over.id)}.` : `${name(active.id)} is off the list.`,
    onDragEnd: ({ active, over }) =>
      over ? `${name(active.id)} dropped at ${place(over.id)}.` : `${name(active.id)} put back.`,
    onDragCancel: ({ active }) => `${name(active.id)} put back.`,
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) mover.move(String(active.id), keys.indexOf(String(over.id)));
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[vertically]}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            "To move a parcel in your order, press Space or Enter, then the up and down arrows; Space or Enter puts it down, Escape puts it back.",
        },
      }}
    >
      <SortableContext items={keys} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

/** A row's or card's part in the drag: where it sits while it moves, and its handle. */
export function useSortableRow(key: string, ordering: boolean) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: key, disabled: !ordering });
  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition };
  return {
    nodeProps: { ref: setNodeRef, style },
    dragging: isDragging,
    handleProps: { ref: setActivatorNodeRef, ...attributes, ...listeners },
  };
}

type HandleProps = ReturnType<typeof useSortableRow>["handleProps"];

/** The grip: a drag starts here, never on the row (a tap on the row opens it). */
export function DragHandle({ name, handle }: { name: string; handle: HandleProps }) {
  return (
    <button
      type="button"
      className="lib-handle"
      aria-label={`Move ${name} in your order`}
      {...handle}
      onClick={(e) => e.stopPropagation()}
    >
      ⠿
    </button>
  );
}

/** Room a menu needs below its button before it opens upward instead, px. */
const MENU_ROOM_PX = 100;

/**
 * Where the menu opens: against the window, so the table's scroll box doesn't cut it off. Under its button, or above it
 * near the bottom of the screen; lined up with the button's left edge, or its right edge in the right half.
 */
function menuPlace(button: HTMLElement): CSSProperties {
  const r = button.getBoundingClientRect();
  const below = window.innerHeight - r.bottom > MENU_ROOM_PX;
  return {
    position: "fixed",
    ...(below ? { top: r.bottom + 2 } : { bottom: window.innerHeight - r.top + 2 }),
    ...(r.left > window.innerWidth / 2 ? { right: window.innerWidth - r.right } : { left: r.left }),
  };
}

/** Move up and Move down, at the row's place among those shown; the button keeps the focus after a move. */
export function OrderMenu({
  name,
  index,
  count,
  move,
}: {
  name: string;
  index: number;
  count: number;
  move(to: number): void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<CSSProperties | null>(null);
  const open = at !== null;
  const setOpen = (o: boolean) => setAt(o && button.current ? menuPlace(button.current) : null);
  // It stays where it opened: a scroll or a resize closes it rather than leave it behind.
  useEffect(() => {
    if (!open) return;
    const close = () => setAt(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);
  const go = (to: number) => {
    setOpen(false);
    move(to);
    // A moved row's elements can lose the focus as the list reorders: give it back.
    requestAnimationFrame(() => button.current?.focus());
  };
  return (
    <span
      className="lib-order-menu"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape" && open) {
          setOpen(false);
          button.current?.focus();
        }
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        className="lib-handle"
        aria-label={`Order: ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        ⋯
      </button>
      {open && (
        <span className="lib-menu" role="menu" style={at}>
          <button type="button" role="menuitem" disabled={index === 0} onClick={() => go(index - 1)}>
            Move up
          </button>
          <button type="button" role="menuitem" disabled={index === count - 1} onClick={() => go(index + 1)}>
            Move down
          </button>
        </span>
      )}
    </span>
  );
}
