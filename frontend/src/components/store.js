// What the server knows, kept in one place. Pages subscribe, and re-render when it changes:
//   const app = Generators.observe(notify => subscribe(notify));
import {get} from "./api.js";

export const state = {
  nada: {state: "idle", device: null, error: null},
  sounds: [], sp: {}, mincos: 0.6, hit: null, rec: [], hist: [],
  notice: null  // {msg, kind} shown under the controls
};

// The glyph table: four sections of [symbol, meaning, devanagari, iast].
export const sections = await get("/api/glyphs").catch(() => []);
export const G = new Map(sections.flatMap((s) => s.glyphs.map((g) => [g.sym, {...g, sec: s.title}])));

const subs = new Set();
const emit = () => { const s = {...state}; subs.forEach((f) => f(s)); };

export function subscribe(f) {
  subs.add(f);
  f({...state});
  return () => subs.delete(f);
}

export async function refresh() {
  try {
    Object.assign(state, await get("/api/state"));
  } catch (e) {
    state.nada = {state: "failed", device: null, error: "The server isn't reachable. Start it with: pixi run serve"};
  }
  emit();
}

export function say(msg, kind = "") {
  state.notice = msg ? {msg, kind} : null;
  emit();
}
