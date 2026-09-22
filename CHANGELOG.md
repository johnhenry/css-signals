# Changelog

## 0.0.0 -- initial release (2026-09-20)

A rewrite, not a port, of the `johnhenry/lib` modules `css-model` and its
plugins, and the `css-variables-*` modules -- those were never published to
npm, so there is no earlier unscoped version to restart from and no
deprecation to issue; `0.0.0` is the first version under any name, not a
maturity signal.

**Added**

- `createSignals({ prefix, target, window, register, signal })` -- runtime
  prefix, batched per-frame writes, single-`AbortSignal` teardown, typed
  property registration, and `define()` for names only known at runtime.
- Sources: `pointer`, `scroll`, `viewport`, `keyboard`, `date`, `gamepad`,
  `audio` (+ `microphoneAnalyser`), `input`, `cycle`, `random`, `framed`.
- Native scroll progress via CSS scroll timelines, with a JS fallback, a
  cascade-layered rule, conflict detection, and one shared stylesheet per
  document.
- `sourcesCss()`, `functionsCss()` and `scripts/build-css.mjs` to generate
  static CSS (`css/signals.css`, `css/utils.css`) for any prefix.
- `--{prefix}-progress()`, `-lerp()`, `-map()` CSS functions (optional).
- `examples/demo.html` and `examples/verify.html` (a self-checking page).

**Fixed relative to the originals**

- Scroll ratio no longer becomes `NaN` / `Infinity` on a page that cannot
  scroll, and is clamped for rubber-band over-scroll.
- Scroll extent uses `scrollHeight - clientHeight` and refreshes on content
  resize via `ResizeObserver` (previously only on scroll/resize/load).
- Pointer uses Pointer Events (touch and pen), not `mousemove`.
- Keyboard releases held keys on blur, tab hide and Meta release; previously
  they could stick.
- Gamepad no longer logs to the console every 50 ms, and polls per frame only
  while a pad is connected instead of on a timer forever.
- Audio publishes a handful of values instead of one custom property per
  sample every frame.
- Date ticks on second boundaries, pauses while hidden, supports any time zone,
  and uses Temporal when available.
- Input reads controls at start instead of only after the first event.
- No side effects on import; nothing runs until `createSignals().use()`.
- Modules no longer import each other by pinned relative version path.

**Dropped, with reasons**

- `-str` twin variables: use `counter-set: n var(--x); content: counter(n)`
  for integers.
- Derived angle/magnitude, `random` scaling (`multiplier`/`floor`/`ceil`),
  audio colour encoding, gamepad `id`: CSS does these natively
  (`atan2()`, `hypot()`, `round()`, `color-mix()`).
- `style-animator` (a JS frame loop, and its `step` was ignored): registered
  properties take a plain CSS `transition`; verified in Chrome and Firefox.
- `css-model-output` (reflects variables back into DOM text via a
  MutationObserver): the inverse direction, not a signal source.
- `css-model-presentation` (slide layout from scroll position): scroll-driven
  animations with `view()` cover it natively.

**Found by testing in real browsers** (none showed up under jsdom)

- WebKit 18 rejects `<string>` registrations with any initial value. Strings
  now use `*`, and a refused registration warns instead of throwing.
- In a browser without `@function`, the "fallback declaration first" pattern
  silently produces `unset`; the docs and helpers use an `@supports` gate.
- jsdom's `CSS.supports()` reports scroll timelines as supported, and an
  iframe's window rejects a Node-realm `AbortSignal` (the core now builds its
  `AbortController` from the target window).
