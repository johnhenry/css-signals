/**
 * scroll -- how far the page has scrolled.
 *
 * Published:
 *
 *   scroll-x-progress, scroll-y-progress    0..1 of the root scroller
 *
 * and, with `{ raw: true }`:
 *
 *   scroll-x, scroll-y                      px scrolled
 *   scroll-x-max, scroll-y-max              px scrollable (content - viewport)
 *
 * NATIVE FIRST. Where the browser supports scroll-driven animations
 * (`animation-timeline: scroll()`), the progress values are produced by CSS
 * alone: a keyframe animation on a registered `<number>` property, driven by
 * the root scroll timeline. No listener runs, the values update off the main
 * thread, and there is nothing to throttle. Everywhere else, a passive scroll
 * listener computes the same properties in JS. Stylesheets cannot tell the
 * difference.
 *
 * Native mode needs an `animation` on `:root`, and an element has only one
 * `animation` list, so this source is careful about it:
 *
 *   - The rule lives in the cascade layer `css-signals`, so any unlayered
 *     `:root { animation: ... }` you write wins. Your animation is never
 *     replaced.
 *   - It then checks the computed `animation-name`. If ours did not survive
 *     (yours won, or a later stylesheet overrode it), this instance drops the
 *     native rule and computes progress in JS instead, with a console warning.
 *     The check runs at start and again on window load.
 *   - All instances in a document share one stylesheet, so two prefixes both
 *     get native progress instead of the second clobbering the first.
 *
 * `raw` values have no native equivalent, so asking for them always runs the
 * listener (and, where native works, progress still comes from CSS).
 *
 * Native mode animates the document root, so it applies only when the target
 * is `document.documentElement`. A custom target always uses the JS path.
 */
import { number, propertyName } from "../properties.mjs";

/** scrolled / scrollable, clamped to 0..1; 0 when there is nothing to scroll. */
export const progress = (position, max) =>
  max > 0 ? Math.min(1, Math.max(0, position / max)) : 0;

const keyframeName = (prefix, axis) =>
  `${prefix ? `${prefix}-` : ""}scroll-${axis}-progress`;

/**
 * The CSS that produces scroll progress with no JS, for one prefix or an array
 * of them. The properties must be registered as `<number>` (the core does that
 * at runtime; `sourcesCss` emits the `@property` rules for static use),
 * otherwise the animation would jump instead of interpolating.
 */
export const nativeScrollCss = (prefixes) => {
  const list = [].concat(prefixes);
  const frames = list
    .map(
      (prefix) =>
        `  @keyframes ${keyframeName(prefix, "y")} { to { ${propertyName(prefix, "scroll-y-progress")}: 1; } }\n` +
        `  @keyframes ${keyframeName(prefix, "x")} { to { ${propertyName(prefix, "scroll-x-progress")}: 1; } }`
    )
    .join("\n");
  const names = list.flatMap((prefix) => [keyframeName(prefix, "y"), keyframeName(prefix, "x")]);
  const timelines = list.flatMap(() => ["scroll(root block)", "scroll(root inline)"]);
  return `@layer css-signals {
${frames}
  @supports (animation-timeline: scroll()) {
    :root {
      animation: ${names.map((name) => `${name} linear both`).join(", ")};
      animation-timeline: ${timelines.join(", ")};
    }
  }
}`;
};

// One native stylesheet per document, listing every prefix that wants it.
const shared = new WeakMap();

const render = (entry) => {
  entry.remove?.();
  entry.remove = entry.counts.size ? entry.adopt(nativeScrollCss([...entry.counts.keys()])) : null;
};

/** Add `prefix` to the document's shared native stylesheet. Returns a release function. */
const acquire = ({ document: doc, prefix, adoptCss }) => {
  let entry = shared.get(doc);
  if (!entry) {
    entry = { counts: new Map(), remove: null, adopt: adoptCss };
    shared.set(doc, entry);
  }
  entry.counts.set(prefix, (entry.counts.get(prefix) ?? 0) + 1);
  render(entry);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const left = entry.counts.get(prefix) - 1;
    if (left) entry.counts.set(prefix, left);
    else entry.counts.delete(prefix);
    render(entry);
  };
};

/** Did our animations survive the cascade? */
const nativeApplied = (win, doc, prefix) => {
  const applied = String(win.getComputedStyle(doc.documentElement).animationName ?? "")
    .split(",")
    .map((name) => name.trim());
  return [keyframeName(prefix, "y"), keyframeName(prefix, "x")].every((name) => applied.includes(name));
};

export const scroll = ({ raw = false, native = true } = {}) => ({
  name: "scroll",
  properties: {
    "scroll-x-progress": number(0),
    "scroll-y-progress": number(0),
    ...(raw && {
      "scroll-x": number(0),
      "scroll-y": number(0),
      "scroll-x-max": number(0),
      "scroll-y-max": number(0),
    }),
  },
  css: (prefix) => nativeScrollCss(prefix),
  start(context) {
    const { document: doc, window: win, signal, set, prefix, isRoot } = context;
    let release = null;
    let progressInJs = true;
    let listening = false;

    const update = () => {
      const el = doc.scrollingElement ?? doc.documentElement;
      const xMax = Math.max(0, el.scrollWidth - el.clientWidth);
      const yMax = Math.max(0, el.scrollHeight - el.clientHeight);
      if (progressInJs) {
        set("scroll-x-progress", progress(el.scrollLeft, xMax));
        set("scroll-y-progress", progress(el.scrollTop, yMax));
      }
      if (raw) {
        set("scroll-x", el.scrollLeft);
        set("scroll-y", el.scrollTop);
        set("scroll-x-max", xMax);
        set("scroll-y-max", yMax);
      }
    };

    const listen = () => {
      if (listening) return;
      listening = true;
      doc.addEventListener("scroll", update, { passive: true, signal });
      win.addEventListener("resize", update, { passive: true, signal });
      // Content can grow or shrink without a resize or scroll event.
      if (typeof win.ResizeObserver === "function") {
        const observer = new win.ResizeObserver(update);
        observer.observe(doc.documentElement);
        signal.addEventListener("abort", () => observer.disconnect(), { once: true });
      }
    };

    const dropNative = () => {
      release?.();
      release = null;
      progressInJs = true;
      win.console?.warn?.(
        `css-signals: something else animates :root, so native scroll progress for "${prefix}" ` +
          `was dropped and is computed in JS instead.`
      );
      listen();
      update();
    };
    const verify = () => {
      if (release && !nativeApplied(win, doc, prefix)) dropNative();
    };

    const useNative =
      native && isRoot && Boolean(win.CSS?.supports?.("animation-timeline: scroll()"));
    if (useNative) {
      release = acquire(context);
      progressInJs = false;
      verify();
      win.addEventListener("load", verify, { once: true, signal });
      signal.addEventListener("abort", () => release?.(), { once: true });
    }

    if (progressInJs || raw) listen();
    update();
  },
});
