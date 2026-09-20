import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createSignals, pointer, scroll, viewport, progress } from "../src/index.mjs";
import { closeWindows, installedCss, makeWindow, read, setScrollGeometry, stubAnimationName } from "./_dom.mjs";

after(closeWindows);

test("progress(): clamps, and is 0 when nothing can scroll", () => {
  assert.equal(progress(0, 0), 0, "0/0 was NaN in the old module");
  assert.equal(progress(50, 0), 0, "x/0 was Infinity in the old module");
  assert.equal(progress(50, 100), 0.5);
  assert.equal(progress(-20, 100), 0, "rubber-band under-scroll");
  assert.equal(progress(130, 100), 1, "rubber-band over-scroll");
});

test("viewport publishes the window size and follows resize", () => {
  const win = makeWindow();
  win.innerWidth = 1280;
  win.innerHeight = 720;
  const s = createSignals({ window: win, prefix: "v" }).use(viewport());
  s.flush();
  assert.equal(read(win, "--v-viewport-width"), "1280");
  assert.equal(read(win, "--v-viewport-height"), "720");

  win.innerWidth = 800;
  win.dispatchEvent(new win.Event("resize"));
  s.flush();
  assert.equal(read(win, "--v-viewport-width"), "800");
});

test("pointer publishes position, progress, down and inside", () => {
  const win = makeWindow();
  win.innerWidth = 1000;
  win.innerHeight = 500;
  const s = createSignals({ window: win }).use(pointer());
  const move = (clientX, clientY) =>
    win.document.dispatchEvent(new win.MouseEvent("pointermove", { clientX, clientY, bubbles: true }));

  move(250, 125);
  s.flush();
  assert.equal(read(win, "--sig-pointer-x"), "250");
  assert.equal(read(win, "--sig-pointer-y"), "125");
  assert.equal(read(win, "--sig-pointer-x-progress"), "0.25");
  assert.equal(read(win, "--sig-pointer-y-progress"), "0.25");
  assert.equal(read(win, "--sig-pointer-inside"), "1");

  win.document.dispatchEvent(new win.Event("pointerdown", { bubbles: true }));
  s.flush();
  assert.equal(read(win, "--sig-pointer-down"), "1");
  win.document.dispatchEvent(new win.Event("pointerup", { bubbles: true }));
  s.flush();
  assert.equal(read(win, "--sig-pointer-down"), "0");

  win.document.documentElement.dispatchEvent(new win.Event("pointerleave"));
  s.flush();
  assert.equal(read(win, "--sig-pointer-inside"), "0");
});

test("pointer progress is clamped when the pointer is outside the viewport", () => {
  const win = makeWindow();
  win.innerWidth = 100;
  win.innerHeight = 100;
  const s = createSignals({ window: win }).use(pointer());
  win.document.dispatchEvent(new win.MouseEvent("pointermove", { clientX: 500, clientY: -40 }));
  s.flush();
  assert.equal(read(win, "--sig-pointer-x-progress"), "1");
  assert.equal(read(win, "--sig-pointer-y-progress"), "0");
});

test("scroll (JS fallback): progress follows the scroll position", () => {
  const win = makeWindow(); // no CSS.supports -> JS path
  setScrollGeometry(win, { scrollHeight: 2000, clientHeight: 1000, scrollTop: 250 });
  const s = createSignals({ window: win }).use(scroll());
  s.flush();
  assert.equal(read(win, "--sig-scroll-y-progress"), "0.25");
  assert.equal(read(win, "--sig-scroll-x-progress"), "0");

  setScrollGeometry(win, { scrollHeight: 2000, clientHeight: 1000, scrollTop: 1000 });
  win.document.dispatchEvent(new win.Event("scroll"));
  s.flush();
  assert.equal(read(win, "--sig-scroll-y-progress"), "1");
});

test("scroll (JS fallback): a page that cannot scroll reports 0, not NaN", () => {
  const win = makeWindow();
  setScrollGeometry(win, { scrollHeight: 800, clientHeight: 800, scrollTop: 0 });
  const s = createSignals({ window: win }).use(scroll());
  s.flush();
  assert.equal(read(win, "--sig-scroll-y-progress"), "0");
});

test("scroll { raw: true } adds px values and the scrollable extent", () => {
  const win = makeWindow();
  setScrollGeometry(win, { scrollHeight: 2000, clientHeight: 1000, scrollTop: 300 });
  const s = createSignals({ window: win }).use(scroll({ raw: true }));
  s.flush();
  assert.equal(read(win, "--sig-scroll-y"), "300");
  assert.equal(read(win, "--sig-scroll-y-max"), "1000");
  assert.equal(read(win, "--sig-scroll-x-max"), "0");
});

