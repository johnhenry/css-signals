/**
 * input -- form controls as custom properties.
 *
 *   <input type="range" data-signal="volume">   ->  --sig-input-volume: 0.4
 *   <input type="checkbox" data-signal="dark">  ->  --sig-input-dark: 1 | 0
 *   <input type="text" data-signal="name">      ->  --sig-input-name: "Ada"
 *
 * Numbers (range, number inputs) and booleans (checkbox) are registered as
 * `<number>`. Everything else is published as a quoted CSS string, so
 * `content: var(--sig-input-name)` works, and registered with the universal
 * `*` syntax: `<string>` is rejected by WebKit 18, and a string gains nothing
 * from typing (it cannot be transitioned). Values are read once at start, so
 * the properties are right before the user touches anything.
 *
 * Uses one delegated listener on the document, so controls added later work.
 * The attribute is configurable: `input({ attribute: "data-var" })`.
 */
import { number } from "../properties.mjs";

const KEY = /^[A-Za-z0-9_-]+$/;

/** Quote a value as a CSS string. */
export const cssString = (value) =>
  `"${String(value).replace(/[\\"]/g, "\\$&").replace(/\r?\n/g, "\\a ")}"`;

export const input = ({ attribute = "data-signal" } = {}) => ({
  name: "input",
  start({ document: doc, signal, set, define }) {
    const known = new Set();

    const publish = (el) => {
      const name = el.getAttribute?.(attribute);
      if (!name || !KEY.test(name)) return;
      const key = `input-${name}`;

      let value;
      let def = number(0);
      const text = { syntax: "*" };
      if (el.type === "checkbox") {
        value = el.checked;
      } else if (el.type === "range" || el.type === "number") {
        value = el.valueAsNumber;
        if (Number.isNaN(value)) return;
      } else if (el.type === "radio") {
        if (!el.checked) return;
        value = cssString(el.value);
        def = text;
      } else {
        value = cssString(el.value ?? "");
        def = text;
      }

      if (!known.has(key)) {
        define(key, def);
        known.add(key);
      }
      set(key, value);
    };

    doc.addEventListener("input", ({ target }) => publish(target), { passive: true, signal });
    doc.addEventListener("change", ({ target }) => publish(target), { passive: true, signal });
    for (const el of doc.querySelectorAll(`[${attribute}]`)) publish(el);
  },
});
