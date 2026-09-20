# css-signals

Publishes live browser state (pointer, scroll, viewport, keyboard, date, gamepad,
audio, input, ...) as typed CSS custom properties under a runtime-configurable
prefix. ESM only, no runtime dependencies, browser code tested under jsdom.

## Commands

```sh
npm test               # node --test test/*.test.mjs (jsdom, no network)
npm run build:css      # regenerate css/signals.css and css/utils.css for prefix "sig"
node scripts/build-css.mjs --prefix app --out /tmp/a.css --utils-out /tmp/b.css
```

`css/` is generated and committed; CI fails if `npm run build:css` changes it.

## Architecture

- `src/core.mjs` -- `createSignals()`. Owns the prefix, target element, an
  `AbortController`, per-frame batched writes, and property registration. Sources
  never touch the DOM; they receive a context (`set`, `define`, `signal`, ...).
- `src/sources/*.mjs` -- one file per source, each `() => ({ name, properties, css?, start(ctx) })`.
  Listeners take `{ signal }` so `dispose()` cleans up. No side effects on import.
- `src/properties.mjs` -- `number()`, `propertyName()`, `propertyRule()`.
- `src/css.mjs` -- static CSS generators (`sourcesCss`, `functionsCss`).
- `examples/verify.html` -- a self-checking page; open it (served over http, it
  imports ES modules) in a real browser. Not part of `npm test`.

## Things that bite

- **The prefix is a runtime argument.** CSS cannot compute a property name, so
  anything derived from it (registrations, keyframe names, CSS functions) is
  generated in JS. Never hardcode `--sig-` outside the generated `css/` files.
- **Register with `*`, not `<string>`.** WebKit 18 rejects `<string>` with any
  initial value. `<number>` is fine.
- **Native scroll mode uses `animation` on `:root`.** It is layered
  (`@layer css-signals`), shared per document, and verified against the
  computed `animation-name`; see `src/sources/scroll.mjs`.
- **Hidden tabs do not run `requestAnimationFrame`.** Writes are per-frame by
  design; in a hidden tab (or a hidden browser pane) nothing flushes.
- **jsdom lies about `CSS.supports('animation-timeline: scroll()')`** (says
  true) and has no animation cascade. `test/_dom.mjs` pins it off and provides
  `stubAnimationName()`. The real behaviour is only checked in `examples/verify.html`.
- **`@function` fallbacks need `@supports`.** A declaration with `var()` inside
  an unknown function becomes `unset`, it does not fall back to the line above.
- Close jsdom windows after each test file (`after(closeWindows)`) or a running
  `requestAnimationFrame` loop keeps Node alive.
