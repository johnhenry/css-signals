/**
 * viewport -- the window's size as unitless numbers.
 *
 * Published:
 *
 *   viewport-width, viewport-height     px, as plain numbers
 *
 * CSS already has viewport *units* (`100vw`, `100dvh`) and container queries
 * for anything that needs a length. This source exists for the one thing units
 * cannot do: hand `calc()`, a typed `@function`, or a `counter()` a bare
 * number such as 1280.
 */
import { number } from "../properties.mjs";

export const viewport = () => ({
  name: "viewport",
  properties: {
    "viewport-width": number(0),
    "viewport-height": number(0),
  },
  start({ window: win, signal, set }) {
    const update = () => {
      set("viewport-width", win.innerWidth);
      set("viewport-height", win.innerHeight);
    };
    win.addEventListener("resize", update, { passive: true, signal });
    update();
  },
});
