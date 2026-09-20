import { after, test } from "node:test";
import assert from "node:assert/strict";
import {
  audio,
  createSignals,
  cssString,
  cycle,
  date,
  framed,
  gamepad,
  input,
  keyboard,
  microphoneAnalyser,
  random,
} from "../src/index.mjs";
import { closeWindows, makeWindow, nextFrame, read } from "./_dom.mjs";

after(closeWindows);

const key = (win, type, init) =>
  win.document.dispatchEvent(new win.KeyboardEvent(type, { bubbles: true, ...init }));

/** A CSS.registerProperty spy; returns the names registered so far. */
const spyRegistrations = (win) => {
  const names = [];
  win.CSS = { supports: () => false, registerProperty: (def) => names.push(def.name) };
  return names;
};

// ---- keyboard --------------------------------------------------------------

test("keyboard: keys and modifiers are 1 while held, 0 after", () => {
  const win = makeWindow();
  const s = createSignals({ window: win }).use(keyboard());
  key(win, "keydown", { code: "KeyW", key: "w", shiftKey: true });
  s.flush();
  assert.equal(read(win, "--sig-key-KeyW"), "1");
  assert.equal(read(win, "--sig-key-shift"), "1");
  assert.equal(read(win, "--sig-key-ctrl"), "0");

  key(win, "keyup", { code: "KeyW", key: "w" });
  s.flush();
  assert.equal(read(win, "--sig-key-KeyW"), "0");
  assert.equal(read(win, "--sig-key-shift"), "0");
});

test("keyboard: key codes are registered on first press; listed keys up front", () => {
  const win = makeWindow();
  const names = spyRegistrations(win);
  createSignals({ window: win }).use(keyboard({ keys: ["Space"] }));
  assert.ok(names.includes("--sig-key-Space"), "listed key registered at start");
  assert.ok(!names.includes("--sig-key-KeyQ"));
  key(win, "keydown", { code: "KeyQ" });
  key(win, "keydown", { code: "KeyQ" }); // auto-repeat
  assert.equal(names.filter((n) => n === "--sig-key-KeyQ").length, 1, "registered once");
});

test("keyboard: window blur releases every held key", () => {
  const win = makeWindow();
  const s = createSignals({ window: win }).use(keyboard());
  key(win, "keydown", { code: "KeyA", ctrlKey: true });
  key(win, "keydown", { code: "KeyB", ctrlKey: true });
  win.dispatchEvent(new win.Event("blur"));
  s.flush();
  for (const k of ["--sig-key-KeyA", "--sig-key-KeyB", "--sig-key-ctrl"]) {
    assert.equal(read(win, k), "0", k);
  }
});

test("keyboard: hiding the tab releases held keys", () => {
  const win = makeWindow();
  const s = createSignals({ window: win }).use(keyboard());
  key(win, "keydown", { code: "KeyA" });
  Object.defineProperty(win.document, "hidden", { value: true, configurable: true });
  win.document.dispatchEvent(new win.Event("visibilitychange"));
  s.flush();
  assert.equal(read(win, "--sig-key-KeyA"), "0");
});

test("keyboard: releasing Meta releases the others (macOS sends no keyup for them)", () => {
  const win = makeWindow();
  const s = createSignals({ window: win }).use(keyboard());
  key(win, "keydown", { code: "MetaLeft", key: "Meta", metaKey: true });
  key(win, "keydown", { code: "KeyC", key: "c", metaKey: true });
  key(win, "keyup", { code: "MetaLeft", key: "Meta" });
  s.flush();
  assert.equal(read(win, "--sig-key-KeyC"), "0");
  assert.equal(read(win, "--sig-key-meta"), "0");
});

test("keyboard: events without a usable code are ignored", () => {
  const win = makeWindow();
  const s = createSignals({ window: win }).use(keyboard());
  assert.doesNotThrow(() => {
    key(win, "keydown", { code: "" });
    key(win, "keydown", { code: "Weird Code!" });
  });
  s.flush();
});

// ---- date ------------------------------------------------------------------

const SUN_2026_09_20_15_04_05 = Date.UTC(2026, 8, 20, 15, 4, 5, 250);

