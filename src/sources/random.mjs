/**
 * random -- `count` random numbers in [0, 1), re-rolled on demand.
 *
 * Published: random-0 ... random-{count-1}
 *
 * For a whole-page value that JS controls (a shared seed, a "shuffle" button,
 * a reproducible layout). It is not a replacement for the CSS `random()`
 * function, which gives each element its own value and needs no JS where it
 * is supported (Safari 26.2+ at the time of writing); use that for per-element
 * variation and this for a value you need to re-roll or reproduce.
 *
 * Scaling and rounding (the old `multiplier`, `floor`, `ceil` options) are
 * CSS now: `round(down, calc(var(--sig-random-0) * 10), 1)`.
 *
 *   const dice = random({ count: 3, seed: 42 });
 *   signals.use(dice);
 *   dice.reset();   // re-roll
 */
import { number } from "../properties.mjs";

// mulberry32: small, fast, and good enough for visuals.
const seeded = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const random = ({ count = 1, seed } = {}) => {
  const next = seed === undefined ? Math.random : seeded(seed);
  let context = null;
  const roll = () => {
    for (let i = 0; i < count; i++) context.set(`random-${i}`, next());
  };
  return {
    name: "random",
    properties: Object.fromEntries(Array.from({ length: count }, (_, i) => [`random-${i}`, number(0)])),
    start(ctx) {
      context = ctx;
      roll();
    },
    /** Re-roll every value. */
    reset() {
      if (context) roll();
    },
  };
};
