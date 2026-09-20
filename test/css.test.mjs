import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cycle, date, framed, functionsCss, gamepad, input, keyboard, pointer, propertyName, propertyRule, random,
  scroll, sourcesCss, viewport,
} from "../src/index.mjs";

test("propertyName", () => {
  assert.equal(propertyName("sig", "x"), "--sig-x");
  assert.equal(propertyName("", "x"), "--x");
});

test("propertyRule emits a registered @property", () => {
  assert.equal(
    propertyRule("app", "level", { syntax: "<number>", initialValue: 1, inherits: true }),
    `@property --app-level {\n  syntax: "<number>";\n  inherits: true;\n  initial-value: 1;\n}`
  );
});

test("sourcesCss follows the prefix", () => {
  const css = sourcesCss("app", [pointer(), scroll(), viewport()]);
  assert.match(css, /@property --app-pointer-x /);
  assert.match(css, /@property --app-viewport-width /);
  assert.match(css, /@keyframes app-scroll-y-progress/);
  assert.doesNotMatch(css, /--sig-/, "no default prefix leaks into another prefix's CSS");
});

test("sourcesCss with an empty prefix is unprefixed", () => {
  const css = sourcesCss("", [pointer()]);
  assert.match(css, /@property --pointer-x /);
});

test("the build script honours --prefix and --out", () => {
  const out = join(mkdtempSync(join(tmpdir(), "css-signals-")), "signals.css");
  execFileSync(process.execPath, ["scripts/build-css.mjs", "--prefix", "demo", "--out", out]);
  const css = readFileSync(out, "utf8");
  assert.match(css, /prefix: "demo"/);
  assert.match(css, /@property --demo-scroll-y-progress /);
});

test("the build script rejects a bad prefix", () => {
  assert.throws(
    () =>
      execFileSync(process.execPath, ["scripts/build-css.mjs", "--prefix", "1bad"], {
        stdio: "pipe",
      }),
    /Invalid prefix|status 1/
  );
});

test("sourcesCss covers every source with statically known names", () => {
  const css = sourcesCss("app", [
    keyboard(), date(), date({ utc: true }), date({ timeZone: "Asia/Tokyo" }), framed(), random({ count: 2 }),
    gamepad({ limit: 2 }), input(), cycle(),
  ]);
  for (const name of [
    "--app-key-alt", "--app-date-hour", "--app-date-utc-hour", "--app-date-asia-tokyo-hour",
    "--app-framed-top", "--app-random-1", "--app-gamepad-1-connected",
  ]) {
    assert.match(css, new RegExp(`@property ${name} `), name);
  }
  assert.doesNotMatch(css, /--sig-/);
});

test("the native scroll rule is layered and lists every prefix once", () => {
  const css = sourcesCss("x", [scroll()]);
  assert.match(css, /^@property[\s\S]*@layer css-signals \{/m);
  assert.equal(css.match(/animation:/g).length, 1);
});

test("functionsCss names the functions from the prefix", () => {
  const css = functionsCss("app");
  for (const name of ["progress", "lerp", "map"]) {
    assert.match(css, new RegExp(`@function --app-${name}\\(`), name);
  }
  assert.doesNotMatch(css, /--sig-/);
  assert.match(functionsCss(""), /@function --progress\(/);
});

test("the build script writes utils.css alongside signals.css", () => {
  const dir = mkdtempSync(join(tmpdir(), "css-signals-"));
  execFileSync(process.execPath, [
    "scripts/build-css.mjs", "--prefix", "demo",
    "--out", join(dir, "a.css"), "--utils-out", join(dir, "b.css"),
  ]);
  assert.match(readFileSync(join(dir, "b.css"), "utf8"), /@function --demo-map\(/);
  assert.match(readFileSync(join(dir, "a.css"), "utf8"), /@property --demo-key-alt /);
});