test("date (Intl fallback): UTC fields, ISO weekday and 1-based month", () => {
  const win = makeWindow();
  const s = createSignals({ window: win }).use(
    date({ utc: true, temporal: false, now: () => SUN_2026_09_20_15_04_05 })
  );
  s.flush();
  const v = (field) => read(win, `--sig-date-utc-${field}`);
  assert.deepEqual(
    ["second", "minute", "hour", "hour24", "am", "pm", "weekday", "monthday", "month", "year"].map(v),
    ["5", "4", "3", "15", "0", "1", "7", "20", "9", "2026"]
  );
});

test("date (Intl fallback): another time zone, and midnight is hour 0 (not 24)", () => {
  const win = makeWindow();
  const s = createSignals({ window: win }).use(
    date({ timeZone: "Asia/Tokyo", temporal: false, now: () => SUN_2026_09_20_15_04_05 })
  );
  s.flush();
  const v = (field) => read(win, `--sig-date-asia-tokyo-${field}`);
  // 15:04 UTC is 00:04 the next day in Tokyo (UTC+9), a Monday.
  assert.equal(v("hour24"), "0");
  assert.equal(v("hour"), "12");
  assert.equal(v("am"), "1");
  assert.equal(v("weekday"), "1");
  assert.equal(v("monthday"), "21");
});

test("date (Intl fallback): a zone behind UTC", () => {
  const win = makeWindow();
  const s = createSignals({ window: win }).use(
    date({ timeZone: "America/Los_Angeles", label: "la", temporal: false, now: () => SUN_2026_09_20_15_04_05 })
  );
  s.flush();
  assert.equal(read(win, "--sig-date-la-hour24"), "8"); // PDT, UTC-7
  assert.equal(read(win, "--sig-date-la-weekday"), "7");
});

test("date (Intl fallback): local zone matches Date's own getters", () => {
  const win = makeWindow();
  const s = createSignals({ window: win }).use(date({ temporal: false, now: () => SUN_2026_09_20_15_04_05 }));
  s.flush();
  const d = new Date(SUN_2026_09_20_15_04_05);
  assert.equal(read(win, "--sig-date-hour24"), String(d.getHours()));
  assert.equal(read(win, "--sig-date-monthday"), String(d.getDate()));
  assert.equal(read(win, "--sig-date-weekday"), String(d.getDay() || 7));
});

test("date: uses Temporal when present, mapping its fields through", () => {
  const win = makeWindow();
  const seen = [];
  win.Temporal = {
    Now: { timeZoneId: () => "Local/Zone" },
    Instant: {
      fromEpochMilliseconds: () => ({
        toZonedDateTimeISO: (zone) => {
          seen.push(zone);
          return { second: 9, minute: 8, hour: 0, dayOfWeek: 2, day: 3, month: 4, year: 2031 };
        },
      }),
    },
  };
  const s = createSignals({ window: win }).use(date({ now: () => 0 }), date({ utc: true, now: () => 0 }));
  s.flush();
  assert.deepEqual(seen, ["Local/Zone", "UTC"]);
  assert.equal(read(win, "--sig-date-year"), "2031");
  assert.equal(read(win, "--sig-date-hour"), "12", "hour 0 is 12 am");
  assert.equal(read(win, "--sig-date-am"), "1");
  assert.equal(read(win, "--sig-date-weekday"), "2");
  assert.equal(read(win, "--sig-date-utc-month"), "4");
});

test("date: { temporal: false } ignores a present Temporal", () => {
  const win = makeWindow();
  win.Temporal = { Now: {}, Instant: { fromEpochMilliseconds: () => assert.fail("used Temporal") } };
  const s = createSignals({ window: win }).use(date({ utc: true, temporal: false, now: () => 0 }));
  s.flush();
  assert.equal(read(win, "--sig-date-utc-year"), "1970");
});

test("date: real Temporal and Intl agree", { skip: !globalThis.Temporal && "no Temporal in this runtime" }, () => {
  for (const timeZone of ["UTC", "Asia/Tokyo", "America/Los_Angeles", "Australia/Lord_Howe"]) {
    for (const now of [0, SUN_2026_09_20_15_04_05, Date.UTC(2027, 11, 31, 23, 59, 59), Date.UTC(2026, 2, 8, 10, 0, 0)]) {
      const results = [true, false].map((temporal) => {
        const win = makeWindow();
        const s = createSignals({ window: win }).use(date({ timeZone, label: "z", temporal, now: () => now }));
        s.flush();
        return win.document.documentElement.style.cssText;
      });
      assert.equal(results[0], results[1], `${timeZone} @ ${now}`);
    }
  }
});

