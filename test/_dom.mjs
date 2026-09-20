/**
 * A fresh jsdom window per test, passed to createSignals({ window }) rather
 * than installed on globalThis, so tests cannot leak into each other and the
 * "inject a window" path the library documents is the one under test.
 * `pretendToBeVisual` gives the window a real requestAnimationFrame.
 */
import { JSDOM } from "jsdom";

const opened = [];

/** Close every window made so far. Loops that were never disposed (rAF, timers) would otherwise keep Node alive. */
export const closeWindows = () => {
  for (const window of opened.splice(0)) window.close();
};

export const makeWindow = () => {
  const { window } = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
    url: "https://example.test/",
    pretendToBeVisual: true,
  });
  // jsdom's CSS.supports() reports scroll timelines as supported, which no
  // jsdom behaviour backs up. Pin it off so tests choose the path explicitly
  // (tests for the native path assign their own window.CSS).
  window.CSS = { supports: () => false };
  opened.push(window);
  return window;
};

/** Wait for the next animation frame (our flush is registered first, so it has run). */
export const nextFrame = (win) => new Promise((resolve) => win.requestAnimationFrame(() => resolve()));

/** jsdom does no layout, so scroll geometry has to be supplied. */
export const setScrollGeometry = (win, geometry) => {
  const el = win.document.scrollingElement ?? win.document.documentElement;
  const defaults = {
    scrollTop: 0,
    scrollLeft: 0,
    scrollHeight: 0,
    clientHeight: 0,
    scrollWidth: 0,
    clientWidth: 0,
  };
  for (const [key, value] of Object.entries({ ...defaults, ...geometry })) {
    Object.defineProperty(el, key, { value, configurable: true });
  }
};

export const read = (win, property, el = win.document.documentElement) =>
  el.style.getPropertyValue(property);

/** Every stylesheet the instance installed, whichever mechanism it used. */
export const installedCss = (win) => [
  ...[...win.document.querySelectorAll("style[data-css-signals]")].map((s) => s.textContent),
  ...(win.document.adoptedStyleSheets ?? []).map((s) =>
    [...s.cssRules].map((r) => r.cssText).join("\n")
  ),
];

/**
 * jsdom has no animation cascade, so tests say what the cascade would have
 * produced. `names` is a string (or a function returning one) for the
 * computed `animation-name` of the root; `"ours"` derives it from whatever
 * keyframes css-signals installed, i.e. "nothing overrode us".
 */
export const stubAnimationName = (win, names = "ours") => {
  win.getComputedStyle = () => ({
    animationName:
      typeof names === "function"
        ? names()
        : names === "ours"
          ? [...installedCss(win).join("\n").matchAll(/@keyframes ([\w-]+)/g)].map((m) => m[1]).join(", ")
          : names,
  });
};