test("scroll (native): installs CSS under the runtime prefix and runs no listener", () => {
  const win = makeWindow();
  win.CSS = { supports: (query) => query.includes("animation-timeline") };
  stubAnimationName(win);
  setScrollGeometry(win, { scrollHeight: 2000, clientHeight: 1000, scrollTop: 500 });
  const s = createSignals({ window: win, prefix: "app" }).use(scroll());

  const css = installedCss(win).join("\n");
  assert.match(css, /animation-timeline/);
  assert.match(css, /--app-scroll-y-progress/);
  assert.match(css, /@keyframes app-scroll-y-progress/);

  win.document.dispatchEvent(new win.Event("scroll"));
  s.flush();
  assert.equal(read(win, "--app-scroll-y-progress"), "", "JS did not write; CSS owns it");

  s.dispose();
  assert.equal(installedCss(win).length, 0, "native CSS removed on dispose");
});

test("scroll (native) still runs JS for raw values", () => {
  const win = makeWindow();
  win.CSS = { supports: () => true };
  stubAnimationName(win);
  setScrollGeometry(win, { scrollHeight: 2000, clientHeight: 1000, scrollTop: 300 });
  const s = createSignals({ window: win }).use(scroll({ raw: true }));
  s.flush();
  assert.equal(read(win, "--sig-scroll-y"), "300");
  assert.equal(read(win, "--sig-scroll-y-progress"), "", "progress stays native");
});

test("scroll { native: false } forces the JS path", () => {
  const win = makeWindow();
  win.CSS = { supports: () => true };
  setScrollGeometry(win, { scrollHeight: 2000, clientHeight: 1000, scrollTop: 500 });
  const s = createSignals({ window: win }).use(scroll({ native: false }));
  s.flush();
  assert.equal(read(win, "--sig-scroll-y-progress"), "0.5");
  assert.equal(installedCss(win).length, 0);
});

test("scroll (native) is skipped for a non-root target", () => {
  const win = makeWindow();
  win.CSS = { supports: () => true };
  const el = win.document.createElement("div");
  win.document.body.append(el);
  setScrollGeometry(win, { scrollHeight: 2000, clientHeight: 1000, scrollTop: 500 });
  const s = createSignals({ window: win, target: el }).use(scroll());
  s.flush();
  assert.equal(installedCss(win).length, 0);
  assert.equal(read(win, "--sig-scroll-y-progress", el), "0.5");
});

// ---- native scroll: cascade, conflicts, and sharing -----------------------

const nativeWindow = () => {
  const win = makeWindow();
  win.CSS = { supports: (query) => query.includes("animation-timeline") };
  setScrollGeometry(win, { scrollHeight: 2000, clientHeight: 1000, scrollTop: 500 });
  return win;
};

test("scroll (native): the rule is in a cascade layer so unlayered author CSS wins", () => {
  const win = nativeWindow();
  stubAnimationName(win);
  createSignals({ window: win }).use(scroll());
  assert.match(installedCss(win).join("\n"), /@layer css-signals \{/);
});

test("scroll (native): if something overrides our animation, fall back to JS and warn", () => {
  const win = nativeWindow();
  const warnings = [];
  win.console = { warn: (...args) => warnings.push(args.join(" ")) };
  stubAnimationName(win, "my-own-animation"); // the user's :root animation won the cascade

  const s = createSignals({ window: win, prefix: "app" }).use(scroll());
  s.flush();

  assert.equal(installedCss(win).length, 0, "our native CSS is removed");
  assert.equal(read(win, "--app-scroll-y-progress"), "0.5", "JS computes progress instead");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /something else animates :root/);
});

test("scroll (native): a conflict that appears later is caught on window load", () => {
  const win = nativeWindow();
  win.console = { warn() {} };
  let names = "ours";
  stubAnimationName(win, () => (names === "ours" ? "app-scroll-y-progress, app-scroll-x-progress" : names));
  const s = createSignals({ window: win, prefix: "app" }).use(scroll());
  assert.equal(installedCss(win).length, 1, "native at first");

  names = "late-stylesheet-animation";
  win.dispatchEvent(new win.Event("load"));
  s.flush();
  assert.equal(installedCss(win).length, 0);
  assert.equal(read(win, "--app-scroll-y-progress"), "0.5");

  win.document.dispatchEvent(new win.Event("scroll")); // and it now follows scrolling
  setScrollGeometry(win, { scrollHeight: 2000, clientHeight: 1000, scrollTop: 1000 });
  win.document.dispatchEvent(new win.Event("scroll"));
  s.flush();
  assert.equal(read(win, "--app-scroll-y-progress"), "1");
});

test("scroll (native): instances share one stylesheet instead of clobbering each other", () => {
  const win = nativeWindow();
  stubAnimationName(win);
  const a = createSignals({ window: win, prefix: "a" }).use(scroll());
  const b = createSignals({ window: win, prefix: "b" }).use(scroll());

  const both = installedCss(win);
  assert.equal(both.length, 1, "one stylesheet");
  assert.match(both[0], /a-scroll-y-progress/);
  assert.match(both[0], /b-scroll-y-progress/);
  assert.equal(both[0].match(/animation:/g).length, 1, "a single animation declaration lists both");

  a.dispose();
  const left = installedCss(win).join("\n");
  assert.doesNotMatch(left, /a-scroll-y-progress/);
  assert.match(left, /b-scroll-y-progress/);

  b.dispose();
  assert.equal(installedCss(win).length, 0);
});