test("date: ticks land just after each second boundary, and stop while hidden", () => {
  const win = makeWindow();
  const timers = [];
  let cleared = 0;
  win.setTimeout = (fn, ms) => (timers.push({ fn, ms }), timers.length);
  win.clearTimeout = () => (cleared += 1);
  let ms = SUN_2026_09_20_15_04_05; // .250 into the second
  const s = createSignals({ window: win }).use(date({ utc: true, now: () => ms }));

  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 751, "1000 - 250 + 1");

  ms += 751;
  timers[0].fn();
  s.flush();
  assert.equal(read(win, "--sig-date-utc-second"), "6");
  assert.equal(timers[1].ms, 1000, "exactly on the boundary + 1 ms would be 1000 - 1 + 1");

  Object.defineProperty(win.document, "hidden", { value: true, configurable: true });
  win.document.dispatchEvent(new win.Event("visibilitychange"));
  assert.equal(timers.length, 2, "no new timer while hidden");
  Object.defineProperty(win.document, "hidden", { value: false, configurable: true });
  win.document.dispatchEvent(new win.Event("visibilitychange"));
  assert.equal(timers.length, 3, "resumes when visible");

  const before = cleared;
  s.dispose();
  assert.ok(cleared > before, "timer cleared on dispose");
});

// ---- gamepad ---------------------------------------------------------------

const pad = (index, { buttons = [], axes = [] } = {}) => ({
  index,
  connected: true,
  buttons: buttons.map((value) => ({ value })),
  axes,
});
const fakePads = (win) => {
  const state = { pads: [], calls: 0 };
  Object.defineProperty(win.navigator, "getGamepads", {
    configurable: true,
    value: () => (state.calls += 1, state.pads),
  });
  return state;
};
const padEvent = (win, type, gamepad) =>
  win.dispatchEvent(Object.assign(new win.Event(type), { gamepad }));

test("gamepad: publishes buttons, axes and connected for a pad that is already there", () => {
  const win = makeWindow();
  const state = fakePads(win);
  state.pads = [pad(0, { buttons: [1, 0.5], axes: [-1, 0.5] })];
  const s = createSignals({ window: win }).use(gamepad());
  s.flush();
  assert.equal(read(win, "--sig-gamepad-0-connected"), "1");
  assert.equal(read(win, "--sig-gamepad-0-button-0"), "1");
  assert.equal(read(win, "--sig-gamepad-0-button-1"), "0.5");
  assert.equal(read(win, "--sig-gamepad-0-axis-0"), "-1");
  assert.equal(read(win, "--sig-gamepad-0-axis-1"), "0.5");
});

test("gamepad: stick drift inside the deadzone reads 0", () => {
  const win = makeWindow();
  const state = fakePads(win);
  state.pads = [pad(0, { axes: [0.03, -0.049, 0.06] })];
  const s = createSignals({ window: win }).use(gamepad({ deadzone: 0.05 }));
  s.flush();
  assert.equal(read(win, "--sig-gamepad-0-axis-0"), "0");
  assert.equal(read(win, "--sig-gamepad-0-axis-1"), "0");
  assert.equal(read(win, "--sig-gamepad-0-axis-2"), "0.06");
});

test("gamepad: starts polling on connect, follows changes, and zeroes a pad on disconnect", async () => {
  const win = makeWindow();
  const state = fakePads(win);
  const s = createSignals({ window: win }).use(gamepad());
  assert.equal(state.calls, 1, "one look at start");
  await nextFrame(win);
  assert.equal(state.calls, 1, "no polling with nothing connected");

  state.pads = [pad(1, { buttons: [0], axes: [0] })];
  padEvent(win, "gamepadconnected", state.pads[0]);
  s.flush();
  assert.equal(read(win, "--sig-gamepad-1-connected"), "1");

  state.pads = [pad(1, { buttons: [1], axes: [0.8] })];
  await nextFrame(win);
  await nextFrame(win);
  s.flush();
  assert.equal(read(win, "--sig-gamepad-1-button-0"), "1");
  assert.equal(read(win, "--sig-gamepad-1-axis-0"), "0.8");

  const gone = state.pads[0];
  state.pads = [];
  padEvent(win, "gamepaddisconnected", gone);
  s.flush();
  assert.equal(read(win, "--sig-gamepad-1-connected"), "0");
  assert.equal(read(win, "--sig-gamepad-1-button-0"), "0");
  assert.equal(read(win, "--sig-gamepad-1-axis-0"), "0");

  await nextFrame(win);
  await nextFrame(win);
  const calls = state.calls;
  await nextFrame(win);
  await nextFrame(win);
  assert.equal(state.calls, calls, "polling stops once no pad is connected");
});

