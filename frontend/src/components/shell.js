// What the page starts with: the splash while the model loads, the navigation, and one line of title.
// The tabs switch views inside this one page (#keys, #names), so nothing reloads or unloads when you switch.
import {html} from "npm:htl";
import {FileAttachment} from "observablehq:stdlib";
import {post} from "./api.js";
import {subscribe, refresh} from "./store.js";

const HERO = {
  keys: ["Speak in notations.", "Hold a key, make a sound, and its glyph is typed."],
  names: ["Teach it a sound.", "Make a sound for each glyph, and it will remember."]
};
const icon = await FileAttachment("../icon.png").url();
const TABS = [["keys", "Sound Keyboard"], ["names", "Sound Names"]];

export function shell(cur, invalidation, onSelect) {
  const nstat = html`<small id="nstat"></small>`;
  const splash = html`<div class="splash" hidden></div>`;
  let last, timer;

  const skip = () => { sessionStorage.gnnSkip = 1; splash.hidden = true; };
  const retry = async () => { await post("/api/retry"); refresh(); };

  function paint({nada}) {
    const s = nada.state;
    // A status pill: a green dot once the model is ready, a pulsing amber one while it loads, a red one if it failed.
    const label = {idle: "", starting: "Loading nada", ready: "Nada ready", failed: "Nada unavailable"}[s] ?? "";
    nstat.className = `stat ${s}`;
    nstat.hidden = !label;
    nstat.title = s === "ready" ? `The sound model is loaded and running on ${nada.device}.` : s === "failed" ? nada.error ?? "" : "Loading the sound model.";
    nstat.replaceChildren(html`<i class="dot"></i>`, label, ...(s === "ready" && nada.device ? [html`<em>${nada.device}</em>`] : []));
    // Poll while the model loads, then stop.
    if (s === "idle" || s === "starting") timer ??= setInterval(refresh, 1000);
    else if (timer) { clearInterval(timer); timer = null; }
    if (s === last) return;
    last = s;
    splash.hidden = s === "ready" || !!sessionStorage.gnnSkip;
    splash.replaceChildren(...(s === "failed"
      ? [html`<img src=${icon} alt="">`, html`<h3>nada couldn’t start</h3>`, html`<small class="err">${nada.error}</small>`,
         html`<div class="row2"><button onclick=${retry}>Try Again</button><button class="secondary" onclick=${skip}>Continue Anyway</button></div>`]
      : [html`<img src=${icon} alt="">`, html`<p class="busy">Preparing nada</p>`, html`<small>Loading the sound model. The first launch can take a minute.</small>`]));
  }

  const off = subscribe(paint);
  invalidation?.then(() => { off(); clearInterval(timer); });
  refresh();

  // The tabs and the heading follow `cur`; onSelect tells the page which view to show.
  const tabs = html`<div></div>`, hero = html`<header class="hero"></header>`;
  function select(k) {
    if (!HERO[k]) k = "keys";
    cur = k;
    tabs.replaceChildren(...TABS.map(([t, label]) => html`<a href=${"#" + t} aria-current=${t === cur ? "page" : null}>${label}</a>`), nstat);
    hero.replaceChildren(html`<h1>${HERO[k][0]}</h1>`, html`<p>${HERO[k][1]}</p>`);
    onSelect?.(k);
  }
  const hash = () => select(location.hash.slice(1) || "keys");
  addEventListener("hashchange", hash);
  invalidation?.then(() => removeEventListener("hashchange", hash));
  select(cur);

  return html`<div>
    ${splash}
    <nav class="top">
      <div><img src=${icon} alt=""><strong>shabdayantra</strong></div>
      ${tabs}
    </nav>
    ${hero}
  </div>`;
}
