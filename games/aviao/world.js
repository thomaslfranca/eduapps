// Terrain, airport, trees and clouds. The runway runs along Z through the
// origin (north = -Z); the land around the airport is flat at y = 0, with
// hills and lakes further out.
import * as THREE from 'three';

export const RUNWAY = { length: 1000, width: 30 };
export const WATER_Y = -2;
const SIZE = 24000;

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function heightAt(x, z) {
  const d = Math.hypot(x, z * 0.55);
  const mask = smooth(1300, 3200, d);
  if (mask === 0) return 0;
  let h = 90
    + Math.sin(x * 0.0011) * Math.cos(z * 0.0013) * 170
    + Math.sin(x * 0.0031 + 1.3) * Math.sin(z * 0.0027 + 0.7) * 60
    + Math.sin((x + z) * 0.0007) * 110;
  // a mountain range to the north-east
  const m = Math.hypot(x - 5000, z + 6500);
  h += Math.max(0, 1 - m / 3500) ** 2 * 900;
  return Math.max(h * mask, -15);
}

// Cheap deterministic noise for colours and placement
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function terrain() {
  const seg = 240;
  const g = new THREE.PlaneGeometry(SIZE, SIZE, seg, seg);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  const colors = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const h = heightAt(x, z);
    p.setY(i, h);
    const n = rand() * 0.08;
    if (h < WATER_Y + 1) c.setRGB(0.78, 0.72, 0.52);           // sand
    else if (h < 320) c.setRGB(0.32 + n, 0.55 + n, 0.22);       // grass
    else if (h < 600) c.setRGB(0.42 + n, 0.42 + n, 0.36);       // rock
    else c.setRGB(0.95, 0.96, 0.98);                            // snow
    // farm fields near the airport
    if (h === 0 && Math.abs(x) > 80) {
      const f = (Math.floor(x / 300) * 7 + Math.floor(z / 300) * 13) % 4;
      if (f === 1) c.setRGB(0.55, 0.62, 0.25);
      if (f === 2) c.setRGB(0.28, 0.48, 0.2);
    }
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.receiveShadow = true;
  return m;
}

function water() {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(SIZE, SIZE),
    new THREE.MeshLambertMaterial({ color: 0x3b7fc4, transparent: true, opacity: 0.9 }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = WATER_Y;
  return m;
}

function flat(w, l, color, x, z, y) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), new THREE.MeshLambertMaterial({ color }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  return m;
}

function airport() {
  const g = new THREE.Group();
  const { length: L, width: W } = RUNWAY;
  g.add(flat(W + 10, L + 40, 0x8a8f78, 0, 0, 0.02));   // shoulder
  g.add(flat(W, L, 0x3c3d42, 0, 0, 0.04));             // runway
  for (let z = -L / 2 + 60; z < L / 2 - 60; z += 40) g.add(flat(1, 20, 0xffffff, 0, z, 0.06));
  for (const end of [-1, 1]) {
    for (let i = 0; i < 8; i++) {
      const x = -W / 2 + 3 + i * 3.4 + (i >= 4 ? 1.6 : 0);
      g.add(flat(1.6, 25, 0xffffff, x, end * (L / 2 - 20), 0.06));
    }
    g.add(flat(W, 2, 0xffffff, 0, end * (L / 2 - 2), 0.06));
  }
  // taxiway and apron on the east side
  g.add(flat(12, 120, 0x4a4b50, 45, 320, 0.03));
  g.add(flat(90, 70, 0x4a4b50, 100, 360, 0.03));

  const box = (w, h, d, color, x, z, y = h / 2) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return m;
  };
  // hangars
  box(30, 10, 26, 0xd7dbe0, 130, 330);
  box(30, 10, 26, 0xc9cfd6, 130, 395);
  box(31, 1.2, 27, 0x8b2f2f, 130, 330, 10.6);
  box(31, 1.2, 27, 0x8b2f2f, 130, 395, 10.6);
  // control tower
  box(5, 16, 5, 0xe8e4da, 85, 250);
  box(8, 4, 8, 0x2c4a63, 85, 250, 18);
  box(9, 0.8, 9, 0xe8e4da, 85, 250, 20.4);
  // windsock
  const pole = box(0.2, 6, 0.2, 0x888888, -30, -380);
  pole.castShadow = true;
  const sock = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3.5, 10, 1, true), new THREE.MeshLambertMaterial({ color: 0xff7a1a, side: THREE.DoubleSide }));
  sock.rotation.z = Math.PI / 2;
  sock.position.set(-28.3, 5.6, -380);
  g.add(sock);
  return g;
}

function trees() {
  const N = 4000;
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.4, 0.5, 4, 5), new THREE.MeshLambertMaterial({ color: 0x6b4a2b }), N);
  const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(3.2, 9, 7), new THREE.MeshLambertMaterial({ color: 0x2f6b2c }), N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
  let n = 0;
  while (n < N) {
    const x = (rand() - 0.5) * 16000, z = (rand() - 0.5) * 16000;
    if (Math.abs(x) < 260 && Math.abs(z) < 800) continue;   // keep the runway clear
    const h = heightAt(x, z);
    if (h < WATER_Y + 2 || h > 450) continue;
    const k = 0.7 + rand() * 0.8;
    s.set(k, k, k);
    m.compose(v.set(x, h + 2 * k, z), q, s); trunks.setMatrixAt(n, m);
    m.compose(v.set(x, h + 8 * k, z), q, s); crowns.setMatrixAt(n, m);
    n++;
  }
  crowns.castShadow = true;
  return [trunks, crowns];
}

function clouds() {
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(1, 10, 8);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x9aa6b4, transparent: true, opacity: 0.92 });
  for (let i = 0; i < 70; i++) {
    const c = new THREE.Group();
    c.position.set((rand() - 0.5) * 18000, 700 + rand() * 600, (rand() - 0.5) * 18000);
    const puffs = 4 + Math.floor(rand() * 4);
    for (let j = 0; j < puffs; j++) {
      const p = new THREE.Mesh(geo, mat);
      const r = 60 + rand() * 80;
      p.scale.set(r * 1.4, r * 0.7, r);
      p.position.set((rand() - 0.5) * 260, (rand() - 0.5) * 40, (rand() - 0.5) * 160);
      c.add(p);
    }
    g.add(c);
  }
  return g;
}

export function buildWorld(scene) {
  scene.background = new THREE.Color(0x8ec9f5);
  scene.fog = new THREE.Fog(0xb9dcf5, 2500, 11000);
  scene.add(new THREE.HemisphereLight(0xdff1ff, 0x5c6b3a, 1.1));
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 400 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  scene.add(terrain(), water(), airport(), ...trees(), clouds());
  return { sun };
}