test("gamepad: pads beyond `limit` are ignored; a stopped instance stops polling", async () => {
  const win = makeWindow();
  const state = fakePads(win);
  state.pads = [pad(0, { buttons: [1] }), pad(2, { buttons: [1] })];
  const s = createSignals({ window: win }).use(gamepad({ limit: 2 }));
  s.flush();
  assert.equal(read(win, "--sig-gamepad-0-button-0"), "1");
  assert.equal(read(win, "--sig-gamepad-2-button-0"), "");

  s.dispose();
  const calls = state.calls;
  await nextFrame(win);
  await nextFrame(win);
  assert.equal(state.calls, calls);
});

// ---- audio -----------------------------------------------------------------

/** 16-point FFT at 16 kHz: 8 bins of 1000 Hz each. bass = bin 0, mid = bins 1-3, treble = bins 4-7. */
const fakeAnalyser = ({ freq, time }) => ({
  fftSize: 16,
  frequencyBinCount: 8,
  context: { sampleRate: 16000 },
  calls: 0,
  getByteFrequencyData(array) {
    this.calls += 1;
    array.set(freq);
  },
  getByteTimeDomainData(array) {
    array.set(time);
  },
});

test("audio: level and band energies", () => {
  const win = makeWindow();
  const analyser = fakeAnalyser({
    freq: [255, 0, 0, 0, 51, 51, 51, 51],
    time: Array.from({ length: 16 }, (_, i) => (i % 2 ? 1 : 255)),
  });
  const s = createSignals({ window: win }).use(audio({ analyser }));
  s.flush();
  assert.ok(Math.abs(Number(read(win, "--sig-audio-level")) - 0.992) < 0.001);
  assert.equal(read(win, "--sig-audio-bass"), "1");
  assert.equal(read(win, "--sig-audio-mid"), "0");
  assert.equal(Number(read(win, "--sig-audio-treble")).toFixed(2), "0.20");
});

test("audio: silence reads 0", () => {
  const win = makeWindow();
  const analyser = fakeAnalyser({ freq: new Array(8).fill(0), time: new Array(16).fill(128) });
  const s = createSignals({ window: win }).use(audio({ analyser }));
  s.flush();
  assert.equal(read(win, "--sig-audio-level"), "0");
});

test("audio: { bins } splits the spectrum into equal slices", () => {
  const win = makeWindow();
  const analyser = fakeAnalyser({ freq: [255, 0, 0, 0, 51, 51, 51, 51], time: new Array(16).fill(128) });
  const s = createSignals({ window: win }).use(audio({ analyser, bins: 2 }));
  s.flush();
  assert.equal(read(win, "--sig-audio-bin-0"), "0.25");
  assert.equal(read(win, "--sig-audio-bin-1"), "0.2");
});

test("audio: keeps reading each frame until disposed", async () => {
  const win = makeWindow();
  const analyser = fakeAnalyser({ freq: new Array(8).fill(0), time: new Array(16).fill(128) });
  const s = createSignals({ window: win }).use(audio({ analyser }));
  const start = analyser.calls;
  await nextFrame(win);
  await nextFrame(win);
  assert.ok(analyser.calls > start);
  s.dispose();
  const stopped = analyser.calls;
  await nextFrame(win);
  await nextFrame(win);
  assert.equal(analyser.calls, stopped);
});

test("audio: requires an analyser", () => {
  assert.throws(() => audio(), TypeError);
  assert.throws(() => audio({ analyser: {} }), TypeError);
});

test("microphoneAnalyser wires the stream to an analyser and can stop", async () => {
  const log = [];
  const track = { stop: () => log.push("track stopped") };
  class FakeAudioContext {
    state = "suspended";
    resume = async () => log.push("resumed");
    close = async () => log.push("closed");
    createAnalyser = () => (this.analyser = { fftSize: 2048 });
    createMediaStreamSource = (stream) => ({
      connect: (node) => log.push(stream.id === "mic" && node === this.analyser ? "connected" : "wrong wiring"),
    });
  }
  const win = {
    navigator: {
      mediaDevices: {
        getUserMedia: async (constraints) => {
          log.push(JSON.stringify(constraints));
          return { id: "mic", getTracks: () => [track] };
        },
      },
    },
    AudioContext: FakeAudioContext,
  };
  const { analyser, stop } = await microphoneAnalyser({ window: win, fftSize: 256 });
  assert.equal(analyser.fftSize, 256);
  await stop();
  assert.deepEqual(log, ['{"audio":true,"video":false}', "resumed", "connected", "track stopped", "closed"]);
});

