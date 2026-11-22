// A small flight model for a Cessna 172: lift, drag, thrust and gravity as
// forces, and arcade-style rotation with weathervane stability.
// Body axes: +X right wing, +Y up, -Z nose.
import * as THREE from 'three';
import { GEAR_H } from './plane.js';
import { WATER_Y } from './world.js';

const G = 9.81, RHO = 1.225, MASS = 1043, S = 16.2;
const STATIC_THRUST = 3200, V_PROP_MAX = 95;   // N, m/s
const TRIM_ALPHA = 0.07;                     // rad; hands-off trim around 75-80 kt
const REF_Q = 0.5 * RHO * 40 * 40;             // dynamic pressure where controls have "normal" authority

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), NZ = new THREE.Vector3(0, 0, -1);
const clamp = THREE.MathUtils.clamp;

export class Sim {
  constructor(heightAt) {
    this.heightAt = heightAt;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.q = new THREE.Quaternion();
    this.w = new THREE.Vector3();        // body rates: x pitch up, y yaw left, z roll left (rad/s)
    this.reset();
  }

  reset() {
    this.pos.set(0, GEAR_H, 460);
    this.vel.set(0, 0, 0);
    this.q.identity();
    this.w.set(0, 0, 0);
    this.throttle = 0;
    this.flaps = 0;                       // notches 0..3 = 0°, 10°, 20°, 30°
    this.onGround = true;
    this.crashed = false;
    this.stalled = false;
    this.alpha = 0;
    this.airTime = 0;
    this.flying = false;
    this.events = [];
  }

  fwd() { return NZ.clone().applyQuaternion(this.q); }
  up() { return Y.clone().applyQuaternion(this.q); }
  right() { return X.clone().applyQuaternion(this.q); }

  get speed() { return this.vel.length(); }
  get altitude() { return this.pos.y - GEAR_H; }
  get heading() {
    const f = this.fwd();
    return (THREE.MathUtils.radToDeg(Math.atan2(f.x, -f.z)) + 360) % 360;
  }

