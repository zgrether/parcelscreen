/**
 * Moments when the space's changes must wait (step 6b, polling with no disruption): during a My order drag, so the
 * rows don't reorder under the pointer, and while a text field has focus, so what's being typed isn't replaced. The
 * engine (engine.ts) checks `syncHeld` before it applies a fetch and fetches again once released (a drop, a blur).
 */

let holds = 0;
const released = new Set<() => void>();

/** A drag starts (true) or ends (false): MyOrder.tsx. */
export function holdSync(on: boolean): void {
  holds = Math.max(0, holds + (on ? 1 : -1));
  if (!on && holds === 0) for (const l of released) l();
}

/** Heard when the last hold ends. */
export function onSyncReleased(l: () => void): () => void {
  released.add(l);
  return () => released.delete(l);
}

const TEXT_INPUTS = new Set(["text", "search", "number", "email", "url", "tel", "password", ""]);

/** A field someone is typing in: a textarea, a text input, or anything editable. */
export function editing(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.activeElement;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) return TEXT_INPUTS.has(el.type);
  return el instanceof HTMLElement && el.isContentEditable;
}

/** The space's changes wait: a drag is under way, or a field has focus. */
export const syncHeld = (): boolean => holds > 0 || editing();
