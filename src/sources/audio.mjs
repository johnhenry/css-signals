/**
 * audio -- loudness and frequency bands from a Web Audio AnalyserNode.
 *
 * Published:
 *
 *   audio-level                     0..1  RMS loudness
 *   audio-bass, audio-mid, audio-treble   0..1  average energy (below 250 Hz, 250-4000 Hz, above)
 *   audio-bin-{i}                   0..1  only with `{ bins: N }`: N equal slices of the spectrum
 *
 * Takes an AnalyserNode you already have (the module this replaces subclassed
 * AnalyserNode). It reads on animation frames, so it stops when the tab is
 * hidden, and it publishes a handful of values rather than one variable per
 * sample: the original wrote `fftSize` + `frequencyBinCount` custom properties
 * every frame (hundreds), which is what made it slow. Colour encoding is
 * dropped; feed a number into `color-mix()` or `oklch()` in CSS instead.
 *
 * `microphoneAnalyser()` is a convenience for the common case.
 */
import { number } from "../properties.mjs";

const mean = (bytes, from, to) => {
  let sum = 0;
  let count = 0;
  for (let i = from; i < to && i < bytes.length; i++) {
    sum += bytes[i];
    count += 1;
  }
  return count ? sum / count / 255 : 0;
};

export const audio = ({ analyser, bins = 0 } = {}) => {
  if (typeof analyser?.getByteFrequencyData !== "function") {
    throw new TypeError("audio: pass { analyser } -- an AnalyserNode.");
  }
  return {
    name: "audio",
    properties: {
      "audio-level": number(0),
      "audio-bass": number(0),
      "audio-mid": number(0),
      "audio-treble": number(0),
      ...Object.fromEntries(Array.from({ length: bins }, (_, i) => [`audio-bin-${i}`, number(0)])),
    },
    start({ window: win, signal, set }) {
      const time = new Uint8Array(analyser.fftSize);
      const freq = new Uint8Array(analyser.frequencyBinCount);
      const hz = (analyser.context?.sampleRate ?? 48000) / analyser.fftSize; // Hz per bin
      const bass = Math.ceil(250 / hz);
      const mid = Math.ceil(4000 / hz);

      let frame = null;
      const loop = () => {
        analyser.getByteTimeDomainData(time);
        analyser.getByteFrequencyData(freq);

        let squares = 0;
        for (const byte of time) squares += ((byte - 128) / 128) ** 2;
        set("audio-level", Math.sqrt(squares / time.length));
        set("audio-bass", mean(freq, 0, bass));
        set("audio-mid", mean(freq, bass, mid));
        set("audio-treble", mean(freq, mid, freq.length));
        for (let i = 0; i < bins; i++) {
          const size = freq.length / bins;
          set(`audio-bin-${i}`, mean(freq, Math.floor(i * size), Math.floor((i + 1) * size)));
        }
        frame = win.requestAnimationFrame(loop);
      };
      signal.addEventListener("abort", () => win.cancelAnimationFrame(frame), { once: true });
      loop();
    },
  };
};

/**
 * Ask for the microphone and return an AnalyserNode wired to it.
 * Prompts the user. Call `stop()` to release the microphone.
 */
export const microphoneAnalyser = async ({ fftSize = 256, window: win = globalThis } = {}) => {
  const stream = await win.navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  const context = new win.AudioContext();
  if (context.state === "suspended") await context.resume();
  const analyser = context.createAnalyser();
  analyser.fftSize = fftSize;
  context.createMediaStreamSource(stream).connect(analyser);
  const stop = () => {
    for (const track of stream.getTracks()) track.stop();
    return context.close();
  };
  return { analyser, stop };
};
