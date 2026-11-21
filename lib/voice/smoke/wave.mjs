// The sound wave (lib/voice/wave.js) in all four voice games, headless Chromium
// with a fake mic that plays a short tone once and then goes silent: the wave
// canvas has ink while the tone plays and is clear ~1.5 s after it stops, and it
// sits left of the ear on every layout. Then ?meter=0: recognition results
// alone pulse it. Serves the source tree (no build needed):
//   PLAYWRIGHT_CORE=/path/to/playwright-core/index.mjs node lib/voice/smoke/wave.mjs [<screenshot dir>]
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const { chromium } = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const step = (msg) => console.log(`✓ ${msg}`);

const root = new URL('../../../', import.meta.url).pathname;
const shots = process.argv[2];
if (shots) fs.mkdirSync(shots, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  if (!f.startsWith(root) || !fs.existsSync(f)) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }).end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}/games/`;

// The fake mic: TONE s of a wobbling 220 Hz tone, then silence. Padded with real
// silence: at its end a %noloop file keeps repeating its last buffer.
const TONE = 2.5;
const wav = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wave-')), 'tone.wav');
{
  const rate = 16000;
  const n = Math.round(rate * (TONE + 30));
  const tone = Math.round(rate * TONE);
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < tone; i++) {
    const t = i / rate;
    b.writeInt16LE(Math.round(9000 * (0.6 + 0.4 * Math.sin(2 * Math.PI * 3 * t)) * Math.sin(2 * Math.PI * 220 * t)), 44 + i * 2);
  }
  fs.writeFileSync(wav, b);
}

function fakeSR() {
  class FakeSR {
    start() {
      window.__sr = this;
      setTimeout(() => (this.onstart?.(), this.onaudiostart?.()), 30);
    }
    say(text) {
      this.onresult?.({ results: [Object.assign([{ transcript: text, confidence: 0.9 }], { isFinal: false })], resultIndex: 0 });
    }
    stop() {}
    abort() {}
  }
  window.SpeechRecognition = FakeSR;
  window.webkitSpeechRecognition = FakeSR;
}

const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}%noloop`, '--autoplay-policy=no-user-gesture-required'],
});
const errors = [];

// Painted pixels on the wave canvas.
const ink = (p) =>
  p.evaluate(() => {
    const cv = document.querySelector('canvas.voice-wave');
    if (!cv?.width || !cv.height) return 0;
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) n += d[i] > 8;
    return n;
  });

async function open(game, viewport, query = '') {
  const ctx = await browser.newContext({ viewport, hasTouch: true, deviceScaleFactor: 2, permissions: ['microphone'] });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${game}: ${e}`));
  p.on('console', (m) => m.type() === 'error' && errors.push(`${game}: ${m.text()}`));
  await p.addInitScript(fakeSR);
  await p.goto(`${BASE}${game}/${query}`);
  await p.click((await p.$('#start .level')) ? '#start .level' : '#start', { force: true }); // monstro starts on a level (it wiggles)
  await p.waitForFunction(() => document.body.classList.contains('ear-on'));
  return p;
}

const LAYOUTS = { iphone: { width: 390, height: 844 }, 'iphone-land': { width: 844, height: 390 }, ipad: { width: 1180, height: 820 } };
for (const game of ['cachorro', 'foguete', 'casa', 'monstro']) {
  for (const [name, viewport] of Object.entries(LAYOUTS)) {
    const p = await open(game, viewport);
    const until = Date.now() + 5000;
    while ((await ink(p)) === 0) assert.ok(Date.now() < until, `${game} ${name}: the wave shows up while the mic plays`);
    const t0 = Date.now(); // the fake mic started playing before this
    let peak = 0;
    while (Date.now() - t0 < 1500) peak = Math.max(peak, await ink(p));
    assert.ok(peak > 200, `${game} ${name}: the wave has ink while the mic plays (${peak} px)`);
    await (shots && p.screenshot({ path: path.join(shots, `${game}-${name}.png`) }));
    // The canvas ends left of the ear, on the ear's line, inside the screen.
    const geo = await p.evaluate(() => {
      const c = document.querySelector('canvas.voice-wave').getBoundingClientRect();
      const e = document.getElementById('ear').getBoundingClientRect();
      return { right: c.right, top: c.top, bottom: c.bottom, earLeft: e.left, earMid: (e.top + e.bottom) / 2, pe: getComputedStyle(document.querySelector('canvas.voice-wave')).pointerEvents };
    });
    assert.ok(geo.right <= geo.earLeft && geo.earLeft - geo.right < 12, `${game} ${name}: wave leaves the ear's left edge`);
    assert.ok(geo.top < geo.earMid && geo.bottom > geo.earMid && geo.top >= 0, `${game} ${name}: wave on the ear's line`);
    assert.equal(geo.pe, 'none');
    // Silent TONE s after the mic opened: clear about 1.5 s later.
    const quiet = t0 + TONE * 1000;
    while ((await ink(p)) > 0) assert.ok(Date.now() - quiet < 1800, `${game} ${name}: the wave is gone ~1.5 s after silence`);
    step(`${game} ${name}: ink while the mic plays (${peak} px), clear ${((Date.now() - quiet) / 1000).toFixed(1)} s after silence`);
    await p.context().close();
  }
}

// ?meter=0: no level, partial results pulse it, then it goes.
const p = await open('cachorro', LAYOUTS.ipad, '?meter=0');
assert.equal(await ink(p), 0, 'nothing before speech');
for (let i = 0; i < 6; i++) {
  await p.evaluate((t) => window.__sr.say(t), 'cachorro co'.slice(0, 6 + i));
  await p.waitForTimeout(100);
}
assert.ok((await ink(p)) > 200, '?meter=0: results pulse the wave');
await (shots && p.screenshot({ path: path.join(shots, 'cachorro-ipad-meter0.png') }));
await p.waitForTimeout(2000);
assert.equal(await ink(p), 0, '?meter=0: gone after the results stop');
step('?meter=0: partial results pulse the wave, gone after they stop');
await p.context().close();

assert.deepEqual(errors, []);
await browser.close();
server.close();
console.log('wave smoke ok');
