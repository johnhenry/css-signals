export interface PropertyDefinition {
  /** A CSS syntax string, e.g. "<number>". Defaults to "*". */
  syntax?: string;
  initialValue?: string | number;
  /** Defaults to true: signals are written on a root and read by descendants. */
  inherits?: boolean;
}

export interface SignalContext {
  readonly prefix: string;
  readonly target: Element;
  readonly window: Window & typeof globalThis;
  readonly document: Document;
  /** Aborted on dispose(). Pass it to addEventListener to clean up for free. */
  readonly signal: AbortSignal;
  /** True when the target is document.documentElement. */
  readonly isRoot: boolean;
  /** Queue a write. Batched per frame; NaN and Infinity are ignored. */
  set(key: string, value: number | string | boolean): void;
  /** The full property name for a key, e.g. "--sig-pointer-x". */
  name(key: string): string;
  /** Register a property whose name is only known at runtime (a key code, a pad button). Idempotent. */
  define(key: string, def: PropertyDefinition): void;
  /** Install a stylesheet for the lifetime of the instance. Returns a remover. */
  adoptCss(css: string): () => void;
}

export interface Source {
  name: string;
  /** Unprefixed key -> registration. */
  properties?: Record<string, PropertyDefinition>;
  /** Static/native CSS for a prefix, used by sourcesCss(). */
  css?(prefix: string): string;
  /** May return a cleanup function. */
  start(context: SignalContext): void | (() => void);
}

export interface CreateSignalsOptions {
  /** "" or a CSS identifier fragment. Default "sig". */
  prefix?: string;
  /** Default: document.documentElement. */
  target?: Element;
  /** Default: globalThis. Inject a window for tests or iframes. */
  window?: Window & typeof globalThis;
  /** Register properties with CSS.registerProperty. Default true. */
  register?: boolean;
  /** Dispose when this signal aborts. */
  signal?: AbortSignal;
}

export interface Signals {
  readonly prefix: string;
  readonly target: Element;
  name(key: string): string;
  set(key: string, value: number | string | boolean): void;
  define(key: string, def: PropertyDefinition): void;
  use(...sources: Source[]): Signals;
  /** Write pending values now instead of on the next frame. */
  flush(): void;
  dispose(): void;
  [Symbol.dispose]?: () => void;
}

export function createSignals(options?: CreateSignalsOptions): Signals;

export function number(initialValue?: number): PropertyDefinition;
export function propertyName(prefix: string, key: string): string;
export function propertyRule(prefix: string, key: string, def: PropertyDefinition): string;
export function sourcesCss(prefix: string, sources: Source[]): string;
/** `@function`s for signal values, named from the prefix: --{prefix}-progress(), -lerp(), -map(). */
export function functionsCss(prefix: string): string;

export function pointer(): Source;
export function viewport(): Source;
export function scroll(options?: { raw?: boolean; native?: boolean }): Source;
/** CSS that produces scroll progress natively, for one prefix or several sharing a stylesheet. */
export function nativeScrollCss(prefixes: string | string[]): string;

export function keyboard(options?: { keys?: string[] }): Source;
export function date(options?: {
  /** IANA zone, e.g. "Asia/Tokyo". Default: the local zone. */
  timeZone?: string;
  /** Shorthand for timeZone "UTC" with the tag "utc". */
  utc?: boolean;
  /** Overrides the tag in the property names (date-{label}-hour). */
  label?: string;
  /** Use Temporal when available. Default true. */
  temporal?: boolean;
  /** Clock, in epoch milliseconds. Default Date.now. */
  now?: () => number;
}): Source;
export function gamepad(options?: { limit?: number; deadzone?: number }): Source;
export function audio(options: { analyser: AnalyserNode; bins?: number }): Source;
export function microphoneAnalyser(options?: {
  fftSize?: number;
  window?: Window & typeof globalThis;
}): Promise<{ analyser: AnalyserNode; stop(): Promise<void> }>;
export function input(options?: { attribute?: string }): Source;
/** Quote a value as a CSS string. */
export function cssString(value: unknown): string;
export function random(options?: { count?: number; seed?: number }): Source & { reset(): void };
export function cycle(options?: { attribute?: string; valuesAttribute?: string }): Source;
export function framed(): Source;
/** scrolled / scrollable, clamped to 0..1; 0 when there is nothing to scroll. */
export function progress(position: number, max: number): number;
