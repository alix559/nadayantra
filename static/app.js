const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)]
let ctx, stream, node, chunks = [], frames = 0, level = 0, on = false, cur = null, busy = false, held = false, kon = false, es = null

// --- microphone: raw samples from a worklet, resampled to 16 kHz when you stop
async function mic() {
  if (ctx) return ctx.resume()
  if (!navigator.mediaDevices?.getUserMedia) throw Error("This browser can't use the microphone here. Open the app at http://localhost:5001.")
  try { stream = await navigator.mediaDevices.getUserMedia({audio: {channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false}}) }
  catch (e) { throw Error(e.name == 'NotAllowedError' ? "Microphone access is off. Allow it in your browser's site settings." : e.message) }
  ctx = new AudioContext()
  const code = `registerProcessor('cap', class extends AudioWorkletProcessor { process(i) { const c = i[0][0]; c && this.port.postMessage(c.slice()); return true } })`
  await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([code], {type: 'text/javascript'})))
  node = new AudioWorkletNode(ctx, 'cap')
  ctx.createMediaStreamSource(stream).connect(node)
  node.connect(ctx.destination)  // it writes no output, but it only runs while connected
  node.port.onmessage = e => {
    if (!on) return
    chunks.push(e.data); frames += e.data.length
    level = Math.min(1, Math.sqrt(e.data.reduce((a, x) => a + x * x, 0) / e.data.length) * 8)
    $$('.meter').forEach(m => m.value = level)
    $$('.secs').forEach(s => s.textContent = `${(frames / ctx.sampleRate).toFixed(1)} / 10 s`)
    if (frames >= ctx.sampleRate * 10) stop()
  }
}

const close = () => { stream?.getTracks().forEach(t => t.stop()); ctx?.close(); ctx = stream = null }

async function to16k(x, rate) {
  if (rate == 16000) return x
  const off = new OfflineAudioContext(1, Math.ceil(x.length * 16000 / rate), 16000), buf = off.createBuffer(1, x.length, rate)
  buf.copyToChannel(x, 0)
  const src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start()
  return (await off.startRendering()).getChannelData(0)
}

function b64(x) {  // 16-bit PCM, base64
  const pcm = Int16Array.from(x, v => Math.max(-1, Math.min(1, v)) * 32767), u8 = new Uint8Array(pcm.buffer)
  let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000))
  return btoa(s)
}

async function start(spec) {
  if (cur || busy) return
  busy = true  // while the microphone starts
  try { await mic() } catch (e) { return say(e.message) } finally { busy = false }
  chunks = []; frames = 0; on = true; cur = spec
  document.body.classList.add('rec'); spec.begin?.()
}

async function stop() {
  const s = cur; if (!s) return
  cur = null; on = false; busy = true
  document.body.classList.remove('rec'); s.end?.()
  try {
    const x = new Float32Array(chunks.reduce((n, c) => n + c.length, 0)); let i = 0
    chunks.forEach(c => { x.set(c, i); i += c.length })
    const audio = b64(await to16k(x, ctx.sampleRate))
    if (!kon) close()
    await s.send(audio)
  } finally { busy = false }
}

const post = (url, values, target = '#lib') => htmx.ajax('POST', url, {target, swap: 'outerHTML', values})
const say = m => { const n = $('#notice') || $('#kst'); n.className = 'err'; n.removeAttribute('aria-busy'); n.textContent = m }

// --- Sound Names
const lib = () => $('#lib')?.dataset || {}
function rec(el, url, hint, vals = {}) {  // record for a button or glyph; the server answers with a fresh #lib
  return start({
    tile: el.classList.contains('tile') ? el : null,
    begin: () => { $('#hint').textContent = hint; el.classList.add('recording') },
    end: () => el.classList.remove('recording'),
    send: audio => post(url, {audio, ...vals, view: lib().view, sel: lib().sel})
      .then(() => { if (url == '/teach') { $('#tk').value = ''; $('#ts').value = '' } })})
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-rec]'), t = e.target.closest('.tile')
  if (b) {
    const {rec: url, hint, ...vals} = b.dataset
    return rec(b, url, hint, url == '/teach' ? {key: $('#tk').value, special: $('#ts').value} : vals)
  }
  if (!t) return
  if (cur?.tile === t) return stop()  // tapping the glyph being recorded stops
  if (cur || busy) return
  $$('.tile.sel').forEach(x => x.classList.remove('sel')); t.classList.add('sel')
  $('#lib').dataset.sel = t.dataset.sym
  htmx.ajax('GET', '/detail', {target: '#det', swap: 'outerHTML', values: {sym: t.dataset.sym}})
  if (t.dataset.taught == '0')  // the first tap on a glyph with no sound starts recording it
    rec(t, '/learn', `Make the sound for ${t.dataset.sym} (${t.dataset.iast}), then press Stop.`, {sym: t.dataset.sym})
})

const skip = () => { sessionStorage.skip = 1; $('#splash')?.remove() }
if (sessionStorage.skip) addEventListener('DOMContentLoaded', () => $('#splash')?.remove())
document.addEventListener('htmx:responseError', e => say(`The server reported an error (${e.detail.xhr.status}).`))

