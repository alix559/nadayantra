// The Sound Keyboard: hold the key, make a sound, let go; the matching sound types its key.
// In the page the keys land in the box below. "Use in other apps" has the server type for us instead,
// and watch the key everywhere, because a web page can do neither.
import {html} from "npm:htl";
import {get, post, base} from "./api.js";
import {start, stop, isBusy, current, open, close, keepOpen} from "./mic.js";
import {refresh} from "./store.js";

// Type one key into a text box: a character, or a named special key.
function press(b, k) {
  let [s, e, v] = [b.selectionStart, b.selectionEnd, b.value];
  const ins = (t) => b.setRangeText(t, s, e, "end"), at = (p) => b.setSelectionRange(p, p);
  const ls = v.lastIndexOf("\n", s - 1) + 1, col = s - ls; // where this line starts, and the caret's column
  const le = v.indexOf("\n", s), ne = le < 0 ? 0 : v.indexOf("\n", le + 1);
  const back = s - (/[\udc00-\udfff]/.test(v[s - 1] || "") ? 2 : 1);
  ({
    space: () => ins(" "), return: () => ins("\n"), tab: () => ins("\t"),
    backspace: () => (s != e ? ins("") : s && b.setRangeText("", back, s, "end")),
    left: () => at(s != e ? s : Math.max(0, back)),
    right: () => at(s != e ? e : Math.min(v.length, s + (/[\ud800-\udbff]/.test(v[s] || "") ? 2 : 1))),
    up: () => at(ls == 0 ? 0 : Math.min((ls > 1 ? v.lastIndexOf("\n", ls - 2) + 1 : 0) + col, ls - 1)),
    down: () => at(le < 0 ? v.length : Math.min(le + 1 + col, ne < 0 ? v.length : ne)),
    escape: () => b.blur()
  }[k] || (() => ins(k)))();
}

