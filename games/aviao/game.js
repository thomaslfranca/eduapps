import * as THREE from 'three';
import { buildCessna } from './plane.js';
import { buildWorld, heightAt } from './world.js';
import { Sim } from './sim.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 20000);
const { sun } = buildWorld(scene);
const plane = buildCessna();
scene.add(plane.root);
const sim = new Sim(heightAt);
window.__sim = sim; // handy from the console

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// ---------- input ----------
const keys = new Set();
const input = { pitch: 0, roll: 0, yaw: 0, brake: false };
const help = document.getElementById('help');
let cockpit = false;

addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  sound.start();
  if (e.code === 'KeyF') sim.flaps = (sim.flaps + 1) % 4;
  if (e.code === 'KeyC') cockpit = !cockpit;
  if (e.code === 'KeyR') restart();
  if (e.code === 'KeyM') sound.toggle();
  if (e.code === 'KeyH' || e.code === 'Escape') help.hidden = !help.hidden;
  if (!help.hidden && (e.code === 'Enter')) help.hidden = true;
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
document.getElementById('go').addEventListener('click', () => { help.hidden = true; sound.start(); });

const axis = (neg, pos) => (keys.has(pos) ? 1 : 0) - (keys.has(neg) ? 1 : 0);
const ease = (cur, target, rate, dt) => cur + (target - cur) * Math.min(1, rate * dt);

function readInput(dt) {
  input.pitch = ease(input.pitch, axis('KeyW', 'KeyS'), 5, dt);
  input.roll = ease(input.roll, axis('KeyA', 'KeyD'), 6, dt);
  input.yaw = ease(input.yaw, axis('KeyQ', 'KeyE'), 5, dt);
  input.brake = keys.has('Space');
  const t = axis('ArrowDown', 'ArrowUp');
  sim.throttle = THREE.MathUtils.clamp(sim.throttle + t * 0.5 * dt, 0, 1);
}

// ---------- engine sound ----------
const sound = (() => {
  let ctx, gain, osc1, osc2, filter, on = true;
  return {
    start() {
      if (ctx) return;
      ctx = new AudioContext();
      filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 500;
      gain = ctx.createGain(); gain.gain.value = 0;
      osc1 = ctx.createOscillator(); osc1.type = 'sawtooth';
      osc2 = ctx.createOscillator(); osc2.type = 'square';
      const g2 = ctx.createGain(); g2.gain.value = 0.3;
      osc1.connect(filter); osc2.connect(g2).connect(filter);
      filter.connect(gain).connect(ctx.destination);
      osc1.start(); osc2.start();
    },
    toggle() { on = !on; },
    update(throttle, speed, crashed) {
      if (!ctx) return;
      const t = ctx.currentTime;
      const f = 38 + throttle * 55 + speed * 0.15;
      osc1.frequency.setTargetAtTime(f, t, 0.1);
      osc2.frequency.setTargetAtTime(f * 2.02, t, 0.1);
      filter.frequency.setTargetAtTime(350 + throttle * 900, t, 0.1);
      gain.gain.setTargetAtTime(on && !crashed ? 0.04 + throttle * 0.07 : 0, t, 0.08);
    },
  };
})();

// ---------- messages ----------
const msg = document.getElementById('msg');
let msgTimer;
function say(text, ms = 2500) {
  msg.textContent = text;
  msg.classList.add('show');
  clearTimeout(msgTimer);
  if (ms) msgTimer = setTimeout(() => msg.classList.remove('show'), ms);
}
const MESSAGES = {
  takeoff: 'Decolou! ✈️',
  landed: 'Pousou! 🎉',
  hardlanding: 'Pousou… meio duro! 😅',
  crash: 'Bateu! 💥  Aperte R',
  splash: 'Caiu na água! 💦  Aperte R',
};
function restart() {
  sim.reset();
  plane.root.rotation.set(0, 0, 0);
  camQ.copy(sim.q);
  msg.classList.remove('show');
}

// ---------- HUD ----------
const $ = id => document.getElementById(id);
const hud = { spd: $('spd'), alt: $('alt'), vs: $('vs'), hdg: $('hdg'), flp: $('flp'), thr: $('thr'), thrp: $('thrp'), stall: $('stall') };
let hudT = 0;
function updateHud(dt) {
  hudT += dt;
  if (hudT < 0.1) return;
  hudT = 0;
  hud.spd.textContent = Math.round(sim.speed * 1.944);
  hud.alt.textContent = Math.round(Math.max(0, sim.altitude) * 3.281);
  hud.vs.textContent = Math.round(sim.vel.y * 196.85 / 10) * 10;
  hud.hdg.textContent = String(Math.round(sim.heading) % 360).padStart(3, '0');
  hud.flp.textContent = sim.flaps * 10 + '°';
  hud.thr.style.width = sim.throttle * 100 + '%';
  hud.thrp.textContent = Math.round(sim.throttle * 100) + '%';
  hud.stall.hidden = !sim.stalled;
}

// ---------- camera ----------
const camQ = new THREE.Quaternion();
const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12, 0, 0));
const CHASE = new THREE.Vector3(0, 3.2, 13);
const EYE = new THREE.Vector3(-0.25, 0.6, -0.55);
function updateCamera(dt) {
  if (cockpit) {
    camera.position.copy(EYE).applyQuaternion(sim.q).add(sim.pos);
    camera.quaternion.copy(sim.q);
    camQ.copy(sim.q);
  } else {
    camQ.slerp(sim.q, 1 - Math.exp(-dt * 3));
    camera.position.copy(CHASE).applyQuaternion(camQ).add(sim.pos);
    camera.quaternion.copy(camQ).multiply(tilt);
    const floor = heightAt(camera.position.x, camera.position.z) + 1.5;
    if (camera.position.y < floor) camera.position.y = floor;
  }
  plane.windows.visible = !cockpit;
}

// ---------- loop ----------
const STEP = 1 / 120;
let acc = 0, last = performance.now();
camQ.copy(sim.q);

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  readInput(dt);
  if (help.hidden) {
    acc += dt;
    while (acc >= STEP) { sim.step(STEP, input); acc -= STEP; }
  }
  for (const ev of sim.events.splice(0)) say(MESSAGES[ev], sim.crashed ? 0 : 2500);

  plane.root.position.copy(sim.pos);
  plane.root.quaternion.copy(sim.q);
  if (sim.crashed) plane.root.rotateZ(0.5);   // a sad tilt
  plane.animate(dt, { throttle: sim.crashed ? 0 : sim.throttle, input, flaps: sim.flaps });

  sun.position.copy(sim.pos).add(new THREE.Vector3(-120, 200, 80));
  sun.target.position.copy(sim.pos);

  updateCamera(dt);
  updateHud(dt);
  sound.update(sim.throttle, sim.speed, sim.crashed);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
