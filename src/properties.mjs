/**
 * properties.mjs -- helpers for declaring the typed custom properties a
 * source publishes.
 *
 * Every published property is *registered* (`CSS.registerProperty` at
 * runtime, `@property` in generated CSS). Registration gives each one a
 * syntax and an initial value, so:
 *
 *   - a stylesheet reads a sane value before any JS has run, instead of the
 *     "guaranteed-invalid" state an unregistered `var()` falls back from;
 *   - the value is typed, so `calc()` and typed `@function` parameters accept
 *     it as a number;
 *   - it can be transitioned or animated, which unregistered custom
 *     properties cannot.
 *
 * `inherits` defaults to true because signals are written on a root element
 * and read by descendants.
 */

/** A unitless `<number>` property. */
export const number = (initialValue = 0) => ({
  syntax: "<number>",
  initialValue,
  inherits: true,
});

/**
 * Resolve a property name from a prefix and a key.
 * An empty prefix yields an unprefixed name: `--key`.
 */
export const propertyName = (prefix, key) =>
  prefix ? `--${prefix}-${key}` : `--${key}`;

/**
 * Serialize one registration as an `@property` rule.
 * `key` is the unprefixed name; `def` is a `{ syntax, initialValue, inherits }`.
 */
export const propertyRule = (prefix, key, def) => {
  const { syntax = "*", initialValue, inherits = true } = def;
  const lines = [`  syntax: "${syntax}";`, `  inherits: ${inherits};`];
  if (initialValue !== undefined) {
    lines.push(`  initial-value: ${initialValue};`);
  }
  return `@property ${propertyName(prefix, key)} {\n${lines.join("\n")}\n}`;
};
