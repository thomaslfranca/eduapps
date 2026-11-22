// Corner label on the start screen: the speech engine in use, and a link to switch.
export function engineBadge(engine) {
  const to = engine === 'vosk' ? 'web' : 'vosk';
  const el = document.createElement('p');
  el.style.cssText = 'position:fixed;z-index:22;right:10px;bottom:8px;margin:0;font:12px system-ui;color:#555';
  el.innerHTML = `Voz: ${engine} · <a href="?engine=${to}">trocar para ${to}</a>`;
  el.addEventListener('click', (e) => e.stopPropagation());
  return el;
}
