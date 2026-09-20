/**
 * css.mjs -- static CSS for a prefix.
 *
 * The runtime registers properties and installs native CSS itself, so most
 * pages never need this. It exists for the JS-free case: emit the `@property`
 * rules (and any native CSS a source provides) for a chosen prefix, write
 * them to a file, and link it.
 *
 * Because CSS cannot compute a custom property's name, a different prefix
 * means different text. Generate it, do not hand-edit it.
 */
import { propertyName, propertyRule } from "./properties.mjs";

/**
 * @param {string} prefix
 * @param {Array<{ properties?: object, css?: (prefix: string) => string }>} sources
 */
export const sourcesCss = (prefix, sources) => {
  const rules = [];
  for (const source of sources) {
    for (const [key, def] of Object.entries(source.properties ?? {})) {
      rules.push(propertyRule(prefix, key, def));
    }
  }
  for (const source of sources) {
    if (typeof source.css === "function") rules.push(source.css(prefix));
  }
  return `${rules.join("\n\n")}\n`;
};

/**
 * Small CSS functions for working with signal values. Each is named from the
 * prefix like everything else (`--sig-progress()`, `--sig-map()`, ...).
 *
 * `@function` is not yet in every browser, and the obvious fallback does NOT
 * work. A declaration that contains `var()` is only checked at computed-value
 * time, so where `@function` is missing this
 *
 *   width: calc(...);
 *   width: --sig-map(var(--sig-pointer-x), 0, 1000, 0px, 400px);   // BAD
 *
 * does not fall back to the line above: the second one is invalid at
 * computed-value time and the property becomes `unset`. Gate it with
 * `@supports` instead, using a literal call with no `var()` in it (Firefox
 * parses `var()` lazily and would report support it does not have):
 *
 *   .bar { width: calc(...); }
 *   @supports (width: --sig-map(1, 0, 1, 0px, 1px)) {
 *     .bar { width: --sig-map(var(--sig-pointer-x), 0, 1000, 0px, 400px); }
 *   }
 */
export const functionsCss = (prefix) => {
  const fn = (name) => propertyName(prefix, name);
  return `@layer css-signals {
  /* Where v sits between min and max, clamped to 0..1. */
  @function ${fn("progress")}(--v <number>, --min <number>, --max <number>) returns <number> {
    result: clamp(0, calc((var(--v) - var(--min)) / (var(--max) - var(--min))), 1);
  }

  /* Interpolate a -> b by t. a and b can be any matching type (numbers, lengths, ...). */
  @function ${fn("lerp")}(--a, --b, --t <number>) {
    result: calc(var(--a) + (var(--b) - var(--a)) * var(--t));
  }

  /* Remap v from [in-min, in-max] onto [out-min, out-max] (not clamped). */
  @function ${fn("map")}(--v <number>, --in-min <number>, --in-max <number>, --out-min, --out-max) {
    result: calc(var(--out-min) + (var(--out-max) - var(--out-min)) * (var(--v) - var(--in-min)) / (var(--in-max) - var(--in-min)));
  }
}
`;
};

export { propertyRule } from "./properties.mjs";
export { nativeScrollCss } from "./sources/scroll.mjs";
