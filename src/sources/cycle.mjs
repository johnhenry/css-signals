/**
 * cycle -- click an element to step a property through a list of values.
 *
 *   <button data-signal-cycle="accent" data-signal-values="red;green;blue">Next</button>
 *
 *   --sig-cycle-accent: red        the current value, exactly as written
 *   --sig-cycle-accent-index: 0    its position (0-based, `<number>`)
 *
 * The first value is published immediately and each click advances to the
 * next, wrapping around. Any element carrying the attribute can be the click
 * target (delegated), and several elements can share a name. Values are
 * taken verbatim from your own markup, so they can be colours, lengths,
 * keywords, anything valid in a custom property.
 */
import { number } from "../properties.mjs";

const KEY = /^[A-Za-z0-9_-]+$/;

export const cycle = ({
  attribute = "data-signal-cycle",
  valuesAttribute = "data-signal-values",
} = {}) => ({
  name: "cycle",
  start({ document: doc, signal, set, define }) {
    const state = new Map(); // name -> index

    const read = (el) => {
      const name = el.getAttribute(attribute);
      const values = (el.getAttribute(valuesAttribute) ?? "")
        .split(";")
        .map((v) => v.trim())
        .filter(Boolean);
      return name && KEY.test(name) && values.length ? { name, values } : null;
    };
    const publish = (name, values, index) => {
      state.set(name, index);
      set(`cycle-${name}`, values[index]);
      set(`cycle-${name}-index`, index);
    };

    doc.addEventListener(
      "click",
      ({ target }) => {
        const el = target.closest?.(`[${attribute}]`);
        const found = el && read(el);
        if (found) publish(found.name, found.values, ((state.get(found.name) ?? -1) + 1) % found.values.length);
      },
      { signal }
    );

    for (const el of doc.querySelectorAll(`[${attribute}]`)) {
      const found = read(el);
      if (!found || state.has(found.name)) continue;
      define(`cycle-${found.name}`, { syntax: "*" });
      define(`cycle-${found.name}-index`, number(0));
      publish(found.name, found.values, 0);
    }
  },
});
