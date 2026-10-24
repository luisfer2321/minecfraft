// Física del jugador: gravedad, salto, natación, vuelo y colisiones con bloques.

import * as THREE from 'three';
import { KIND, KIND_LIQUID, SOLID } from './blocks.js';

const HALF_W = 0.3;
const HEIGHT = 1.8;
export const EYE_HEIGHT = 1.62;

export class Player {
  constructor(world) {
    this.world = world;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.flying = false;
    this.inWater = false;
    this.hitWall = false;
  }

  blockAt(x, y, z) {
    return this.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
  }

  update(dt, input) {
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let fx = 0, fz = 0;
    if (input.forward) { fx -= sin; fz -= cos; }
    if (input.back) { fx += sin; fz += cos; }
    if (input.right) { fx += cos; fz -= sin; }
    if (input.left) { fx -= cos; fz += sin; }
    const len = Math.hypot(fx, fz);
    if (len > 0) { fx /= len; fz /= len; }

    const p = this.pos;
    this.inWater = KIND[this.blockAt(p.x, p.y + 0.4, p.z)] === KIND_LIQUID;
    const v = this.vel;

    if (this.flying) {
      const speed = input.sprint ? 22 : 11;
      const k = Math.min(1, 10 * dt);
      v.x += (fx * speed - v.x) * k;
      v.z += (fz * speed - v.z) * k;
      const vy = (input.jump ? speed : 0) - (input.down ? speed : 0);
      v.y += (vy - v.y) * k;
    } else {
      const speed = this.inWater ? 2.6 : input.sprint ? 5.8 : 4.3;
      const accel = this.onGround ? 16 : this.inWater ? 8 : 6;
      const k = Math.min(1, accel * dt);
      v.x += (fx * speed - v.x) * k;
      v.z += (fz * speed - v.z) * k;
      if (this.inWater) {
        v.y -= 12 * dt;
        if (input.jump) v.y += 26 * dt;
        v.y = Math.max(-3.5, Math.min(v.y, 4));
        if (input.jump && this.hitWall) v.y = 6.5; // salir del agua a una orilla
      } else {
        v.y = Math.max(v.y - 28 * dt, -55);
        if (input.jump && this.onGround) v.y = 8.6;
      }
    }

    this.move(v.x * dt, v.y * dt, v.z * dt);
    if (this.onGround && this.flying && !input.jump) this.flying = false;
  }

  move(dx, dy, dz) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.25));
    this.onGround = false;
    this.hitWall = false;
    for (let i = 0; i < steps; i++) {
      if (this.moveAxis('y', dy / steps)) {
        if (dy < 0) this.onGround = true;
        this.vel.y = 0;
      }
      if (this.moveAxis('x', dx / steps)) { this.vel.x = 0; this.hitWall = true; }
      if (this.moveAxis('z', dz / steps)) { this.vel.z = 0; this.hitWall = true; }
    }
  }

  // Mueve en un eje y resuelve la colisión; devuelve true si chocó.
  moveAxis(axis, d) {
    if (d === 0) return false;
    const p = this.pos;
    p[axis] += d;
    const minX = Math.floor(p.x - HALF_W), maxX = Math.floor(p.x + HALF_W - 1e-9);
    const minY = Math.floor(p.y), maxY = Math.floor(p.y + HEIGHT - 1e-9);
    const minZ = Math.floor(p.z - HALF_W), maxZ = Math.floor(p.z + HALF_W - 1e-9);
    let bound = d > 0 ? Infinity : -Infinity;
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          if (!SOLID[this.world.getBlock(x, y, z)]) continue;
          const b = axis === 'x' ? x : axis === 'y' ? y : z;
          bound = d > 0 ? Math.min(bound, b) : Math.max(bound, b + 1);
        }
      }
    }
    if (!Number.isFinite(bound)) return false;
    if (axis === 'y') p.y = d > 0 ? bound - HEIGHT - 1e-4 : bound;
    else p[axis] = d > 0 ? bound - HALF_W - 1e-3 : bound + HALF_W + 1e-3;
    return true;
  }

  intersectsBlock(x, y, z) {
    const p = this.pos;
    return (
      p.x + HALF_W > x && p.x - HALF_W < x + 1 &&
      p.y + HEIGHT > y && p.y < y + 1 &&
      p.z + HALF_W > z && p.z - HALF_W < z + 1
    );
  }
}