// ---- input -----------------------------------------------------------------

const form = (win, html) => {
  win.document.body.innerHTML = html;
  return (selector) => win.document.querySelector(selector);
};
const fire = (win, el, type = "input") => el.dispatchEvent(new win.Event(type, { bubbles: true }));

test("input: reads controls at start, then follows them", () => {
  const win = makeWindow();
  const $ = form(
    win,
    `<input id="v" type="range" min="0" max="1" step="any" value="0.25" data-signal="volume">
     <input id="d" type="checkbox" checked data-signal="dark">
     <input id="n" type="text" value="Ada" data-signal="name">`
  );
  const s = createSignals({ window: win }).use(input());
  s.flush();
  assert.equal(read(win, "--sig-input-volume"), "0.25");
  assert.equal(read(win, "--sig-input-dark"), "1");
  assert.equal(read(win, "--sig-input-name"), '"Ada"');

  $("#v").value = "0.75";
  fire(win, $("#v"));
  $("#d").checked = false;
  fire(win, $("#d"));
  $("#n").value = "Grace";
  fire(win, $("#n"));
  s.flush();
  assert.equal(read(win, "--sig-input-volume"), "0.75");
  assert.equal(read(win, "--sig-input-dark"), "0");
  assert.equal(read(win, "--sig-input-name"), '"Grace"');
});

test("input: text is quoted so it is a valid CSS string", () => {
  assert.equal(cssString('say "hi"'), '"say \\"hi\\""');
  assert.equal(cssString("back\\slash"), '"back\\\\slash"');
  assert.equal(cssString("two\nlines"), '"two\\a lines"');
  assert.equal(cssString(5), '"5"');
});

test("input: radios publish only the checked one", () => {
  const win = makeWindow();
  const $ = form(
    win,
    `<input id="a" type="radio" name="s" value="small" data-signal="size">
     <input id="b" type="radio" name="s" value="large" data-signal="size" checked>`
  );
  const s = createSignals({ window: win }).use(input());
  s.flush();
  assert.equal(read(win, "--sig-input-size"), '"large"');
  $("#a").checked = true;
  fire(win, $("#a"), "change");
  s.flush();
  assert.equal(read(win, "--sig-input-size"), '"small"');
});

test("input: controls added later work; bad names and cleared numbers are skipped", () => {
  const win = makeWindow();
  const s = createSignals({ window: win }).use(input());
  win.document.body.innerHTML = `<input id="late" type="range" min="0" max="10" value="4" data-signal="late">
    <input id="bad" type="text" value="x" data-signal="not valid!">
    <input id="num" type="number" data-signal="count">`;
  for (const id of ["late", "bad", "num"]) fire(win, win.document.getElementById(id));
  s.flush();
  assert.equal(read(win, "--sig-input-late"), "4");
  assert.equal(win.document.documentElement.style.cssText.includes("not valid"), false);
  assert.equal(read(win, "--sig-input-count"), "", "an empty number input has no value to publish");
});

test("input: the attribute is configurable, and registrations are typed", () => {
  const win = makeWindow();
  const registrations = [];
  win.CSS = { supports: () => false, registerProperty: (def) => registrations.push(def) };
  form(win, `<input type="range" value="3" data-var="a"><input type="text" value="x" data-var="b">`);
  createSignals({ window: win }).use(input({ attribute: "data-var" }));
  assert.deepEqual(
    registrations.map(({ name, syntax, initialValue }) => [name, syntax, initialValue]),
    [
      ["--sig-input-a", "<number>", "0"],
      ["--sig-input-b", "*", undefined], // not <string>: WebKit 18 rejects it
    ]
  );
});

// ---- random ----------------------------------------------------------------

test("random: count values in [0, 1)", () => {
  const win = makeWindow();
  const s = createSignals({ window: win }).use(random({ count: 3 }));
  s.flush();
  for (let i = 0; i < 3; i++) {
    const v = Number(read(win, `--sig-random-${i}`));
    assert.ok(v >= 0 && v < 1, `random-${i} = ${v}`);
  }
  assert.equal(read(win, "--sig-random-3"), "");
});

