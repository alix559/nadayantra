---
title: shabdayantra
---

```js
import {shell} from "./components/shell.js";
import {keyboard} from "./components/keyboard.js";
import {soundTreemap} from "./components/treemap.js";
import {log} from "./components/lists.js";
import {controls, recog, library} from "./components/names.js";
import {get} from "./components/api.js";
import {notice} from "./components/ui.js";
import {subscribe} from "./components/store.js";

// What the server knows (sounds, history); this redraws whatever uses it when it changes.
const app = Generators.observe((notify) => subscribe(notify));
const mode = Mutable("g"); // Sound Names: glyph tiles, or a list of every taught sound
const setMode = (v) => (mode.value = v);
```

```js
// One page, two views. The tabs only hide one and show the other, so the microphone, the sound
// keyboard and everything on screen stay as they are when you switch, and nothing reloads.
const views = {keys: html`<div></div>`, names: html`<div></div>`};
const show = (k) => { for (const [n, v] of Object.entries(views)) v.hidden = n !== k; };
display(shell("keys", invalidation, show));
display(views.keys);
display(views.names);
```

```js
// --- Sound Keyboard. The hierarchy is the glyph categories: keyboard > category > sound.
const kb = await keyboard(invalidation);
const tree = soundTreemap(invalidation);
const typedBox = html`<div style="margin-top:2.4rem"></div>`;
views.keys.replaceChildren(
  kb.view,
  html`<div><h4 class="sec">Sounds by category<small>Sized by examples taught. Drag to pan, pinch or ⌘-scroll to zoom.</small></h4>${tree.node}</div>`,
  typedBox);
```

```js
tree.update(app);
kb.setKeyed(app.sounds.filter((s) => s.types).length);
typedBox.replaceChildren(log(app));
```

```js
// --- Sound Names
const notes = html`<div></div>`, lib = html`<div></div>`;
views.names.replaceChildren(controls((await get("/api/state")).sp), notes, lib);
```

```js
notes.replaceChildren(notice(app), recog(app));
lib.replaceChildren(library(app, mode, setMode));
```
