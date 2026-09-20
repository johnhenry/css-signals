/**
 * core.mjs -- createSignals(): the one object that owns a prefix, a target
 * element, and a lifecycle.
 *
 * Sources (pointer, scroll, viewport, ...) never touch the DOM directly. They
 * receive a context and call `set(key, value)`. The core:
 *
 *   - names the property from the *runtime* prefix (`--{prefix}-{key}`), so
 *     the prefix is a constructor argument, not something baked into the
 *     source or the stylesheet;
 *   - registers each declared property (`CSS.registerProperty`) under that
 *     prefix;
 *   - batches writes to one flush per animation frame and skips writes whose
 *     value has not changed;
 *   - tears everything down through a single AbortSignal on `dispose()`.
 */
import { propertyName } from "./properties.mjs";

const PREFIX = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const KEY = /^[A-Za-z0-9_-]+$/;

export function createSignals({
  prefix = "sig",
  target,
  window: win = globalThis,
  register = true,
  signal: outer,
} = {}) {
  if (typeof prefix !== "string" || (prefix !== "" && !PREFIX.test(prefix))) {
    throw new TypeError(
      `createSignals: invalid prefix ${JSON.stringify(prefix)}. ` +
        `Use "" or a CSS identifier fragment (letters, digits, "-", "_"; not starting with a digit).`
    );
  }
  const doc = win.document;
  const root = target ?? doc?.documentElement;
  if (!root) {
    throw new TypeError("createSignals: no target element and no document.");
  }
  const isRoot = root === doc?.documentElement;

  // Built from the target window's realm: an iframe's (or jsdom's)
  // addEventListener rejects an AbortSignal created in another realm.
  const lifecycle = new (win.AbortController ?? AbortController)();
  const pending = new Map(); // property name -> next value
  const written = new Map(); // property name -> last string written
  const cleanups = [];
  let frame = null;
  let disposed = false;

  const name = (key) => propertyName(prefix, key);

  const flush = () => {
    frame = null;
    for (const [property, value] of pending) {
      const text = String(value);
      if (written.get(property) === text) continue;
      root.style.setProperty(property, text);
      written.set(property, text);
    }
    pending.clear();
  };

  const schedule = () => {
    if (frame !== null) return;
    if (typeof win.requestAnimationFrame === "function") {
      frame = win.requestAnimationFrame(flush);
    } else {
      frame = 0;
      queueMicrotask(() => {
        if (frame === 0) flush();
      });
    }
  };

  const set = (key, value) => {
    if (disposed) return;
    if (typeof key !== "string" || !KEY.test(key)) {
      throw new TypeError(`set: invalid key ${JSON.stringify(key)}.`);
    }
    if (typeof value === "boolean") value = value ? 1 : 0;
    // NaN and +/-Infinity are not valid <number>s; writing them would
    // invalidate the property. Leave the previous value in place.
    if (typeof value === "number" && !Number.isFinite(value)) return;
    pending.set(name(key), value);
    schedule();
  };

  const registerProperties = (properties = {}) => {
    if (!register || typeof win.CSS?.registerProperty !== "function") return;
    for (const [key, def] of Object.entries(properties)) {
      const { syntax = "*", initialValue, inherits = true } = def;
      try {
        win.CSS.registerProperty({
          name: name(key),
          syntax,
          inherits,
          ...(initialValue !== undefined && { initialValue: String(initialValue) }),
        });
      } catch (error) {
        // Registration is per-document and permanent. A second instance using
        // the same prefix re-registers the same names; that is fine.
        if (error?.name === "InvalidModificationError") continue;
        // A browser that refuses a registration (WebKit 18 rejects `<string>`,
        // for one) can still run the source: the value is just an untyped
        // custom property. Warn rather than throw out of use().
        win.console?.warn?.(
          `css-signals: could not register ${name(key)} as ${syntax}: ${error?.message ?? error}. ` +
            `It will work as an untyped custom property.`
        );
      }
    }
  };

  /**
   * Register one property whose name is only known at runtime (a key code, a
   * gamepad button, an input's name). Idempotent.
   */
  const define = (key, def) => registerProperties({ [key]: def });

  /**
   * Install a stylesheet for the lifetime of this instance. Uses a
   * constructable stylesheet where available and a <style> element otherwise.
   * Returns a function that removes it.
   */
  const adoptCss = (text) => {
    if (win.CSSStyleSheet && doc && "adoptedStyleSheets" in doc) {
      try {
        const sheet = new win.CSSStyleSheet();
        sheet.replaceSync(text);
        doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
        return () => {
          doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter((s) => s !== sheet);
        };
      } catch {
        // fall through to <style>
      }
    }
    const style = doc.createElement("style");
    style.dataset.cssSignals = prefix;
    style.textContent = text;
    (doc.head ?? doc.documentElement).append(style);
    return () => style.remove();
  };

  const context = Object.freeze({
    prefix,
    target: root,
    window: win,
    document: doc,
    signal: lifecycle.signal,
    isRoot,
    set,
    name,
    define,
    adoptCss,
  });

  const use = (...sources) => {
    if (disposed) throw new Error("createSignals: already disposed.");
    for (const source of sources) {
      registerProperties(source.properties);
      const cleanup = source.start(context);
      if (typeof cleanup === "function") cleanups.push(cleanup);
    }
    return api;
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    lifecycle.abort();
    if (frame !== null && frame !== 0 && typeof win.cancelAnimationFrame === "function") {
      win.cancelAnimationFrame(frame);
    }
    frame = null;
    pending.clear();
    for (const cleanup of cleanups.reverse()) cleanup();
    cleanups.length = 0;
    for (const property of written.keys()) root.style.removeProperty(property);
    written.clear();
  };

  const api = { prefix, target: root, name, set, define, use, flush, dispose };
  if (Symbol.dispose) api[Symbol.dispose] = dispose;
  outer?.addEventListener("abort", dispose, { once: true });
  if (outer?.aborted) dispose();
  return api;
}
