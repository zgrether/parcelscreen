/**
 * Tilt and rotate with the mouse, as in Google Earth on the web (owner, 2026-10-10): a double-click and drag, or a
 * middle-button drag, tilts (drag up and down) and rotates (drag left and right) around the point pressed. A
 * double-click without a drag zooms in toward the point, which is what Google Earth does (checked there: one
 * level closer, tilt unchanged). MapLibre's own right-drag and Ctrl+drag stay as further ways to tilt and rotate,
 * and its double-click zoom stays off (ParcelTools turns it off: Draw finishes a boundary with a double-click).
 *
 * Mouse only: touch keeps MapLibre's two-finger tilt and rotate. Stands aside while a tool is open (`toolOpen`).
 *
 * A click on the map waits out the double-click window before it reaches the map (owner, 2026-10-10: the first
 * click of a double-click selected the parcel, and its zoom-to-parcel ran under the gesture). If a second press
 * comes, the click is dropped: a double-click never selects. Otherwise it's delivered as it was, 400 ms late.
 * While a gesture runs, a ring marks the point it turns around, as Google Earth's does.
 */
import type { LngLat, Map as MlMap, PaddingOptions } from "maplibre-gl";

/** A second press within this long, and this close, after a release makes a double-click. */
const DOUBLE_MS = 400;
const DOUBLE_PX = 6;
/** Movement before a press counts as a drag. */
const DRAG_PX = 3;
/** Degrees per pixel dragged: tilt (up tilts toward the horizon) and rotate (right turns the map clockwise). */
const TILT_PER_PX = 0.5;
const ROTATE_PER_PX = 0.5;

/** Whether a press continues a double-click: soon enough after the last release, and close enough to it. */
export function isDoublePress(
  last: { t: number; x: number; y: number } | null,
  now: { t: number; x: number; y: number },
): boolean {
  return !!last && now.t - last.t <= DOUBLE_MS && Math.hypot(now.x - last.x, now.y - last.y) <= DOUBLE_PX;
}

/** The camera for a drag of (dx, dy) pixels from where it started: up tilts toward the horizon, right turns clockwise. */
export function draggedCamera(
  start: { bearing: number; pitch: number },
  dx: number,
  dy: number,
  maxPitch: number,
): { bearing: number; pitch: number } {
  return {
    pitch: Math.max(0, Math.min(maxPitch, start.pitch - dy * TILT_PER_PX)),
    bearing: start.bearing + dx * ROTATE_PER_PX,
  };
}

interface Gesture {
  x: number;
  y: number;
  anchor: LngLat;
  bearing: number;
  pitch: number;
  moved: boolean;
  /** From a double-click: a release without a drag zooms in. A middle-button press never does. */
  zoomOnRelease: boolean;
  /** Set once the drag starts: the view's own padding and ground clamping, restored on release. */
  orbit?: { padding: PaddingOptions; clamped: boolean };
}

/**
 * Padding that puts the view's centre at (x, y) in a w × h map: the camera then orbits that point when only the tilt
 * and bearing change, as Google Earth's does, at a constant distance. (Panning the pressed point back under the
 * pointer after each change instead re-seated the camera on the 3D terrain under every new centre, which read as a
 * zoom; owner, 2026-10-10.)
 */
export function paddingCentredAt(x: number, y: number, w: number, h: number): PaddingOptions {
  return {
    left: Math.max(0, 2 * x - w),
    right: Math.max(0, w - 2 * x),
    top: Math.max(0, 2 * y - h),
    bottom: Math.max(0, h - 2 * y),
  };
}

