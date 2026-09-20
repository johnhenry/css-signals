/**
 * gamepad -- buttons and sticks for up to `limit` connected pads.
 *
 * Published, for pad index `i` (0-based):
 *
 *   gamepad-{i}-connected      0 | 1
 *   gamepad-{i}-button-{j}     0..1   (analog triggers report their travel; digital buttons 0 or 1)
 *   gamepad-{i}-axis-{j}       -1..1  (values inside `deadzone` read as 0)
 *
 * Button and axis properties are registered when a pad first reports them,
 * because their count depends on the hardware. Read them with a fallback:
 * `var(--sig-gamepad-0-axis-0, 0)`.
 *
 * Polling runs on animation frames, and only while at least one pad is
 * connected, so an idle page costs nothing. (The module this replaces polled
 * on a 50 ms timer forever.) Browsers do not report a pad until the user has
 * pressed a button on it.
 *
 * Dropped from the original: the pad `id` string.
 */
import { number } from "../properties.mjs";

export const gamepad = ({ limit = 4, deadzone = 0.05 } = {}) => ({
  name: "gamepad",
  properties: Object.fromEntries(
    Array.from({ length: limit }, (_, i) => [`gamepad-${i}-connected`, number(0)])
  ),
  start({ window: win, signal, set, define }) {
    const known = new Set();
    const written = new Map(); // pad index -> keys published, so a disconnect can zero them
    let frame = null;

    const publish = (index, key, value) => {
      if (!known.has(key)) {
        define(key, number(0));
        known.add(key);
      }
      if (!written.has(index)) written.set(index, new Set());
      written.get(index).add(key);
      set(key, value);
    };

    const poll = () => {
      frame = null;
      let connected = false;
      for (const pad of win.navigator.getGamepads?.() ?? []) {
        if (!pad?.connected || pad.index >= limit) continue;
        connected = true;
        const i = pad.index;
        publish(i, `gamepad-${i}-connected`, 1);
        pad.buttons.forEach((button, j) => publish(i, `gamepad-${i}-button-${j}`, button.value));
        pad.axes.forEach((axis, j) =>
          publish(i, `gamepad-${i}-axis-${j}`, Math.abs(axis) < deadzone ? 0 : axis)
        );
      }
      if (connected) frame = win.requestAnimationFrame(poll);
    };

    win.addEventListener("gamepadconnected", () => frame === null && poll(), { signal });
    win.addEventListener(
      "gamepaddisconnected",
      ({ gamepad: pad }) => {
        for (const key of written.get(pad.index) ?? []) set(key, 0);
        written.delete(pad.index);
      },
      { signal }
    );
    signal.addEventListener("abort", () => frame !== null && win.cancelAnimationFrame(frame), {
      once: true,
    });
    poll();
  },
});