// --- Sound Keyboard: hold the key, make a sound, let go
function press(k) {
  const b = $('#scratch'); if (!b) return
  let [s, e, v] = [b.selectionStart, b.selectionEnd, b.value]
  const ins = t => b.setRangeText(t, s, e, 'end'), at = p => b.setSelectionRange(p, p)
  const ls = v.lastIndexOf('\n', s - 1) + 1, col = s - ls  // where this line starts, and the caret's column
  const le = v.indexOf('\n', s), ne = le < 0 ? 0 : v.indexOf('\n', le + 1)
  const back = s - (/[\udc00-\udfff]/.test(v[s - 1] || '') ? 2 : 1)
  ;({space: () => ins(' '), return: () => ins('\n'), tab: () => ins('\t'),
     backspace: () => s != e ? ins('') : s && b.setRangeText('', back, s, 'end'),
     left: () => at(s != e ? s : Math.max(0, back)), right: () => at(s != e ? e : Math.min(v.length, s + (/[\ud800-\udbff]/.test(v[s] || '') ? 2 : 1))),
     up: () => at(ls == 0 ? 0 : Math.min((ls > 1 ? v.lastIndexOf('\n', ls - 2) + 1 : 0) + col, ls - 1)),
     down: () => at(le < 0 ? v.length : Math.min(le + 1 + col, ne < 0 ? v.length : ne)),
     escape: () => b.blur()}[k] || (() => ins(k)))()
}
document.addEventListener('typed', e => press(e.detail.k))

function idle() {
  const k = $('#kst'); if (!k || cur || busy) return
  k.className = ''
  k.textContent = !kon ? 'Off. Nothing is typed.' : +$('#kmeta').dataset.n == 0 ? 'Teach a sound first (on the Sound Names page), or give one a key.'
    : `Ready. Hold ${$('#pk').selectedOptions[0].text} and make a sound.`
}

async function listen() {
  if (!kon || cur || busy) return
  await start({
    begin: () => { $('#kst').className = ''; $('#kst').innerHTML = '<b class=err>●</b> Listening… <progress class=meter value=0 max=1></progress> <small class=secs>0.0 / 10 s</small>' },
    end: () => { $('#kst').innerHTML = 'Matching…'; $('#kst').setAttribute('aria-busy', 'true') },
    send: audio => post('/typekey', {audio, sys: sysOn()}, '#kst')})
  if (!held && cur) stop()  // the key came back up while the microphone was starting
}
const press_ = () => { if (kon && !held) { held = true; listen() } }
const sysOn = () => !!es  // "Use in other apps": the server types for us and tells us when the key is held
const release = () => { if (held) { held = false; stop() } }

addEventListener('DOMContentLoaded', () => {
  if (!$('#kon')) return
  $('#pk').value = localStorage.pk || 'AltRight'
  $('#pk').onchange = () => { localStorage.pk = $('#pk').value; idle() }
  $('#kon').onchange = async e => {
    kon = e.target.checked; $('#hold').disabled = !kon; held = false
    if (kon) { try { await mic() } catch (err) { say(err.message); kon = $('#kon').checked = $('#hold').disabled = false; return } }
    else { cur && stop(); close(); sysStop() }
    idle()
  }
  addEventListener('keydown', e => !sysOn() && e.code == $('#pk').value && !e.repeat && press_())
  addEventListener('keyup', e => !sysOn() && e.code == $('#pk').value && release())
  addEventListener('blur', () => !sysOn() && release())  // other apps in front are the point when the switch is on
  $('#sys') && ($('#sys').onchange = e => e.target.checked ? sysStart() : sysStop())
  $('#hold').onpointerdown = press_
  ;['pointerup', 'pointerleave', 'pointercancel'].forEach(t => $('#hold').addEventListener(t, release))
})

// --- Use in other apps: the server watches the key and types, because a page can do neither
function sysStop() { es?.close(); es = null; if ($('#sys')) $('#sys').checked = false; held && release() }

async function sysStart() {
  const off = m => { say(m); sysStop() }
  if (!kon) return off('Turn on the sound keyboard first.')
  let s = await (await fetch('/sys/status')).json()
  if (!s.type || !s.listen) {
    s = await (await fetch('/sys/prompt', {method: 'POST'})).json()
    if (!s.type || !s.listen) return off(`macOS needs your permission: allow your terminal app (the one running this server) under Privacy & Security → ${[!s.type && 'Accessibility', !s.listen && 'Input Monitoring'].filter(Boolean).join(' and ')}, restart the server, then turn this on again.`)
  }
  const r = await fetch('/sys/events'); r.body?.cancel()  // starts the key watcher, or fails if Input Monitoring needs a restart
  if (!r.ok) return off('macOS has not applied Input Monitoring yet. Quit the server and the terminal app, start them again, then turn this on.')
  es = new EventSource('/sys/events')
  es.onmessage = m => { const {code, down} = JSON.parse(m.data); code == $('#pk').value && (down ? press_() : release()) }
  idle(); $('#kst').textContent += ' Works in any app.'
}
