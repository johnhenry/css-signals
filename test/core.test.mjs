import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createSignals } from "../src/index.mjs";
import { closeWindows, makeWindow, nextFrame, read } from "./_dom.mjs";

after(closeWindows);

test("the prefix is a runtime argument", () => {
  const win = makeWindow();
  const a = createSignals({ window: win, prefix: "app" });
  a.set("x", 1);
  a.flush();
  assert.equal(read(win, "--app-x"), "1");
  assert.equal(a.name("x"), "--app-x");
});

test("default prefix is sig", () => {
  const win = makeWindow();
  const s = createSignals({ window: win });
  s.set("x", 2);
  s.flush();
  assert.equal(read(win, "--sig-x"), "2");
});

test("an empty prefix gives unprefixed names", () => {
  const win = makeWindow();
  const s = createSignals({ window: win, prefix: "" });
  s.set("x", 3);
  s.flush();
  assert.equal(read(win, "--x"), "3");
});

test("two instances with different prefixes coexist", () => {
  const win = makeWindow();
  const a = createSignals({ window: win, prefix: "a" });
  const b = createSignals({ window: win, prefix: "b" });
  a.set("v", 1);
  b.set("v", 2);
  a.flush();
  b.flush();
  assert.equal(read(win, "--a-v"), "1");
  assert.equal(read(win, "--b-v"), "2");
});

test("invalid prefixes are rejected", () => {
  const win = makeWindow();
  for (const prefix of ["1abc", "a b", "a.b", "--x", " ", 7, null]) {
    assert.throws(() => createSignals({ window: win, prefix }), TypeError, String(prefix));
  }
});

test("invalid keys are rejected", () => {
  const s = createSignals({ window: makeWindow() });
  for (const key of ["", "a b", "a:b", 1]) {
    assert.throws(() => s.set(key, 1), TypeError, String(key));
  }
});

test("writes are batched to the next frame, last value wins", async () => {
  const win = makeWindow();
  const s = createSignals({ window: win });
  s.set("x", 1);
  s.set("x", 2);
  s.set("x", 3);
  assert.equal(read(win, "--sig-x"), "", "nothing written synchronously");
  await nextFrame(win);
  assert.equal(read(win, "--sig-x"), "3");
});

test("unchanged values are not rewritten", () => {
  const win = makeWindow();
  const s = createSignals({ window: win });
  const style = win.document.documentElement.style;
  const original = style.setProperty.bind(style);
  let writes = 0;
  style.setProperty = (...args) => {
    writes += 1;
    return original(...args);
  };
  s.set("x", 5);
  s.flush();
  s.set("x", 5);
  s.flush();
  s.set("x", 6);
  s.flush();
  assert.equal(writes, 2);
});

test("non-finite numbers are ignored and leave the previous value", () => {
  const win = makeWindow();
  const s = createSignals({ window: win });
  s.set("x", 0.5);
  s.flush();
  for (const bad of [NaN, Infinity, -Infinity]) {
    s.set("x", bad);
    s.flush();
  }
  assert.equal(read(win, "--sig-x"), "0.5");
});

test("booleans become 1 and 0", () => {
  const win = makeWindow();
  const s = createSignals({ window: win });
  s.set("on", true);
  s.set("off", false);
  s.flush();
  assert.equal(read(win, "--sig-on"), "1");
  assert.equal(read(win, "--sig-off"), "0");
});

test("a custom target receives the properties", () => {
  const win = makeWindow();
  const el = win.document.createElement("section");
  win.document.body.append(el);
  const s = createSignals({ window: win, target: el });
  s.set("x", 1);
  s.flush();
  assert.equal(read(win, "--sig-x", el), "1");
  assert.equal(read(win, "--sig-x"), "");
});

