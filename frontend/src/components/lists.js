import {html} from "npm:htl";
import {post} from "./api.js";
import {refresh} from "./store.js";
import {hue, keyPick} from "./ui.js";

// Every taught sound and what it types. A sound with no key is dimmed.
export function typing(app) {
  const ss = app.sounds;
  return ss.length
    ? html`<div><h4 class="sec">Sounds and what they type</h4>${ss.map((s, i) => html`<div class="row" style=${hue(i, ss.length) + (s.types ? "" : ";opacity:.55")}>
        <span>${s.glyph}</span><strong>${s.name}</strong><small>${s.cps}</small><small>${s.n} ex.</small>${keyPick(s, app.sp)}</div>`)}</div>`
    : html`<p>No sounds yet. Teach a sound for each glyph on the Sound Names page. Each one types its own glyph.</p>`;
}

// What the keyboard has typed, newest first.
export function log(app) {
  const h = app.hist;
  return html`<div>${h.length
    ? html`<div class="hd"><h4 class="sec" style="margin:0 0 1rem">Typed</h4><button class="outline sm" onclick=${async () => { await post("/api/clear"); refresh(); }}>Clear</button></div>`
    : html`<p>Nothing typed yet. Each sound you make will show up here.</p>`}
    ${h.map((x, i) => html`<div class="row" style=${hue(i, h.length)}><code>${x.label}</code><small>${x.name}</small><small>${x.cps}</small><small>${x.cos.toFixed(2)}</small></div>`)}</div>`;
}
