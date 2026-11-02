// Sound Names: teach a sound per glyph, make it again to get the name back.
import {html} from "npm:htl";
import {post} from "./api.js";
import {start, stop, isBusy, current} from "./mic.js";
import {sections, G, refresh, say} from "./store.js";
import {hue, keyPick} from "./ui.js";

// --- the controls that drive a recording
const tk = html`<input maxlength="8" placeholder="Key" aria-label="Key to type">`;
let ts;
const hint = html`<small></small>`, meter = html`<progress class="meter" value="0" max="1"></progress>`, secs = html`<small class="secs">0.0 / 10 s</small>`;

// Record, then send the sound to /api<url>. `tile` is the glyph being recorded, if there is one.
function rec(tile, url, text, vals = {}) {
  return start({
    tile,
    progress: (level, t) => { meter.value = level; secs.textContent = `${t.toFixed(1)} / 10 s`; },
    begin: () => { hint.textContent = text; tile?.classList.add("recording"); },
    end: () => tile?.classList.remove("recording"),
    send: async (audio) => {
      const r = await post("/api" + url, {audio, ...vals});
      say(r.msg, r.ok ? "ok" : "err");
      if (url == "/teach") { tk.value = ""; ts.value = ""; }
      await refresh();
    }
  });
}

export function controls(sp) {
  ts = html`<select aria-label="Special key"><option value="">Text</option>${Object.entries(sp).map(([n, l]) => html`<option value=${n}>${l}</option>`)}</select>`;
  return html`<div class="bar">
    <div class="idle">
      <button class="lg" data-rec onclick=${() => rec(null, "/teach", "Make the sound, then press Stop.", {key: tk.value, special: ts.value})}>Teach a New Sound</button>
      <small>types</small>${tk}${ts}
      <button class="secondary lg" data-rec onclick=${() => rec(null, "/recognize", "Make a sound, then press Stop.")}>Recognize</button>
    </div>
    <div class="live"><button class="contrast" onclick=${stop}>Stop</button>${meter}${secs}${hint}</div>
  </div>`;
}

export function recog(app) {
  const r = app.rec;
  if (!r.length) return html`<div class="recog"></div>`;
  const b = r[0];
  return html`<div class="recog">${b.cos >= app.mincos
    ? html`<h2>${b.glyph} ${b.name} <small>${Math.round(b.share * 100)}%</small></h2>`
    : html`<h3 class="warn">Not sure</h3><p>That doesn’t sound much like anything taught. The closest is “${b.name}”.</p>`}
    ${r.slice(0, 5).map((m) => html`<div class="mrow"><span>${m.glyph} ${m.name}</span><progress value=${m.share} max="1"></progress><small>cosine ${m.cos.toFixed(3)}</small></div>`)}
  </div>`;
}

// --- the library: every glyph as a tile, or every taught sound as a row
let sel = ""; // the chosen glyph. Kept here so choosing one only redraws the bar below, never the tiles being recorded.

export function library(app, mode, setMode) {
  const det = html`<div class="det"></div>`;

  function detail() {
    const g = G.get(sel);
    if (!g) return det.replaceChildren();
    const s = app.sounds.find((x) => x.glyph === sel);
    det.replaceChildren(
      html`<div class="glyph">${g.sym}</div>`,
      html`<div><strong>${g.iast}  ${g.dev}</strong><br>${g.mean}<br><small>${g.sec}</small></div>`,
      html`<div class="acts">${s
        ? [html`<small>${s.n} example${s.n != 1 ? "s" : ""}</small>`,
           html`<small>types ${s.label}<br><code>${s.cps}</code></small>`,
           keyPick(s, app.sp),
           html`<button data-rec onclick=${() => rec(null, "/more", "Make the same sound again, then press Stop.", {id: s.id})}>Add Example</button>`,
           html`<button class="outline" onclick=${async () => { await post("/api/forget", {id: s.id}); await refresh(); }}>Forget</button>`]
        : html`<button data-rec onclick=${() => rec(null, "/learn", `Make the sound for ${g.sym} (${g.iast}), then press Stop.`, {sym: g.sym})}>Teach Sound</button>`}</div>`);
  }

  function tile(g, i, n, s) {
    const cls = s ? (s.id === app.hit ? "match" : "taught") : "";
    const el = html`<div class="tile ${cls} ${g.sym === sel ? "sel" : ""}" style=${hue(i, n)} role="button" tabindex="0"
        title=${`${g.sym}  ${g.mean}  ${g.dev}  ${g.iast}`}><small>${g.mean}</small><b>${g.sym}</b><i>${g.iast}</i></div>`;
    el.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.click(); } };
    el.onclick = () => {
      if (current()?.tile === el) return stop(); // tapping the glyph being recorded stops
      if (isBusy()) return;
      document.querySelectorAll(".tile.sel").forEach((x) => x.classList.remove("sel"));
      el.classList.add("sel");
      sel = g.sym;
      detail();
      if (!s) { // the first tap on a glyph with no sound starts recording it
        rec(el, "/learn", `Make the sound for ${g.sym} (${g.iast}), then press Stop.`, {sym: g.sym});
      }
    };
    return el;
  }

  const tabs = html`<div class="tabs" role="group">${[["g", "Glyphs"], ["l", "All sounds"]].map(([v, t]) =>
    html`<button class=${mode === v ? "" : "outline"} onclick=${() => setMode(v)}>${t}</button>`)}</div>`;

  let body;
  if (mode === "g") {
    const by = new Map(app.sounds.filter((s) => s.glyph).map((s) => [s.glyph, s]));
    body = [...sections.map(({title, glyphs}) => html`<div>
      <h4 class="sec">${title}<small>${glyphs.filter((g) => by.has(g.sym)).length} of ${glyphs.length} taught</small></h4>
      <div class="tiles">${glyphs.map((g, i) => tile(g, i, glyphs.length, by.get(g.sym)))}</div></div>`), det];
    detail();
  } else {
    const ss = app.sounds;
    body = ss.length
      ? [html`<h4 class="sec">Taught sounds (${ss.length})<button class="outline sm" onclick=${async () => { if (confirm("Forget every sound?")) { await post("/api/forgetall"); await refresh(); } }}>Remove All</button></h4>`,
         ...ss.map((s, i) => html`<div class="row" style=${hue(i, ss.length)}>
            <span>${s.id === app.hit ? "✓" : "~"}</span><span>${s.glyph}</span>
            <input value=${s.name} aria-label="Name" onchange=${(e) => post("/api/rename", {id: s.id, v: e.target.value})}>
            <small>${s.n} ex.</small>${keyPick(s, app.sp)}
            <button data-rec title="Record another example" onclick=${() => rec(null, "/more", "Make the same sound again, then press Stop.", {id: s.id})}>+</button>
            <button class="outline" title="Forget this sound" onclick=${async () => { await post("/api/forget", {id: s.id}); await refresh(); }}>×</button></div>`)]
      : [html`<p class="empty">No sounds yet. Press Teach a New Sound and make a sound.</p>`];
  }
  return html`<div>${tabs}${body}</div>`;
}
