/**
 * pointer -- where the pointer is, and whether it is down.
 *
 * Published (unprefixed keys; the prefix is applied by the core):
 *
 *   pointer-x, pointer-y                 px, client coordinates
 *   pointer-x-progress, pointer-y-progress   0..1 across the viewport
 *   pointer-down                         0 | 1
 *   pointer-inside                       0 | 1
 *
 * Deliberately NOT published: angle and magnitude from the origin. Those are
 * pure functions of x and y, and CSS computes them natively with `atan2()`
 * and `hypot()`. Publishing them from JS would only add writes.
 *
 * Uses Pointer Events, so touch and pen work, not just a mouse. Writes are
 * coalesced to one per animation frame by the core.
 */
import { number } from "../properties.mjs";

export const pointer = () => ({
  name: "pointer",
  properties: {
    "pointer-x": number(0),
    "pointer-y": number(0),
    "pointer-x-progress": number(0.5),
    "pointer-y-progress": number(0.5),
    "pointer-down": number(0),
    "pointer-inside": number(0),
  },
  start({ document: doc, window: win, signal, set }) {
    const listen = (target, type, handler) =>
      target.addEventListener(type, handler, { passive: true, signal });

    const ratio = (value, size) => (size > 0 ? Math.min(1, Math.max(0, value / size)) : 0);

    listen(doc, "pointermove", ({ clientX, clientY }) => {
      set("pointer-x", clientX);
      set("pointer-y", clientY);
      set("pointer-x-progress", ratio(clientX, win.innerWidth));
      set("pointer-y-progress", ratio(clientY, win.innerHeight));
      set("pointer-inside", 1);
    });
    listen(doc, "pointerdown", () => set("pointer-down", 1));
    listen(doc, "pointerup", () => set("pointer-down", 0));
    listen(doc, "pointercancel", () => set("pointer-down", 0));
    listen(doc.documentElement, "pointerenter", () => set("pointer-inside", 1));
    listen(doc.documentElement, "pointerleave", () => set("pointer-inside", 0));
  },
});
