import {html} from "npm:htl";
import {post} from "./api.js";
import {refresh} from "./store.js";

// Yellow at the first item of a list, red at the last: the position along a section sets a row's or tile's hue.
export const hue = (i, n) => `--t:${(i / Math.max(n - 1, 1)).toFixed(3)}`;

// What a sound types: any characters you enter, or a named special key. Blank means "type the glyph".
export function keyPick(s, sp) {
  const send = (f, v) => post("/api/setkey", {id: s.id, f, v}).then(refresh);
  return html`<span class="kp">
    <input value=${s.key in sp ? "" : s.key} placeholder=${s.gk || "Key"} maxlength="8" onchange=${(e) => send("t", e.target.value)}>
    <select onchange=${(e) => send("s", e.target.value)}>
      <option value="-">${s.gk ? `Glyph (${s.gk})` : "No key"}</option>
      ${Object.entries(sp).map(([n, l]) => html`<option value=${n} selected=${s.key === n}>${l}</option>`)}
    </select>
  </span>`;
}

export function notice(app) {
  const n = app.notice;
  return html`<div class="msg ${n?.kind ?? ""}">${n?.msg ?? ""}</div>`;
}
