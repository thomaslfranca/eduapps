// A sound wave that leaves the ear and scrolls left along the top while someone
// speaks: easier to notice than the ear's own pulse. Fed one level (0..1) per
// frame; the history scrolls left, fading with age, so silence goes flat and
// then the canvas is cleared and the loop stops.

const AGE = 0.9; // s a sample stays on screen: with the meter's own decay, silence is gone in ~1.3 s
const FLOOR = 0.04; // room noise: a level below this draws flat
const CYCLES = 7; // carrier cycles per second of history: the ripples travel with the sound

// ear:   the ear element; the wave follows it (it moves between layouts) and takes its
//        color: its --wave, else its background
// level: () => 0..1, read once a frame
// avoid: what the wave must stop short of when it sits on the ear's row (back button, progress dots)
export function createWave(ear, level, avoid = '.back, .dots') {
  const cv = document.createElement('canvas');
  cv.className = 'voice-wave';
  cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:6;';
  document.body.append(cv);
  const g = cv.getContext('2d');

  const hist = []; // { t (s), v }, oldest first
  let raf = 0;
  let box = null; // { w, h } of the canvas in css px; its right edge is where the wave leaves the ear
  let dpr = 1;
  let color = '';
  let n = 0;

  function place() {
    const r = ear.getBoundingClientRect();
    if (!r.width) return (box = null);
    const h = Math.round(r.height * 1.3);
    const top = r.top + r.height / 2 - h / 2;
    let left = 0;
    for (const el of document.querySelectorAll(avoid)) {
      const o = el.getBoundingClientRect();
      if (o.width && o.right < r.left && o.bottom > top && o.top < top + h) left = Math.max(left, Math.round(o.right + 8));
    }
    box = { w: Math.max(0, Math.round(r.left - 6) - left), h };
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.style.left = `${left}px`;
    cv.style.top = `${Math.round(top)}px`;
    cv.style.width = `${box.w}px`;
    cv.style.height = `${h}px`;
    const W = Math.round(box.w * dpr);
    const H = Math.round(h * dpr);
    if (cv.width !== W || cv.height !== H) Object.assign(cv, { width: W, height: H }); // reallocates: only on a change
  }

  function tint() {
    const cs = getComputedStyle(ear);
    g.fillStyle = '#2f6fd0';
    g.fillStyle = cs.getPropertyValue('--wave').trim() || cs.backgroundColor; // normalized to #rrggbb
    const hex = /^#[0-9a-f]{6}$/i.test(g.fillStyle) ? g.fillStyle : '#2f6fd0';
    color = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',');
  }

  function frame(ms) {
    raf = 0;
    const now = ms / 1000;
    hist.push({ t: now, v: Math.max(0, Math.min(1, (level() - FLOOR) / (1 - FLOOR))) });
    while (hist.length && now - hist[0].t > AGE) hist.shift();
    if (!box || n++ % 20 === 0) {
      place();
      tint();
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, box?.w || 0, box?.h || 0);
    if (!hist.some((s) => s.v > 0.01)) return idle();
    if (box?.w) draw(now);
    raf = requestAnimationFrame(frame);
  }

  function draw(now) {
    const { w, h } = box;
    const mid = h / 2;
    const reach = Math.min(w, Math.max(w * 0.6, 260)); // px the oldest sample has travelled
    const speed = reach / AGE;
    const fade = g.createLinearGradient(w, 0, w - reach, 0);
    fade.addColorStop(0, `rgba(${color},.85)`);
    fade.addColorStop(1, `rgba(${color},0)`);
    g.strokeStyle = fade;
    g.lineWidth = 2.5;
    g.lineJoin = g.lineCap = 'round';
    g.beginPath();
    let i = hist.length - 1;
    for (let d = 0; d <= reach; d += 3) {
      const t = now - d / speed; // when the sound at this x left the ear
      while (i > 0 && hist[i].t > t) i--;
      const a = hist[i];
      const b = hist[i + 1] || a;
      if (t < a.t) break; // older than the history: nothing there yet
      const v = a === b ? a.v : a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t);
      const amp = v * (mid - 2) * Math.min(1, d / 12); // leaves the ear from a point
      const y = mid + amp * Math.sin(2 * Math.PI * CYCLES * t);
      if (d) g.lineTo(w - d, y);
      else g.moveTo(w, y);
    }
    g.stroke();
  }

  function idle() {
    hist.length = 0;
    box = null; // re-measure on the next wake: the layout may change while idle
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    cancelAnimationFrame(raf);
    raf = 0;
    g.clearRect(0, 0, cv.width, cv.height);
    idle();
  });
  addEventListener('resize', () => (box = null));

  return {
    // Something may be heard: run the loop until the history goes quiet.
    wake() {
      if (!raf && !document.hidden) raf = requestAnimationFrame(frame);
    },
  };
}
