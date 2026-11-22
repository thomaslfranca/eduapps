// Cessna 172 built from simple shapes. Units are metres; the origin is the
// centre of gravity, the nose points along -Z, up is +Y, right wing is +X.
// With the wheels on the ground the origin sits GEAR_H above it.
import * as THREE from 'three';

export const GEAR_H = 1.25;

const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const WHITE = mat(0xf5f5f0);
const RED = mat(0xc62828);
const BLUE = mat(0x1f3f8f);
const GLASS = mat(0x22384d);
const DARK = mat(0x26262b);
const METAL = mat(0x9aa0a8);

// A box whose front face (z = -len/2) is w1 x h1 and back face is w2 x h2,
// with the back face shifted up by yShift.
function taperBox(w1, h1, w2, h2, len, yShift = 0) {
  const g = new THREE.BoxGeometry(1, 1, len);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getZ(i) / len + 0.5;
    p.setX(i, p.getX(i) * (w1 + (w2 - w1) * t));
    p.setY(i, p.getY(i) * (h1 + (h2 - h1) * t) + t * yShift);
  }
  g.computeVertexNormals();
  return g;
}

function mesh(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  return m;
}

// A thin rod between two points.
function rod(a, b, r, material) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), material);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  return m;
}

function wheel(r, w, x, y, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 14), DARK);
  m.rotation.z = Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}

// A control surface hinged along X at (x, y, z), hanging behind the hinge.
function surface(span, chord, thick, material, x, y, z) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  pivot.add(mesh(new THREE.BoxGeometry(span, thick, chord), material, 0, 0, chord / 2));
  return pivot;
}

export function buildCessna() {
  const root = new THREE.Group();
  const windows = new THREE.Group(); // hidden in cockpit view
  root.add(windows);

  // Fuselage: cowl, cabin, tail cone
  root.add(mesh(taperBox(0.7, 0.6, 0.95, 0.85, 1.2, 0.05), WHITE, 0, -0.12, -2.1));
  root.add(mesh(new THREE.BoxGeometry(1.1, 1.25, 2.6), WHITE, 0, 0.05, -0.2));
  root.add(mesh(taperBox(1.1, 1.15, 0.2, 0.35, 4.3, 0.35), WHITE, 0, 0.1, 3.25));

  // Paint: red cheat line along both sides, blue belly
  for (const s of [-1, 1]) {
    root.add(mesh(new THREE.BoxGeometry(0.02, 0.14, 3.7), RED, s * 0.555, -0.22, -0.75));
    root.add(mesh(new THREE.BoxGeometry(0.02, 0.07, 3.7), BLUE, s * 0.556, -0.34, -0.75));
  }

  // Glass
  windows.add(mesh(new THREE.BoxGeometry(1.0, 0.36, 0.04), GLASS, 0, 0.47, -1.52));
  for (const s of [-1, 1]) {
    windows.add(mesh(new THREE.BoxGeometry(0.03, 0.5, 0.95), GLASS, s * 0.555, 0.32, -0.85));
    windows.add(mesh(new THREE.BoxGeometry(0.03, 0.46, 0.8), GLASS, s * 0.555, 0.32, 0.25));
  }

  // Propeller and spinner
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.38, 14), METAL);
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.set(0, -0.08, -2.88);
  root.add(spinner);
  const prop = new THREE.Group();
  prop.position.set(0, -0.08, -2.74);
  const blade = mesh(new THREE.BoxGeometry(0.13, 1.9, 0.04), DARK);
  prop.add(blade);
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(0.95, 32),
    new THREE.MeshBasicMaterial({ color: 0x333333, transparent: true, opacity: 0, depthWrite: false }),
  );
  prop.add(disc);
  root.add(prop);

  // High wing in two halves with a little dihedral.
  // Main box from the leading edge (z = -1.0) to the hinge line (z = 0.2).
  const parts = { aileronL: null, aileronR: null, flapL: null, flapR: null };
  for (const s of [-1, 1]) {
    const half = new THREE.Group();
    half.position.set(s * 0.45, 0.74, 0);
    half.rotation.z = s * 0.03;
    half.add(mesh(new THREE.BoxGeometry(5.1, 0.14, 1.2), WHITE, s * 2.55, 0, -0.4));
    half.add(mesh(new THREE.BoxGeometry(0.25, 0.15, 1.5), RED, s * 5.1, 0, -0.25)); // tips
    const flap = surface(2.4, 0.3, 0.09, WHITE, s * 1.25, -0.01, 0.2);
    const aileron = surface(2.3, 0.3, 0.09, WHITE, s * 3.75, -0.01, 0.2);
    half.add(flap, aileron);
    if (s < 0) { parts.flapL = flap; parts.aileronL = aileron; } else { parts.flapR = flap; parts.aileronR = aileron; }
    root.add(half);
    root.add(rod([s * 0.55, -0.45, -0.45], [s * 2.9, 0.72, -0.45], 0.035, METAL));
  }

  // Tail: horizontal stabiliser + elevator, swept fin + rudder
  root.add(mesh(new THREE.BoxGeometry(3.4, 0.07, 0.75), WHITE, 0, 0.45, 4.92));
  const elevator = surface(3.4, 0.4, 0.06, WHITE, 0, 0.45, 5.3);
  root.add(elevator);

  const fin = new THREE.Shape();
  fin.moveTo(4.2, 0.55); fin.lineTo(5.32, 0.55); fin.lineTo(5.32, 1.95); fin.lineTo(5.0, 1.95); fin.closePath();
  const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.08, bevelEnabled: false });
  finGeo.translate(0, 0, -0.04);
  const finMesh = new THREE.Mesh(finGeo, WHITE);
  finMesh.rotation.y = -Math.PI / 2; // shape x -> world z
  root.add(finMesh);
  const rudder = new THREE.Group();
  rudder.position.set(0, 0, 5.32);
  rudder.add(mesh(new THREE.BoxGeometry(0.07, 1.35, 0.34), RED, 0, 1.25, 0.17));
  root.add(rudder);

  // Tricycle gear; wheel bottoms at y = -GEAR_H
  for (const s of [-1, 1]) {
    root.add(rod([s * 0.5, -0.55, 0.2], [s * 1.2, -1.0, 0.25], 0.045, METAL));
    root.add(wheel(0.25, 0.16, s * 1.25, -GEAR_H + 0.25, 0.25));
  }
  root.add(rod([0, -0.45, -2.25], [0, -1.05, -2.25], 0.045, METAL));
  root.add(wheel(0.2, 0.13, 0, -GEAR_H + 0.2, -2.25));

  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  disc.castShadow = false;

  // Moves props and control surfaces to match the inputs.
  function animate(dt, { throttle, input, flaps }) {
    const rpm = 600 + throttle * 2100;
    prop.rotation.z += (rpm / 60) * Math.PI * 2 * dt;
    const fast = rpm > 1000;
    blade.visible = !fast;
    disc.material.opacity = fast ? 0.25 : 0;
    const rad = THREE.MathUtils.degToRad;
    // positive rotation.x on a hinge = trailing edge down
    parts.aileronL.rotation.x = input.roll * rad(18);
    parts.aileronR.rotation.x = -input.roll * rad(18);
    parts.flapL.rotation.x = parts.flapR.rotation.x = rad(flaps * 10);
    elevator.rotation.x = -input.pitch * rad(22);
    rudder.rotation.y = input.yaw * rad(22);
  }

  return { root, windows, animate };
}