export function installTiltRotate(map: MlMap, toolOpen: () => boolean): () => void {
  const box = map.getContainer();
  let lastUp: { t: number; x: number; y: number } | null = null;
  let pointerIsMouse = true;
  let gesture: Gesture | null = null;
  /** Swallow the click and dblclick the browser sends after a gesture's release. */
  let swallowUntil = 0;
  /** A map click held back for the double-click window, and whether one is being delivered now. */
  let pending: ReturnType<typeof setTimeout> | null = null;
  let delivering = false;
  /** The ring at the point a gesture turns around. */
  let ring: HTMLElement | null = null;
  /** Clamps the centre to the ground again once the map is flat (the next time it settles at under half a degree). */
  let waitingFlat = false;
  const reclamp = () => {
    if (map.getPitch() >= 0.5) return;
    map.setCenterClampedToGround(true);
    map.off("moveend", reclamp);
    waitingFlat = false;
  };
  const reclampWhenFlat = () => {
    if (!waitingFlat) map.on("moveend", reclamp);
    waitingFlat = true;
    reclamp();
  };
  const dropPending = () => {
    if (pending) clearTimeout(pending);
    pending = null;
  };

  const local = (e: MouseEvent) => {
    const r = box.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onCanvas = (e: Event) => e.target instanceof HTMLCanvasElement;

  const start = (e: MouseEvent, zoomOnRelease: boolean) => {
    const { x, y } = local(e);
    gesture = {
      x,
      y,
      anchor: map.unproject([x, y]),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
      moved: false,
      zoomOnRelease,
    };
    // MapLibre mustn't also start a pan from this press, nor the browser a text selection or autoscroll; and
    // nothing still easing (a fit, inertia) may move the map under the gesture.
    e.preventDefault();
    e.stopImmediatePropagation();
    dropPending();
    map.stop();
    ring = document.createElement("div");
    ring.className = "tilt-anchor";
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    box.appendChild(ring);
    window.addEventListener("mousemove", move, true);
    window.addEventListener("mouseup", end, true);
  };

  const move = (e: MouseEvent) => {
    const g = gesture;
    if (!g) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const { x, y } = local(e);
    const dx = x - g.x,
      dy = y - g.y;
    if (!g.moved && Math.hypot(dx, dy) < DRAG_PX) return;
    if (!g.moved) {
      // The pressed point becomes the camera's centre, where it already is on screen, at its own ground height and
      // held there (not re-clamped to the ground under it as the view turns).
      g.orbit = { padding: map.getPadding(), clamped: map.getCenterClampedToGround() || waitingFlat };
      const { clientWidth: w, clientHeight: h } = box;
      const elevation = map.queryTerrainElevation(g.anchor);
      map.setCenterClampedToGround(false);
      map.jumpTo({
        center: g.anchor,
        padding: paddingCentredAt(g.x, g.y, w, h),
        ...(elevation != null ? { elevation } : {}),
      });
    }
    g.moved = true;
    map.jumpTo(draggedCamera(g, dx, dy, map.getMaxPitch()));
  };

  const end = (e: MouseEvent) => {
    const g = gesture;
    window.removeEventListener("mousemove", move, true);
    window.removeEventListener("mouseup", end, true);
    gesture = null;
    ring?.remove();
    ring = null;
    if (!g) return;
    e.stopImmediatePropagation();
    if (g.orbit) {
      // Back to the view's own padding, with the pressed point kept under the pointer (MapLibre places it the way its
      // own handlers do, in the same frame). The centre stays unclamped while the map is tilted: clamping it to the
      // 3D terrain under the new centre moved the camera, a jump of up to ~60 px (measured on Grayson, 2026-10-10).
      // Google Earth doesn't re-seat the camera either. It's clamped again once the map is flat.
      map.jumpTo({ padding: g.orbit.padding });
      map.jumpTo(
        map.calculateAnchoredCameraOptions({ anchorLocation: g.anchor, anchorScreenPoint: [g.x, g.y] }),
      );
      if (g.orbit.clamped) reclampWhenFlat();
    }
    swallowUntil = performance.now() + DOUBLE_MS;
    lastUp = null;
    if (!g.moved && g.zoomOnRelease) map.easeTo({ zoom: map.getZoom() + 1, around: g.anchor, duration: 300 });
  };

  const pointerDown = (e: PointerEvent) => {
    pointerIsMouse = e.pointerType === "mouse";
  };

  const mouseDown = (e: MouseEvent) => {
    if (!pointerIsMouse || !onCanvas(e) || toolOpen()) return;
    const { x, y } = local(e);
    if (e.button === 1) return start(e, false);
    if (e.button !== 0 || e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
    if (isDoublePress(lastUp, { t: performance.now(), x, y })) start(e, true);
  };

  const mouseUp = (e: MouseEvent) => {
    if (e.button !== 0 || !pointerIsMouse || !onCanvas(e)) return;
    const { x, y } = local(e);
    lastUp = { t: performance.now(), x, y };
  };

  const swallow = (e: MouseEvent) => {
    if (performance.now() <= swallowUntil) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };

  /** A plain click on the map: held for the double-click window, then delivered unless a second press came. */
  const click = (e: MouseEvent) => {
    if (delivering) return;
    if (performance.now() <= swallowUntil) return swallow(e);
    if (!pointerIsMouse || !onCanvas(e) || toolOpen() || e.button !== 0) return;
    e.stopImmediatePropagation();
    const target = e.target as HTMLElement;
    const init: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      view: window,
      detail: 1,
      clientX: e.clientX,
      clientY: e.clientY,
      screenX: e.screenX,
      screenY: e.screenY,
      button: e.button,
      buttons: e.buttons,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey,
    };
    dropPending();
    pending = setTimeout(() => {
      pending = null;
      delivering = true;
      try {
        target.dispatchEvent(new MouseEvent("click", init));
      } finally {
        delivering = false;
      }
    }, DOUBLE_MS);
  };

  // The middle button's autoscroll starts on mousedown in some browsers; auxclick would open links.
  const noAux = (e: MouseEvent) => {
    if (e.button === 1 && onCanvas(e)) e.preventDefault();
  };

  // Capture on the map's container: these run before MapLibre's own handlers, on the canvas container inside it.
  box.addEventListener("pointerdown", pointerDown, true);
  box.addEventListener("mousedown", mouseDown, true);
  box.addEventListener("mouseup", mouseUp, true);
  box.addEventListener("click", click, true);
  box.addEventListener("dblclick", swallow, true);
  box.addEventListener("auxclick", noAux, true);
  return () => {
    box.removeEventListener("pointerdown", pointerDown, true);
    box.removeEventListener("mousedown", mouseDown, true);
    box.removeEventListener("mouseup", mouseUp, true);
    box.removeEventListener("click", click, true);
    dropPending();
    ring?.remove();
    map.off("moveend", reclamp);
    box.removeEventListener("dblclick", swallow, true);
    box.removeEventListener("auxclick", noAux, true);
    window.removeEventListener("mousemove", move, true);
    window.removeEventListener("mouseup", end, true);
  };
}