  step(dt, input) {
    if (this.crashed) return;
    const fwd = this.fwd(), up = this.up(), right = this.right();
    const speed = this.speed;
    const vb = this.vel.clone().applyQuaternion(this.q.clone().invert());
    const vFwd = -vb.z;
    const alpha = speed > 2 ? Math.atan2(-vb.y, Math.max(vFwd, 0.5)) : 0;
    const beta = speed > 2 ? Math.atan2(vb.x, Math.max(vFwd, 0.5)) : 0;
    this.alpha = alpha;

    // Lift coefficient with a stall
    const stallA = THREE.MathUtils.degToRad(15.5 - this.flaps * 0.8);
    const cl0 = 0.25 + this.flaps * 0.15;
    const a = Math.abs(alpha);
    let cl;
    if (a < stallA) cl = cl0 + 5 * alpha;
    else {
      const clMax = cl0 + 5 * stallA * Math.sign(alpha);
      cl = clMax * Math.max(0.45, 1 - (a - stallA) * 3);
    }
    this.stalled = !this.onGround && a > stallA;
    const cd = 0.032 + 0.045 * cl * cl + this.flaps * 0.014 + (this.stalled ? 0.08 : 0);
    const qd = 0.5 * RHO * speed * speed;

    const F = new THREE.Vector3(0, -G * MASS, 0);
    F.addScaledVector(fwd, this.throttle * STATIC_THRUST * Math.max(0, 1 - vFwd / V_PROP_MAX));
    if (speed > 0.5) {
      const vhat = this.vel.clone().divideScalar(speed);
      const liftDir = new THREE.Vector3().crossVectors(right, vhat).normalize();
      F.addScaledVector(liftDir, qd * S * cl);
      F.addScaledVector(vhat, -qd * S * cd);
      F.addScaledVector(right, -qd * 5 * beta);
    }

    // Rotation. f = how much the air bites; prop wash helps the tail at low speed.
    const f = Math.min(qd / REF_Q, 2.5);
    const fe = f + this.throttle * 0.35;
    // Flight-path angle. Feeding it back into pitch damps the phugoid, so
    // hands off the plane drifts back towards level flight (friendlier for kids).
    const gamma = speed > 5 ? Math.asin(clamp(this.vel.y / speed, -1, 1)) : 0;
    // Bank angle; a gentle pull back towards wings-level (dihedral), stronger than
    // the real thing so a spiral dive doesn't sneak up on a young pilot.
    const bank = Math.asin(clamp(right.y, -1, 1));
    const stallKick = this.stalled ? 0.6 : 1;   // controls go mushy in a stall
    const acc = new THREE.Vector3(
      input.pitch * 1.8 * fe * stallKick - (alpha - TRIM_ALPHA) * 4 * f - gamma * 1.5 * f - this.w.x * (1 + 2.5 * f),
      -input.yaw * 0.9 * fe - beta * 3 * f - this.w.y * (1 + 2 * f),
      -input.roll * 3 * fe * stallKick - bank * 0.5 * f - this.w.z * (1.5 + 3 * f),
    );
    // a stalled wing tends to drop, and the nose falls through
    if (this.stalled) { acc.x -= 1.2; acc.z += Math.sin(performance.now() * 0.0013) * 0.6; }
    this.w.addScaledVector(acc, dt);
    const dq = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.w.x * dt, this.w.y * dt, this.w.z * dt));
    this.q.multiply(dq).normalize();

    this.vel.addScaledVector(F, dt / MASS);
    this.pos.addScaledVector(this.vel, dt);

    this.ground(dt, input);
  }

  ground(dt, input) {
    const gh = this.heightAt(this.pos.x, this.pos.z);
    const contact = gh + GEAR_H;
    if (this.pos.y > contact + 0.05) {
      this.onGround = false;
      this.airTime += dt;
      // a little hop or bounce isn't a takeoff; climbing past ~15 ft is
      if (!this.flying && this.pos.y > contact + 5) { this.flying = true; this.events.push('takeoff'); }
      return;
    }
    if (this.pos.y > contact) return;

    const e = new THREE.Euler().setFromQuaternion(this.q, 'YXZ'); // x pitch, y heading, z roll
    const sink = -this.vel.y;
    if (gh < WATER_Y + 0.5) return this.crash('water');
    if (sink > 5.5 || Math.abs(e.z) > 0.4 || e.x < -0.18 || e.x > 0.45) return this.crash('ground');

    this.pos.y = contact;
    if (this.vel.y < 0) this.vel.y = 0;
    if (!this.onGround && this.airTime > 3) this.events.push(sink > 3 ? 'hardlanding' : 'landed');
    this.onGround = true;
    this.airTime = 0;
    if (this.speed < 15) this.flying = false;

    // Wheels: level the wings, keep the nose wheel from digging in or the tail from striking
    const gs = Math.hypot(this.vel.x, this.vel.z);
    e.z *= 1 - Math.min(1, dt * 8);
    e.x = clamp(e.x, -0.015, 0.22);
    const steer = clamp(input.yaw + input.roll, -1, 1);
    e.y -= steer * 0.7 * Math.min(1, gs / 6) / (1 + gs / 25) * dt;
    this.q.setFromEuler(e);
    this.w.y = this.w.z = 0;
    if (e.x <= -0.015 && this.w.x < 0) this.w.x = 0;
    // without enough airspeed the nose settles back onto the nose wheel
    if (e.x > 0) this.w.x -= 2.5 * dt * Math.max(0, 1 - this.speed / 30);

    // Tyres don't slide sideways; rolling friction and brakes
    const fh = this.fwd(); fh.y = 0; fh.normalize();
    let along = this.vel.x * fh.x + this.vel.z * fh.z;
    const decel = (input.brake ? 4.5 : 0.25) * dt;
    along = Math.abs(along) <= decel ? 0 : along - Math.sign(along) * decel;
    this.vel.x = fh.x * along;
    this.vel.z = fh.z * along;
  }

  crash(where) {
    this.crashed = true;
    this.vel.set(0, 0, 0);
    this.w.set(0, 0, 0);
    this.events.push(where === 'water' ? 'splash' : 'crash');
  }
}