test("properties are registered under the runtime prefix", () => {
  const win = makeWindow();
  const registered = [];
  win.CSS = { registerProperty: (def) => registered.push(def) };
  createSignals({ window: win, prefix: "app" }).use({
    name: "demo",
    properties: { level: { syntax: "<number>", initialValue: 1 } },
    start() {},
  });
  assert.deepEqual(registered, [
    { name: "--app-level", syntax: "<number>", inherits: true, initialValue: "1" },
  ]);
});

test("re-registering the same name is tolerated silently", () => {
  const win = makeWindow();
  const warnings = [];
  win.console = { warn: (...args) => warnings.push(args.join(" ")) };
  win.CSS = {
    registerProperty() {
      throw new win.DOMException("already registered", "InvalidModificationError");
    },
  };
  const source = { name: "d", properties: { a: { syntax: "<number>", initialValue: 0 } }, start() {} };
  assert.doesNotThrow(() => createSignals({ window: win }).use(source));
  assert.deepEqual(warnings, []);
});

test("a registration the browser refuses warns but does not stop the source", () => {
  const win = makeWindow();
  const warnings = [];
  win.console = { warn: (...args) => warnings.push(args.join(" ")) };
  win.CSS = {
    registerProperty() {
      throw new win.DOMException("The given initial value does not parse for the given syntax.", "SyntaxError");
    },
  };
  let started = false;
  const s = createSignals({ window: win, prefix: "app" }).use({
    name: "d",
    properties: { a: { syntax: "<string>", initialValue: '""' } },
    start: () => (started = true),
  });
  assert.equal(started, true, "the source still starts");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /--app-a as <string>.*untyped custom property/);
  s.set("a", 1);
  s.flush();
  assert.equal(read(win, "--app-a"), "1", "and its values are still written");
});

test("register: false skips registration", () => {
  const win = makeWindow();
  let called = false;
  win.CSS = { registerProperty: () => (called = true) };
  createSignals({ window: win, register: false }).use({
    name: "d",
    properties: { a: { syntax: "<number>", initialValue: 0 } },
    start() {},
  });
  assert.equal(called, false);
});

test("dispose aborts listeners, runs cleanups, and removes written properties", () => {
  const win = makeWindow();
  const s = createSignals({ window: win });
  let cleaned = false;
  let seen = 0;
  s.use({
    name: "d",
    start({ document, signal }) {
      document.addEventListener("click", () => (seen += 1), { signal });
      return () => (cleaned = true);
    },
  });
  s.set("x", 1);
  s.flush();
  win.document.dispatchEvent(new win.Event("click"));
  assert.equal(seen, 1);

  s.dispose();
  win.document.dispatchEvent(new win.Event("click"));
  assert.equal(seen, 1, "listener removed");
  assert.equal(cleaned, true);
  assert.equal(read(win, "--sig-x"), "", "property removed");
});

test("dispose is idempotent, and set() after dispose is a no-op", () => {
  const win = makeWindow();
  const s = createSignals({ window: win });
  s.dispose();
  assert.doesNotThrow(() => s.dispose());
  s.set("x", 1);
  s.flush();
  assert.equal(read(win, "--sig-x"), "");
  assert.throws(() => s.use({ name: "d", start() {} }), /disposed/);
});

test("a pending frame is cancelled by dispose", async () => {
  const win = makeWindow();
  const s = createSignals({ window: win });
  s.set("x", 1);
  s.dispose();
  await nextFrame(win);
  assert.equal(read(win, "--sig-x"), "");
});

test("an external AbortSignal disposes the instance", () => {
  const win = makeWindow();
  const controller = new AbortController();
  const s = createSignals({ window: win, signal: controller.signal });
  s.set("x", 1);
  s.flush();
  controller.abort();
  assert.equal(read(win, "--sig-x"), "");
});

test("Symbol.dispose is wired up", () => {
  const win = makeWindow();
  const s = createSignals({ window: win });
  s.set("x", 1);
  s.flush();
  s[Symbol.dispose]();
  assert.equal(read(win, "--sig-x"), "");
});
