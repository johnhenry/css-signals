# Agent playbook

`@johnhenry/css-signals` -- publishes live browser state (pointer, scroll,
viewport, keyboard, date, gamepad, audio, input, ...) as typed CSS custom
properties under a runtime-configurable prefix. Single package, Node >= 26,
`node --test` (jsdom), ships source (no build step for the JS; `css/` is a
generated, committed artifact -- see the drift gotcha below). The library is
browser code; Node only runs the jsdom tests, the static-CSS generator, and
`examples/verify.html`'s harness -- real behaviour is checked in actual
browsers, not just under jsdom.

`CLAUDE.md` in this directory is a symlink to this file.

## The verification loop (before every push)

1. `npm test` -- `node --test test/*.test.mjs` (jsdom, no network). 83 tests;
   none should be skipped.
2. `npm run build:css` -- regenerates `css/signals.css` and `css/utils.css`
   for the default `sig` prefix, then `git diff --exit-code -- css/` to
   confirm nothing drifted. CI runs this as its own `generated-css` job, in
   both `ci.yml` and `publish.yml`.
3. Open `examples/verify.html` (served over http -- it imports ES modules) in
   a real browser and read the PASS/FAIL/SKIP rows. jsdom cannot catch
   engine-specific bugs (see gotchas below); this is the only step that does.
4. A genuinely fresh clone:
   `git clone . /tmp/css-signals-verifyN && cd $_ && npm ci && npm run build:css && npm test`.
   Catches missing `files` entries and undeclared deps that a checked-out
   tree hides.
5. Commit, push, close the issue with a comment naming the commit SHA.

CI (`.github/workflows/ci.yml`) runs install, test, and the `generated-css`
drift check; match that locally before pushing.

## Repo-specific gotchas

- **A test that runs the CSS generator must redirect *every* output, not
  just the one it asserts on.** `scripts/build-css.mjs` writes both
  `--out` (signals.css) and `--utils-out` (utils.css); a test that passed
  only `--out` silently overwrote the repo's own `css/utils.css` with the
  test's prefix, and the wrong file was committed. Caught only by the
  `generated-css` CI job's `git diff --exit-code`. Any test that invokes the
  generator must redirect all of its outputs to a temp path.
- **jsdom passing is not evidence for browser code.** Three real bugs never
  showed up under jsdom: WebKit 18 rejects `CSS.registerProperty` with
  `syntax: "<string>"` for any initial value (properties now register with
  `*`); a browser without `@function` does not fall back from a `var()`
  declaration, it produces `unset` (docs and `utils.css` consumers must gate
  with `@supports`, not declaration order); and an iframe's window rejects an
  `AbortSignal` built in another realm (`createSignals()` now builds its
  `AbortController` from the target window, not `globalThis`).
- **The prefix is a runtime argument, not a build-time constant.** CSS cannot
  compute a property name, so anything derived from the prefix (registrations,
  keyframe names, `@function` names) is generated in JS at `createSignals()`
  time. Never hardcode `--sig-` outside the generated `css/` files.
- **Hidden tabs never flush.** Writes are batched to one `requestAnimationFrame`
  per instance by design; a hidden tab (or an unfocused Browser-pane tab in
  agent tooling) never runs rAF, so nothing appears to update -- this is
  expected, not a bug, but it has been mistaken for one while testing.
- Close jsdom windows after each test file (`after(closeWindows)` in
  `test/_dom.mjs`) or a running rAF loop keeps the Node process alive.

## Definition of done

A change is done when all of the following hold, not just when tests pass:
- A regression test exists for any bug fixed.
- Anything the feature does **not** do is stated in the README (the
  "Browser support" and "Status" sections), not only in an issue comment.
- `CHANGELOG.md` has an entry.
- If the change touches a source's published properties or generated CSS,
  `css/signals.css` / `css/utils.css` are regenerated and committed, and
  `examples/verify.html` is re-checked in at least Chrome and one other
  engine before release.

## Releases

Bump `version` in `package.json` in a PR, add the `CHANGELOG.md` entry, merge,
then `gh release create v<version>` -- the release event triggers
`.github/workflows/publish.yml`, which is idempotent (skips if the version is
already on npm) and re-runs the `generated-css` drift check before publishing.
The repo currently has no `NPM_TOKEN` secret set (John-only step; see
`~/Projects/@johnhenry/ecosystem/NOTEBOOK.md`), so a release-triggered publish
will fail at the publish step until one is added -- `0.0.0` itself was
published manually, outside this workflow.
