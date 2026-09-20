/**
 * framed -- whether the page is the top-level document or inside an iframe.
 *
 * Published: framed-top, framed-iframe   (0 | 1, opposites)
 *
 * CSS cannot tell; this is a one-time fact, so there is no listener.
 */
import { number } from "../properties.mjs";

export const framed = () => ({
  name: "framed",
  properties: { "framed-top": number(0), "framed-iframe": number(0) },
  start({ window: win, set }) {
    const top = win.self === win.top;
    set("framed-top", top);
    set("framed-iframe", !top);
  },
});
