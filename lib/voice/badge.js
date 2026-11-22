// A small corner line on the start screen, for the adult: which speech engine
// is set, and a link that switches it (a reload through ?engine=, which sticks).

const NAME = { web: 'navegador', vosk: 'Vosk (offline)' };

// ?engine=<to>, every other param (debug, meter…) and the hash kept.
export function switchHref(search, hash, to) {
  const p = new URLSearchParams(search);
  p.set('engine', to);
  return `?${p}${hash || ''}`;
}

export function badgeText(engine, fellBack) {
  if (fellBack) return { label: 'Voz: Vosk falhou, usando navegador', link: 'ficar no navegador', to: 'web' };
  const to = engine === 'vosk' ? 'web' : 'vosk';
  return { label: `Voz: ${NAME[engine]}`, link: `trocar para ${NAME[to]}`, to };
}

const CSS = `
.voice-badge{position:fixed;z-index:22;right:max(10px,env(safe-area-inset-right));bottom:max(8px,env(safe-area-inset-bottom));
max-width:calc(100vw - 20px);margin:0;padding:4px 10px;border-radius:999px;background:rgba(0,0,0,.45);color:#fff;
font:500 12px/1.4 system-ui,sans-serif;text-align:right}
.voice-badge a{color:#fff;font-weight:700;text-decoration:underline;padding:6px 0}
[hidden]+.voice-badge{display:none}`;

// startEl: the start screen. The badge sits after it, not inside it (so a tap
// on the link is never the start tap), and goes away with it.
export function engineBadge(startEl, ear) {
  if (!document.getElementById('voice-badge-css')) {
    document.head.append(Object.assign(document.createElement('style'), { id: 'voice-badge-css', textContent: CSS }));
  }
  const el = Object.assign(document.createElement('p'), { className: 'voice-badge' });
  const render = () => {
    const t = badgeText(ear.engine, ear.fellBack);
    el.dataset.engine = ear.fellBack ? 'vosk-failed' : ear.engine;
    el.textContent = `${t.label} · `;
    const a = Object.assign(document.createElement('a'), { href: switchHref(location.search, location.hash, t.to), textContent: t.link });
    el.append(a);
  };
  el.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('voice-engine', render);
  render();
  startEl.after(el);
  return el;
}