test("random: a seed makes it reproducible; different seeds differ", () => {
  const roll = (seed) => {
    const win = makeWindow();
    const s = createSignals({ window: win }).use(random({ count: 4, seed }));
    s.flush();
    return [0, 1, 2, 3].map((i) => read(win, `--sig-random-${i}`)).join(",");
  };
  assert.equal(roll(42), roll(42));
  assert.notEqual(roll(42), roll(43));
  assert.equal(new Set(roll(42).split(",")).size, 4, "values within one roll differ");
});

test("random: reset() re-rolls; before start it is a no-op", () => {
  const win = makeWindow();
  const dice = random({ count: 2, seed: 7 });
  assert.doesNotThrow(() => dice.reset());
  const s = createSignals({ window: win }).use(dice);
  s.flush();
  const first = read(win, "--sig-random-0");
  dice.reset();
  s.flush();
  assert.notEqual(read(win, "--sig-random-0"), first);
});

// ---- cycle -----------------------------------------------------------------

test("cycle: publishes the first value, advances on click, and wraps", () => {
  const win = makeWindow();
  const $ = form(win, `<button id="b" data-signal-cycle="accent" data-signal-values="red; green ;blue">next</button>`);
  const s = createSignals({ window: win }).use(cycle());
  s.flush();
  const state = () => [read(win, "--sig-cycle-accent"), read(win, "--sig-cycle-accent-index")];
  assert.deepEqual(state(), ["red", "0"]);

  const seen = [];
  for (let i = 0; i < 4; i++) {
    $("#b").click();
    s.flush();
    seen.push(state().join(":"));
  }
  assert.deepEqual(seen, ["green:1", "blue:2", "red:0", "green:1"]);
});

test("cycle: a click on a child of the control counts, and controls share a name", () => {
  const win = makeWindow();
  const $ = form(
    win,
    `<button id="a" data-signal-cycle="mode" data-signal-values="a;b;c"><span id="inner">x</span></button>
     <button id="b" data-signal-cycle="mode" data-signal-values="a;b;c">y</button>`
  );
  const s = createSignals({ window: win }).use(cycle());
  $("#inner").click();
  $("#b").click();
  s.flush();
  assert.equal(read(win, "--sig-cycle-mode"), "c");
});

test("cycle: elements without a name or values are ignored; attributes are configurable", () => {
  const win = makeWindow();
  const $ = form(
    win,
    `<button id="nv" data-signal-cycle="x">no values</button>
     <button id="ok" data-c="k" data-v="1;2">ok</button>`
  );
  const s = createSignals({ window: win }).use(cycle({ attribute: "data-c", valuesAttribute: "data-v" }));
  $("#nv").click();
  $("#ok").click();
  s.flush();
  assert.equal(read(win, "--sig-cycle-x"), "");
  assert.equal(read(win, "--sig-cycle-k"), "2");
});

// ---- framed ----------------------------------------------------------------

test("framed: top-level and iframe are opposites", () => {
  const written = {};
  const run = (win) => {
    for (const k of Object.keys(written)) delete written[k];
    framed().start({ window: win, set: (name, value) => (written[name] = value) });
    return { ...written };
  };
  const top = { self: 1 };
  top.top = top.self;
  assert.deepEqual(run(top), { "framed-top": true, "framed-iframe": false });
  assert.deepEqual(run({ self: 1, top: 2 }), { "framed-top": false, "framed-iframe": true });
});

test("framed: publishes 1/0 through the core", () => {
  const win = makeWindow();
  const s = createSignals({ window: win }).use(framed());
  s.flush();
  assert.equal(read(win, "--sig-framed-top"), "1");
  assert.equal(read(win, "--sig-framed-iframe"), "0");
});

// ---- core: define() --------------------------------------------------------

test("define(): registers a runtime-named property under the prefix, once", () => {
  const win = makeWindow();
  const names = spyRegistrations(win);
  const s = createSignals({ window: win, prefix: "app" });
  s.define("thing", { syntax: "<number>", initialValue: 0 });
  s.define("thing", { syntax: "<number>", initialValue: 0 });
  assert.deepEqual(names, ["--app-thing", "--app-thing"], "asked twice; the browser rejects the repeat and we tolerate it");
});
