/**
 * date -- the wall clock as numbers, in any time zone.
 *
 * Published (`{tag}` is empty for the local zone, "utc" for UTC, otherwise a
 * slug of the time zone, or your own `label`):
 *
 *   date{-tag}-second   0..59
 *   date{-tag}-minute   0..59
 *   date{-tag}-hour     1..12
 *   date{-tag}-hour24   0..23
 *   date{-tag}-am, -pm  0 | 1
 *   date{-tag}-weekday  1..7   ISO: Monday = 1, Sunday = 7
 *   date{-tag}-monthday 1..31
 *   date{-tag}-month    1..12  (not the 0..11 of Date#getMonth)
 *   date{-tag}-year
 *
 * Uses Temporal when the browser has it and falls back to Intl otherwise;
 * both give identical values, including for zones other than the local one.
 * Pass `{ temporal: false }` to force the fallback.
 *
 * Ticks land just after each second boundary (no drift, no sub-second
 * flicker) and stop while the tab is hidden.
 */
import { number } from "../properties.mjs";

const FIELDS = ["second", "minute", "hour", "hour24", "am", "pm", "weekday", "monthday", "month", "year"];
const WEEKDAYS = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

const slug = (zone) => zone.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const date = ({ timeZone, utc = false, label, temporal = true, now = Date.now } = {}) => {
  const zone = utc ? "UTC" : timeZone;
  const tag = label ?? (utc ? "utc" : zone ? slug(zone) : "");
  const key = (field) => `date-${tag ? `${tag}-` : ""}${field}`;

  return {
    name: "date",
    properties: Object.fromEntries(FIELDS.map((field) => [key(field), number(0)])),
    start({ window: win, document: doc, signal, set }) {
      const Temporal = temporal ? win.Temporal ?? globalThis.Temporal : undefined;
      const formatter = Temporal
        ? null
        : new Intl.DateTimeFormat("en-US", {
            timeZone: zone,
            hourCycle: "h23",
            year: "numeric",
            month: "numeric",
            day: "numeric",
            weekday: "short",
            hour: "numeric",
            minute: "numeric",
            second: "numeric",
          });

      const read = (ms) => {
        if (Temporal) {
          const z = Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO(
            zone ?? Temporal.Now.timeZoneId()
          );
          return {
            second: z.second,
            minute: z.minute,
            hour24: z.hour,
            weekday: z.dayOfWeek,
            monthday: z.day,
            month: z.month,
            year: z.year,
          };
        }
        const parts = Object.fromEntries(formatter.formatToParts(ms).map((p) => [p.type, p.value]));
        return {
          second: Number(parts.second),
          minute: Number(parts.minute),
          hour24: Number(parts.hour),
          weekday: WEEKDAYS[parts.weekday],
          monthday: Number(parts.day),
          month: Number(parts.month),
          year: Number(parts.year),
        };
      };

      let timer = null;
      const publish = () => {
        const ms = now();
        const f = read(ms);
        set(key("second"), f.second);
        set(key("minute"), f.minute);
        set(key("hour24"), f.hour24);
        set(key("hour"), f.hour24 % 12 || 12);
        set(key("am"), f.hour24 < 12);
        set(key("pm"), f.hour24 >= 12);
        set(key("weekday"), f.weekday);
        set(key("monthday"), f.monthday);
        set(key("month"), f.month);
        set(key("year"), f.year);
        return ms;
      };
      const tick = () => {
        const ms = publish();
        timer = win.setTimeout(tick, 1000 - (ms % 1000) + 1);
      };
      const stop = () => {
        win.clearTimeout(timer);
        timer = null;
      };

      doc.addEventListener(
        "visibilitychange",
        () => {
          stop();
          if (!doc.hidden) tick();
        },
        { signal }
      );
      signal.addEventListener("abort", stop, { once: true });
      tick();
    },
  };
};
