# @johnhenry/css-signals

Publish live browser state -- pointer, scroll, viewport -- as **typed CSS custom
properties** under a **runtime-configurable prefix**. Where the browser can
compute a value in CSS alone, it does. Where it can't, a small batched JS source
fills in.

```js
import { createSignals, pointer, scroll, viewport } from "@johnhenry/css-signals";

const signals = createSignals({ prefix: "app" }).use(pointer(), scroll(), viewport());
```

```css
#progress { transform: scaleX(var(--app-scroll-y-progress)); }
#follower { left: calc(var(--app-pointer-x) * 1px); top: calc(var(--app-pointer-y) * 1px); }
#width::after { counter-set: w var(--app-viewport-width); content: counter(w) "px"; }
```

> **Provenance.** A ground-up rewrite of the `css-model` and `css-variables-*`
> modules in [`johnhenry/lib`](https://github.com/johnhenry/lib), which were
> never published to npm. There is no earlier npm release to restart from;
> `0.0.0` is the first version under any name, not a maturity signal. See
> `CHANGELOG.md` for what changed and what was dropped.

`examples/demo.html` is a working page (`?prefix=demo` to change the prefix).

## Install

```
npm install @johnhenry/css-signals
```

## What you get

Keys below are unprefixed; the prefix is applied at runtime (`--sig-pointer-x`, ...).

| Source | Publishes | Notes |
|---|---|---|
| `pointer()` | `pointer-x`, `pointer-y` (px); `pointer-x-progress`, `pointer-y-progress` (0..1); `pointer-down`, `pointer-inside` (0/1) | Pointer Events, so touch and pen work. Angle and magnitude are left to CSS (`atan2()`, `hypot()`). |
| `scroll()` | `scroll-x-progress`, `scroll-y-progress` (0..1) | **Native first**: a CSS scroll timeline where supported, a passive listener otherwise. |
| `scroll({ raw: true })` | adds `scroll-x`, `scroll-y`, `scroll-x-max`, `scroll-y-max` (px) | No native equivalent, so this always runs the listener. |
| `viewport()` | `viewport-width`, `viewport-height` (px) | The one thing viewport *units* can't do: hand `calc()` or `counter()` a bare number. |
| `keyboard({ keys })` | `key-alt/ctrl/meta/shift`, `key-{code}` (0/1) | `code` is the physical key (`key-KeyW`), so WASD works on any layout. Chords are `calc()` products. Held keys release on blur, tab hide, and Meta release. |
| `date({ timeZone, utc, label })` | `date-{tag}-second/minute/hour/hour24/am/pm/weekday/monthday/month/year` | Temporal when present, `Intl` otherwise (identical values). Any IANA zone. ISO weekday (Mon=1..Sun=7), month 1..12. Ticks on second boundaries, pauses when hidden. |
| `gamepad({ limit, deadzone })` | `gamepad-{i}-connected`, `-button-{j}` (0..1), `-axis-{j}` (-1..1) | Polls per frame, only while a pad is connected. Deadzone applied to axes. |
| `audio({ analyser, bins })` | `audio-level`, `audio-bass/mid/treble`, `audio-bin-{i}` (0..1) | Takes an `AnalyserNode`. `microphoneAnalyser()` wires up the mic. A handful of values, not one per sample. |
| `input({ attribute })` | `input-{name}`: number (range/number), 0/1 (checkbox), quoted string (text, radio, select) | Reads controls at start, then follows `input`/`change`. Delegated, so late controls work. |
| `cycle()` | `cycle-{name}` (the current value) and `cycle-{name}-index` | Click an element to step through `data-signal-values="a;b;c"`. |
| `random({ count, seed })` | `random-{i}` (0..1) | Seedable. `reset()` re-rolls. Use CSS `random()` for per-element values where supported. |
| `framed()` | `framed-top`, `framed-iframe` (0/1) | One-time fact; CSS cannot tell. |

Every static property is a registered `<number>` with an initial value, so a
stylesheet reads a sane value before any JS runs, `calc()` and typed
`@function` parameters accept it, and it can be transitioned. Properties whose
names depend on hardware or markup (key codes, pad buttons, input names) are
registered the first time they appear, so read them with a fallback:
`var(--sig-key-KeyW, 0)`.

## The prefix is dynamic

CSS cannot compute a custom property's name, so the prefix is a JS argument and
everything derived from it (property names, `@property` registrations, keyframe
names) is generated from it at runtime:

```js
createSignals({ prefix: "app" });  // --app-pointer-x
createSignals({ prefix: "" });     // --pointer-x
createSignals();                   // --sig-pointer-x   (default)
```

Two instances with different prefixes coexist. A prefix must be empty or a CSS
identifier fragment (`[A-Za-z_][A-Za-z0-9_-]*`); anything else throws.

For a JS-free page, generate a static stylesheet for a prefix:

```
node node_modules/@johnhenry/css-signals/scripts/build-css.mjs --prefix app --out public/signals.css
```

`@johnhenry/css-signals/signals.css` is the same file for the default `sig`
prefix. It contains the `@property` rules and the native scroll CSS, so it
covers scroll progress but not pointer or viewport (those need JS).

## CSS helpers (optional)

`@johnhenry/css-signals/utils.css` (or `functionsCss(prefix)` for another
prefix) defines three `@function`s, named from the prefix like everything
else: `--sig-progress(v, min, max)` (clamped 0..1), `--sig-lerp(a, b, t)` and
`--sig-map(v, in-min, in-max, out-min, out-max)`. They are prefix-agnostic
in behaviour and work on any value, not just signals.

`@function` is not in every browser, and the obvious fallback does **not**
work: a declaration containing `var()` is only checked at computed-value time,
so where `@function` is missing the property becomes `unset` instead of
falling back to the line above (Firefox 137 showed exactly this). Gate it with
`@supports`, using a literal call with no `var()`:

```css
.bar { width: calc(var(--sig-pointer-x) * 0.4px); }                 /* everywhere */
@supports (width: --sig-map(1, 0, 1, 0px, 1px)) {                   /* where @function exists */
  .bar { width: --sig-map(var(--sig-pointer-x), 0, 1000, 0px, 400px); }
}
```

## Smoothing

Because the properties are registered, plain CSS transitions interpolate them.
No JS animation loop is needed (this replaces the old `style-animator`):

```css
:root { transition: --sig-pointer-x 200ms ease-out, --sig-pointer-y 200ms ease-out; }
```

Honour `prefers-reduced-motion` yourself for these.

## Lifecycle

`createSignals()` owns an `AbortController`. Every listener a source adds is
tied to it, so one call cleans up everything: listeners, observers, injected CSS
and every property it wrote.

```js
signals.dispose();
{ using signals = createSignals().use(pointer()); }   // Symbol.dispose
createSignals({ signal: controller.signal });          // or abort an outer signal
```

Writes are batched to one per animation frame, skip unchanged values, and ignore
`NaN` / `Infinity` (which would invalidate a `<number>`).

## Options

`createSignals({ prefix, target, window, register, signal })`

- `target` -- element that receives the properties. Default `document.documentElement`.
  Native scroll progress only applies to the document root; a custom target uses the JS path.
- `window` -- inject a window (an iframe's, or jsdom's). The `AbortController` is
  created from it, so cross-realm listeners work.
- `register` -- set `false` to skip `CSS.registerProperty`.

`scroll({ raw, native })` -- `native: false` forces the JS listener.

If the browser refuses a property registration (WebKit 18 rejects `<string>`),
the core warns and carries on: the value is still written, just untyped.

## Writing a source

A source is an object; the core hands it a context.

```js
const time = () => ({
  name: "time",
  properties: { "time-second": { syntax: "<number>", initialValue: 0 } },
  start({ set, signal, window }) {
    const tick = () => set("time-second", new Date().getSeconds());
    const id = window.setInterval(tick, 1000);
    signal.addEventListener("abort", () => clearInterval(id), { once: true });
    tick();
  },
});
signals.use(time());
```

`set(key, value)` takes an unprefixed key. Pass `signal` to `addEventListener`
and there is nothing to clean up by hand. For names only known at runtime,
call `define(key, { syntax, initialValue })` first. See `src/types.d.ts` for the
full context.

## Browser support

Everything works everywhere via the JS paths; native paths are an upgrade.

| Feature | Needs | Where it stands (checked September 2026 from web sources; verify on caniuse) |
|---|---|---|
| `@property` typed variables | Baseline | all engines (but WebKit 18 rejects `<string>`; this library avoids it) |
| Native scroll progress | scroll-driven animations | Chrome/Edge 115+, Safari 26; not in Firefox stable (confirmed absent in 156) |
| `date()` via Temporal | Temporal | Chrome 144+, Firefox 139+; Safari not stable. `Intl` fallback otherwise |
| `utils.css` functions | `@function` | Chromium only (absent in Firefox 156 and Safari 26.5); use the `@supports` gate above |
| CSS `random()` | not used here | Safari 26.2; behind a flag in Chrome |

Native scroll mode sets `animation` on `:root` inside the cascade layer
`css-signals`, so your own unlayered `:root { animation }` wins. If yours does,
this library notices (it checks the computed `animation-name` at start and on
load), drops its native rule, and computes progress in JS with a console
warning. All instances in a document share one stylesheet, so several prefixes
each get native progress.

## Status

`0.0.0`. Every source from the `johnhenry/lib` originals is ported or
deliberately replaced (see `CHANGELOG.md`).

**Tested** with jsdom (`npm test`, 83 tests) and by `examples/verify.html`, a
self-checking page that runs the library in a real browser and reports
PASS/FAIL/SKIP per check:

| Browser | Result |
|---|---|
| Chrome 153 (headless) | 17 passed, 0 skipped, three runs |
| Chrome 152 | 17 passed |
| Firefox 156 | 15 passed, 2 skipped (no native scroll timeline, so no native path to test); Temporal path matches `Intl` on 250 fields; `@function` helpers took the `calc()` fallback; two runs |
| Firefox 137 | 14 passed, 3 skipped (no native scroll timeline, no Temporal), two runs |
| Safari 26.5 (macOS) | 16 passed, 1 skipped (no Temporal); native scroll path, `@function` helpers took the `calc()` fallback; one run, read from a screenshot |
| iOS Safari 18.0 (simulator) | 14 passed, 3 skipped, one run |

Not exercised in a real browser: `gamepad` (needs hardware) and `audio` /
`microphoneAnalyser` (need a user gesture and a microphone); both are covered by
unit tests against fakes. Firefox with scroll-driven animations enabled (a flag) was not tested, so the
native path is verified in Chrome and Safari only.
