// The microphone: raw samples from an audio worklet, resampled to 16 kHz when you stop.
// start({begin, progress, end, send, fail}) records until stop(); send gets the audio as base64 16-bit PCM.
import {say} from "./store.js";

const MAX_SECONDS = 10;
let ctx, stream, node, chunks = [], frames = 0, on = false, cur = null, busy = false, keep = false;

export const current = () => cur;
export const isBusy = () => busy || !!cur;

// Keep the microphone open between recordings (the sound keyboard does); otherwise it closes after each one.
export function keepOpen(v) {
  keep = v;
  if (!v && !cur && !busy) close();
}

export async function open() {
  if (ctx) return ctx.resume();
  if (!navigator.mediaDevices?.getUserMedia) throw Error("This browser can't use the microphone here. Open the app at http://localhost:5001/app/.");
  try {
    stream = await navigator.mediaDevices.getUserMedia({audio: {channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false}});
  } catch (e) {
    throw Error(e.name == "NotAllowedError" ? "Microphone access is off. Allow it in your browser's site settings." : e.message);
  }
  ctx = new AudioContext();
  const code = `registerProcessor('cap', class extends AudioWorkletProcessor { process(i) { const c = i[0][0]; c && this.port.postMessage(c.slice()); return true } })`;
  await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([code], {type: "text/javascript"})));
  node = new AudioWorkletNode(ctx, "cap");
  ctx.createMediaStreamSource(stream).connect(node);
  node.connect(ctx.destination); // it writes no output, but it only runs while connected
  node.port.onmessage = (e) => {
    if (!on) return;
    chunks.push(e.data);
    frames += e.data.length;
    const level = Math.min(1, Math.sqrt(e.data.reduce((a, x) => a + x * x, 0) / e.data.length) * 8);
    cur?.progress?.(level, frames / ctx.sampleRate);
    if (frames >= ctx.sampleRate * MAX_SECONDS) stop();
  };
}

export function close() {
  stream?.getTracks().forEach((t) => t.stop());
  ctx?.close();
  ctx = stream = null;
}

async function to16k(x, rate) {
  if (rate == 16000) return x;
  const off = new OfflineAudioContext(1, Math.ceil((x.length * 16000) / rate), 16000), buf = off.createBuffer(1, x.length, rate);
  buf.copyToChannel(x, 0);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.connect(off.destination);
  src.start();
  return (await off.startRendering()).getChannelData(0);
}

function b64(x) {
  const pcm = Int16Array.from(x, (v) => Math.max(-1, Math.min(1, v)) * 32767), u8 = new Uint8Array(pcm.buffer);
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function start(spec) {
  if (cur || busy) return;
  busy = true; // while the microphone starts
  try {
    await open();
  } catch (e) {
    return (spec.fail ?? ((m) => say(m, "err")))(e.message);
  } finally {
    busy = false;
  }
  chunks = []; frames = 0; on = true; cur = spec;
  document.body.classList.add("rec");
  spec.begin?.();
}

export async function stop() {
  const s = cur;
  if (!s) return;
  cur = null; on = false; busy = true;
  document.body.classList.remove("rec");
  s.end?.();
  try {
    const x = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
    let i = 0;
    chunks.forEach((c) => { x.set(c, i); i += c.length; });
    const audio = b64(await to16k(x, ctx.sampleRate));
    if (!keep) close();
    await s.send(audio);
  } catch (e) {
    (s.fail ?? ((m) => say(m, "err")))(e.message);
  } finally {
    busy = false;
  }
}