export async function keyboard(invalidation) {
  const status = await get("/sys/status").catch(() => ({available: false}));
  let kon = false, held = false, es = null, keyed = 0;

  const switchOn = html`<input type="checkbox" class="switch" role="switch" aria-label="Sound keyboard">`;
  const pk = html`<select aria-label="Hold to talk">
    <option value="AltRight">Right Option ⌥</option><option value="MetaRight">Right Command ⌘</option><option value="ControlRight">Right Control ⌃</option></select>`;
  const sys = html`<input type="checkbox" class="switch" role="switch" aria-label="Use in other apps">`;
  const kst = html`<div class="msg"></div>`;
  const hold = html`<button class="secondary" disabled>Hold to Talk</button>`;
  const scratch = html`<textarea id="scratch" rows="3" placeholder="Click here, then try it: characters appear in this box"></textarea>`;
  pk.value = localStorage.pk || "AltRight";

  const say = (m, k = "") => { kst.className = `msg ${k}`; kst.textContent = m; };

  function idle() {
    if (isBusy()) return;
    say(!kon ? "Off. Nothing is typed."
      : keyed == 0 ? "Teach a sound first (on the Sound Names page), or give one a key."
      : `Ready. Hold ${pk.selectedOptions[0].text} and make a sound.${es ? " Works in any app." : ""}`);
  }

  function listen() {
    if (!kon || isBusy()) return;
    const meter = html`<progress class="meter" value="0" max="1"></progress>`, secs = html`<small>0.0 / 10 s</small>`;
    return start({
      fail: (m) => say(m, "err"),
      progress: (level, t) => { meter.value = level; secs.textContent = `${t.toFixed(1)} / 10 s`; },
      begin: () => { kst.className = "msg"; kst.replaceChildren(html`<b class="err">●</b>`, " Listening… ", meter, " ", secs); },
      end: () => { kst.className = "msg busy"; kst.textContent = "Matching…"; },
      send: async (audio) => {
        const r = await post("/api/typekey", {audio, sys: !!es});
        say(r.msg, r.kind);
        if (r.id != null) dispatchEvent(new CustomEvent("sound-typed", {detail: {id: r.id}})); // the sound tree lights it up
        if (r.page) press(scratch, r.key); // the server types for itself when "Use in other apps" is on
        refresh();
      }
    }).then(() => { if (!held && current()) stop(); }); // the key came back up while the microphone was starting
  }
  const pressed = () => { if (kon && !held) { held = true; listen(); } };
  const released = () => { if (held) { held = false; stop(); } };

  // --- Use in other apps
  function sysStop() {
    es?.close(); es = null; sys.checked = false;
    if (held) released();
  }
  async function sysStart() {
    const off = (m) => { say(m, "err"); sysStop(); };
    if (!kon) return off("Turn on the sound keyboard first.");
    let s = await get("/sys/status");
    if (!s.type || !s.listen) {
      s = await post("/sys/prompt");
      if (!s.type || !s.listen) return off(`macOS needs your permission: allow your terminal app (the one running this server) under Privacy & Security → ${[!s.type && "Accessibility", !s.listen && "Input Monitoring"].filter(Boolean).join(" and ")}, restart the server, then turn this on again.`);
    }
    const r = await fetch(base + "/sys/events"); // starts the key watcher, or fails if Input Monitoring needs a restart
    r.body?.cancel();
    if (!r.ok) return off("macOS has not applied Input Monitoring yet. Quit the server and the terminal app, start them again, then turn this on.");
    es = new EventSource(base + "/sys/events");
    es.onmessage = (m) => { const {code, down} = JSON.parse(m.data); if (code == pk.value) down ? pressed() : released(); };
    idle();
  }

  switchOn.onchange = async () => {
    kon = switchOn.checked; hold.disabled = !kon; held = false;
    keepOpen(kon);
    if (kon) {
      try { await open(); }
      catch (err) { say(err.message, "err"); kon = switchOn.checked = hold.disabled = false; keepOpen(false); return; }
    } else { current() && stop(); close(); sysStop(); }
    idle();
  };
  sys.onchange = () => (sys.checked ? sysStart() : (sysStop(), idle()));
  pk.onchange = () => { localStorage.pk = pk.value; idle(); };

  // A page only sees keys while it is in front; "Use in other apps" takes over from these.
  const down = (e) => { if (!es && e.code == pk.value && !e.repeat) pressed(); };
  const up = (e) => { if (!es && e.code == pk.value) released(); };
  const blur = () => { if (!es) released(); };
  addEventListener("keydown", down); addEventListener("keyup", up); addEventListener("blur", blur);
  hold.onpointerdown = pressed;
  ["pointerup", "pointerleave", "pointercancel"].forEach((t) => hold.addEventListener(t, released));
  invalidation?.then(() => {
    removeEventListener("keydown", down); removeEventListener("keyup", up); removeEventListener("blur", blur);
    sysStop(); current() && stop(); keepOpen(false);
  });

  const row = (title, sub, control) => html`<div class="ctl"><div class="lbl"><strong>${title}</strong><small>${sub}</small></div>${control}</div>`;
  const view = html`<div>
    <div class="panel">
      <label class="ctl"><div class="lbl"><strong>Sound keyboard</strong><small>Turn it on, then hold the key and make a sound.</small></div>${switchOn}</label>
      ${row("Hold to talk", "The key you hold while making a sound.", pk)}
      ${status.available ? html`<label class="ctl"><div class="lbl"><strong>Use in other apps</strong><small>Types into the app in front and watches the key everywhere. macOS asks you to allow it.</small></div>${sys}</label>` : ""}
    </div>
    ${kst}
    <div class="hold">${hold}<small>The same as holding the key, for trying it here.</small></div>
    ${scratch}
    <div class="under"><button class="outline sm" onclick=${() => (scratch.value = "")}>Clear</button></div>
  </div>`;
  idle();

  // How many sounds can type something; the page tells us whenever the sounds change.
  return {view, setKeyed(n) { keyed = n; idle(); }};
}
