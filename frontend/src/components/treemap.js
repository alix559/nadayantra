// The sound treemap: a port of @d3/nested-treemap (observablehq.com/@d3/nested-treemap).
// The hierarchy is keyboard > glyph category (Functions, Monadic operators, ...) > sound, and a sound's
// area is how many examples you taught it. Every parent is padded so its name shows as a header.
import * as d3 from "npm:d3";
import {html} from "npm:htl";
import {G, sections} from "./store.js";

const OTHER = "Custom sounds"; // sounds with no glyph have no category in the glyph table
const width = 928, height = 560;
const color = d3.scaleSequential([4, 0], d3.interpolateMagma); // by height: the keyboard darkest, sounds lightest
const format = d3.format(",d");

export function soundTreemap(invalidation) {
  const svg = d3.create("svg").attr("viewBox", [0, 0, width, height]).attr("role", "img").attr("aria-label", "Sounds grouped by category");
  const view = svg.append("g"); // everything that pans and zooms
  const empty = html`<p class="empty">No sounds yet. Teach a sound on the Sound Names page, and it will appear here under its category.</p>`;

  // Zoom: the buttons, pinch, or hold ⌘ / Ctrl and scroll. A plain scroll still moves the page,
  // and dragging the background pans.
  const zoom = d3.zoom().scaleExtent([1, 8]).translateExtent([[0, 0], [width, height]]).extent([[0, 0], [width, height]])
    .filter((e) => (e.type === "wheel" ? e.ctrlKey || e.metaKey : !e.ctrlKey && !e.button))
    .on("zoom", (e) => view.attr("transform", e.transform));
  svg.call(zoom).on("dblclick.zoom", null);
  const by = (k) => () => svg.transition().duration(250).call(zoom.scaleBy, k);
  const home = () => svg.transition().duration(350).call(zoom.transform, d3.zoomIdentity);
  const controls = html`<div class="tree-zoom">
    <button class="secondary sm" aria-label="Zoom in" title="Zoom in" onclick=${by(1.5)}>+</button>
    <button class="secondary sm" aria-label="Zoom out" title="Zoom out" onclick=${by(1 / 1.5)}>−</button>
    <button class="secondary sm" aria-label="Reset zoom" title="Reset zoom" onclick=${home}>Reset</button>
  </div>`;
  const node = html`<div class="tree">${svg.node()}${controls}${empty}</div>`;

  // keyboard > category > sound, in the glyph table's order, with uncategorised sounds last
  function hierarchy(sounds) {
    const cats = new Map();
    for (const s of sounds) {
      const c = G.get(s.glyph)?.sec ?? OTHER;
      cats.set(c, [...(cats.get(c) ?? []), s]);
    }
    return {
      name: "Sound keyboard",
      children: [...sections.map((s) => s.title), OTHER].filter((c) => cats.has(c)).map((c) => ({
        name: c,
        children: cats.get(c).map((s) => ({
          name: s.name, sid: s.id, glyph: s.glyph, keyed: !!s.types, types: s.label, n: s.n,
          face: s.glyph || (s.label ? [...s.label][0] : "") || [...s.name][0], value: Math.max(s.n, 1)
        }))
      }))
    };
  }

  let sounds = [], hit = new Set(), uid = 0;

  function draw() {
    view.selectAll("*").remove();
    empty.hidden = sounds.length > 0;
    controls.hidden = !sounds.length;
    svg.style("display", sounds.length ? null : "none");
    if (!sounds.length) return;

    const root = d3.treemap().size([width, height]).paddingOuter(3).paddingTop(19).paddingInner(1).round(true)(
      d3.hierarchy(hierarchy(sounds)).sum((d) => d.value).sort((a, b) => b.value - a.value));

    const shadow = `shadow-${++uid}`;
    view.append("filter").attr("id", shadow).append("feDropShadow").attr("flood-opacity", 0.3).attr("dx", 0).attr("stdDeviation", 3);

    const g = view.selectAll("g.level").data(d3.group(root, (d) => d.height)).join("g").attr("class", "level").attr("filter", `url(#${shadow})`)
      .selectAll("g").data((d) => d[1]).join("g")
      .attr("class", (d) => `cell${d.children ? "" : " leaf"}${d.data.keyed === false ? " dim" : ""}${hit.has(d.data.sid) || (d.children && d.depth === 1 && [...hit].some((id) => d.children.some((c) => c.data.sid === id))) ? " hit" : ""}`)
      .attr("transform", (d) => `translate(${d.x0},${d.y0})`);

    g.append("title").text((d) => `${d.ancestors().reverse().map((a) => a.data.name).join("/")}\n` + (d.children
      ? `${format(d.leaves().length)} sound${d.leaves().length == 1 ? "" : "s"}`
      : `${G.get(d.data.glyph)?.mean ? G.get(d.data.glyph).mean + "\n" : ""}${d.data.keyed ? `Types ${d.data.types}` : "Types nothing yet"}\n${format(d.data.n)} example${d.data.n == 1 ? "" : "s"}`));

    g.append("rect")
      .attr("id", (d) => (d.nodeId = `node-${++uid}`))
      .attr("fill", (d) => color(d.height))
      .attr("width", (d) => d.x1 - d.x0)
      .attr("height", (d) => d.y1 - d.y0);

    g.append("clipPath").attr("id", (d) => (d.clipId = `clip-${++uid}`)).append("use").attr("href", (d) => `#${d.nodeId}`);

    // a parent's header: its name, and how many sounds it holds
    g.filter((d) => d.children).append("text").attr("clip-path", (d) => `url(#${d.clipId})`)
      .selectAll("tspan").data((d) => [d.data.name, format(d.leaves().length)]).join("tspan")
      .attr("dx", 3).attr("y", 13).attr("fill-opacity", (_, i) => (i ? 0.7 : null)).text((t) => t);

    // a sound: its glyph, its name, and its examples
    const leaf = g.filter((d) => !d.children).append("text").attr("clip-path", (d) => `url(#${d.clipId})`);
    leaf.append("tspan").attr("class", "face").attr("x", 3).attr("y", 17).text((d) => d.data.face);
    leaf.append("tspan").attr("x", 3).attr("y", 31).text((d) => d.data.name);
    leaf.append("tspan").attr("x", 3).attr("y", 42).attr("fill-opacity", 0.7).text((d) => `${d.data.n} ex.`);
  }

  // Redraw from what the server knows.
  function update(app) { sounds = app.sounds; draw(); }

  // The keyboard says which sound it just typed; outline that sound and its category for a moment.
  let flash;
  function typed({detail}) {
    hit = new Set([detail.id]); draw();
    clearTimeout(flash);
    flash = setTimeout(() => { hit = new Set(); draw(); }, 1400);
  }
  addEventListener("sound-typed", typed);
  invalidation?.then(() => { svg.interrupt(); removeEventListener("sound-typed", typed); clearTimeout(flash); });

  return {node, update};
}
