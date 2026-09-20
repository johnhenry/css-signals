/**
 * keyboard -- which keys are held.
 *
 * Published:
 *
 *   key-alt, key-ctrl, key-meta, key-shift     0 | 1
 *   key-{code}                                 0 | 1, e.g. key-KeyW, key-ArrowLeft, key-Space
 *
 * `code` is the physical key (KeyboardEvent.code), so WASD works on any
 * layout. Codes are registered the first time they are pressed. To read a key
 * before it has ever been pressed, either list it in `keys` (registered up
 * front with an initial 0) or write `var(--sig-key-KeyW, 0)`.
 *
 * Chords need no per-combination variables: `calc(var(--sig-key-ctrl) *
 * var(--sig-key-KeyS))` is 1 only while both are down.
 *
 * Held keys are released when the window loses focus or the tab is hidden,
 * and when Meta is released (macOS never sends keyup for other keys pressed
 * under Meta). Otherwise those keys would read as pressed forever.
 */
import { number } from "../properties.mjs";

const MODIFIERS = { altKey: "key-alt", ctrlKey: "key-ctrl", metaKey: "key-meta", shiftKey: "key-shift" };
const CODE = /^[A-Za-z0-9_-]+$/;

export const keyboard = ({ keys = [] } = {}) => ({
  name: "keyboard",
  properties: {
    ...Object.fromEntries(Object.values(MODIFIERS).map((key) => [key, number(0)])),
    ...Object.fromEntries(keys.map((code) => [`key-${code}`, number(0)])),
  },
  start({ document: doc, window: win, signal, set, define }) {
    const held = new Set();
    const known = new Set(keys);

    const modifiers = (event) => {
      for (const [flag, key] of Object.entries(MODIFIERS)) set(key, Boolean(event[flag]));
    };
    const press = (code, on) => {
      if (!code || !CODE.test(code)) return;
      if (!known.has(code)) {
        define(`key-${code}`, number(0));
        known.add(code);
      }
      if (on) held.add(code);
      else held.delete(code);
      set(`key-${code}`, on);
    };
    const releaseAll = () => {
      for (const code of held) set(`key-${code}`, 0);
      held.clear();
      for (const key of Object.values(MODIFIERS)) set(key, 0);
    };

    doc.addEventListener(
      "keydown",
      (event) => {
        modifiers(event);
        press(event.code, true);
      },
      { signal }
    );
    doc.addEventListener(
      "keyup",
      (event) => {
        modifiers(event);
        press(event.code, false);
        if (event.key === "Meta") releaseAll();
      },
      { signal }
    );
    win.addEventListener("blur", releaseAll, { signal });
    doc.addEventListener("visibilitychange", () => doc.hidden && releaseAll(), { signal });
  },
});
