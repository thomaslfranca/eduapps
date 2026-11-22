// The engine badge (lib/voice/badge.js) on the start screen of all four voice
// games: it names the engine, sits clear of the back button and the start
// screen's content on every layout, and its link switches the engine (keeping
// ?debug) without starting the game. Serves the source tree, where vosk-browser
// can't be imported: ?engine=vosk fails at once, which shows the fallback line.
//   PLAYWRIGHT_CORE=/path/to/playwright-core/index.mjs node lib/voice/smoke/badge.mjs [<screenshot dir>]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { badgeText, switchHref } from '../badge.js';

const { chromium } = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const step = (msg) => console.log(`✓ ${msg}`);

assert.equal(switchHref('?debug', '', 'vosk'), '?debug=&engine=vosk');
assert.equal(switchHref('?engine=vosk&meter=0', '#x', 'web'), '?engine=web&meter=0#x');
assert.equal(switchHref('', '', 'web'), '?engine=web');
assert.deepEqual(badgeText('web', false), { label: 'Voz: navegador', link: 'trocar para Vosk (offline)', to: 'vosk' });
assert.deepEqual(badgeText('vosk', false), { label: 'Voz: Vosk (offline)', link: 'trocar para navegador', to: 'web' });
assert.equal(badgeText('web', true).to, 'web');
step('switchHref keeps the other params; badgeText for web, vosk, vosk failed');

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

function fakeSR() {
  window.__starts = 0;
  class FakeSR {
    start() {
      window.__starts++;
      setTimeout(() => (this.onstart?.(), this.onaudiostart?.()), 30);
    }
    stop() {}
    abort() {}
  }
  window.SpeechRecognition = FakeSR;
  window.webkitSpeechRecognition = FakeSR;
}

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
const badge = (p) => p.evaluate(() => {
  const b = document.querySelector('.voice-badge');
  return { text: b?.textContent, engine: b?.dataset.engine, visible: !!b && b.checkVisibility() };
});
const onStart = (p) => p.evaluate(() => ({ phase: document.body.dataset.phase, start: !document.getElementById('start').hidden, starts: window.__starts, ear: document.body.classList.contains('ear-on') }));

// The badge inside the screen, overlapping neither the back button nor anything on the start screen.
async function clear(p, where) {
  const g = await p.evaluate(() => {
    const r = (el) => el.getBoundingClientRect().toJSON();
    return {
      badge: r(document.querySelector('.voice-badge')),
      others: [document.querySelector('.back'), ...document.getElementById('start').children].map((el) => ({ name: el.className, ...r(el) })),
      vw: innerWidth,
      vh: innerHeight,
    };
  });
  const b = g.badge;
  assert.ok(b.left >= 0 && b.top >= 0 && b.right <= g.vw && b.bottom <= g.vh, `${where}: badge inside the screen`);
  for (const o of g.others) {
    const hit = b.left < o.right && b.right > o.left && b.top < o.bottom && b.bottom > o.top;
    assert.ok(!hit, `${where}: badge overlaps .${o.name} ${JSON.stringify(b)} ${JSON.stringify(o)}`);
  }
}

const LAYOUTS = { iphone: { width: 390, height: 844 }, 'iphone-land': { width: 844, height: 390 }, ipad: { width: 1180, height: 820 } };
for (const game of ['cachorro', 'foguete', 'casa', 'monstro']) {
  for (const [name, viewport] of Object.entries(LAYOUTS)) {
    const ctx = await browser.newContext({ viewport, hasTouch: true, deviceScaleFactor: 2, permissions: ['microphone'] });
    await ctx.addInitScript(fakeSR);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(`${game}: ${e}`));
    p.on('console', (m) => m.type() === 'error' && errors.push(`${game}: ${m.text()}`));
    const where = `${game} ${name}`;

    // default: the browser's engine
    await p.goto(`${BASE}${game}/?debug`);
    assert.deepEqual(await badge(p), { text: 'Voz: navegador · trocar para Vosk (offline)', engine: 'web', visible: true }, where);
    await clear(p, where);
    await (shots && p.screenshot({ path: path.join(shots, `${game}-${name}-web.png`) }));

    // the link: reload on ?engine=vosk, ?debug kept, still on the start screen
    await Promise.all([p.waitForURL(/engine=vosk/), p.tap('.voice-badge a')]);
    assert.match(p.url(), /[?&]debug/, `${where}: ?debug kept`);
    await p.waitForFunction(() => document.querySelector('.voice-badge')?.dataset.engine === 'vosk-failed');
    assert.deepEqual(await onStart(p), { phase: 'start', start: true, starts: 0, ear: false }, `${where}: the link did not start the game`);
    assert.equal((await badge(p)).text, 'Voz: Vosk falhou, usando navegador · ficar no navegador');
    await p.waitForFunction(() => /engine vosk/.test(document.querySelector('.dbg-log')?.textContent));
    await clear(p, `${where} (vosk failed)`);
    await (shots && p.screenshot({ path: path.join(shots, `${game}-${name}-vosk-failed.png`) }));

    // and back: the choice sticks without ?engine
    await Promise.all([p.waitForURL(/engine=web/), p.tap('.voice-badge a')]);
    await p.goto(`${BASE}${game}/`);
    assert.equal((await badge(p)).engine, 'web', `${where}: web stuck`);
    assert.deepEqual(await onStart(p), { phase: 'start', start: true, starts: 0, ear: false });

    // the start tap starts the game and the badge goes with the start screen
    await p.click((await p.$('#start .level')) ? '#start .level' : '#start .start-go', { force: true });
    await p.waitForFunction(() => document.body.classList.contains('ear-on'));
    assert.equal((await badge(p)).visible, false, `${where}: badge gone once the game starts`);
    step(`${where}: badge says the engine, clear of the rest; link switches without starting; gone after start`);
    await ctx.close();
  }
}

assert.deepEqual(errors, []);
await browser.close();
server.close();
console.log('badge smoke ok');
