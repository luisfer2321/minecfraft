// Mundo infinito dividido en chunks de 16x16 columnas: generación del terreno,
// cuevas, árboles y cambios hechos por el jugador.

import { SimplexNoise, fbm2, hash2, hash3 } from './noise.js';
import { B } from './blocks.js';

export const CS = 16; // tamaño horizontal de un chunk
export const CH = 96; // altura del mundo
export const SEA = 32; // nivel del mar
const SNOW_LINE = 64;

export const chunkKey = (cx, cz) => `${cx},${cz}`;

export class World {
  constructor(seed, savedEdits = {}) {
    this.seed = seed;
    this.terrain = new SimplexNoise(seed);
    this.mountains = new SimplexNoise(seed + 1);
    this.caveA = new SimplexNoise(seed + 2);
    this.caveB = new SimplexNoise(seed + 3);
    this.forest = new SimplexNoise(seed + 4);
    this.chunks = new Map();
    // Cambios del jugador: clave de chunk -> Map(índice local -> id de bloque)
    this.edits = new Map(Object.entries(savedEdits).map(([k, list]) => [k, new Map(list)]));
  }

  heightAt(x, z) {
    const cont = fbm2(this.terrain, x * 0.0025, z * 0.0025, 4);
    const m = this.mountains.noise2D(x * 0.005, z * 0.005);
    const mount = m > 0 ? m * m : 0;
    const detail = fbm2(this.terrain, x * 0.015 + 50, z * 0.015 + 50, 3);
    const h = SEA + 3 + cont * 14 + detail * 4 + mount * 42;
    return Math.max(4, Math.min(CH - 12, Math.floor(h)));
  }

  // Cuevas tipo "espagueti": intersección de dos superficies de ruido.
  isCave(x, y, z, h) {
    if (y <= 4) return false;
    if (y >= h - 3 && h <= SEA + 3) return false; // evita agujeros junto al agua
    const a = this.caveA.noise3D(x * 0.045, y * 0.07, z * 0.045);
    const b = this.caveB.noise3D(x * 0.045, y * 0.07, z * 0.045);
    return a * a + b * b < 0.012;
  }

  surfaceBlock(h) {
    if (h <= SEA + 1) return B.SAND;
    if (h >= SNOW_LINE) return B.SNOW;
    return B.GRASS;
  }

  generateChunk(cx, cz) {
    const data = new Uint8Array(CS * CS * CH);
    const x0 = cx * CS;
    const z0 = cz * CS;
    const seed = this.seed;
    const M = 2; // margen para árboles de chunks vecinos
    const W = CS + M * 2;
    const heights = new Int16Array(W * W);
    for (let lz = -M; lz < CS + M; lz++) {
      for (let lx = -M; lx < CS + M; lx++) {
        heights[(lz + M) * W + lx + M] = this.heightAt(x0 + lx, z0 + lz);
      }
    }

    for (let lz = 0; lz < CS; lz++) {
      for (let lx = 0; lx < CS; lx++) {
        const wx = x0 + lx;
        const wz = z0 + lz;
        const h = heights[(lz + M) * W + lx + M];
        const top = Math.max(h, SEA);
        for (let y = 0; y <= top; y++) {
          let id;
          if (y === 0 || (y <= 3 && hash3(wx, y, wz, seed) < (4 - y) * 0.2)) id = B.BEDROCK;
          else if (y < h - 3) {
            id = B.STONE;
            if (hash3(wx >> 1, y >> 1, wz >> 1, seed + 17) < 0.03 && hash3(wx, y, wz, seed + 18) < 0.6) {
              id = y < SEA - 4 && hash3(wx >> 1, y >> 1, wz >> 1, seed + 19) < 0.35 ? B.IRON_ORE : B.COAL_ORE;
            }
          } else if (y < h) id = h <= SEA + 1 ? B.SAND : B.DIRT;
          else if (y === h) id = this.surfaceBlock(h);
          else id = B.WATER;
          if (y <= h && id !== B.BEDROCK && this.isCave(wx, y, wz, h)) id = B.AIR;
          data[(y * CS + lz) * CS + lx] = id;
        }
      }
    }

    // Árboles (incluye los de columnas vecinas para que crucen los bordes).
    const trees = [];
    for (let lz = -M; lz < CS + M; lz++) {
      for (let lx = -M; lx < CS + M; lx++) {
        const h = heights[(lz + M) * W + lx + M];
        if (h <= SEA + 1 || h >= SNOW_LINE - 2) continue;
        const wx = x0 + lx;
        const wz = z0 + lz;
        const forest = this.forest.noise2D(wx * 0.008, wz * 0.008);
        const density = 0.004 + Math.max(0, forest) * 0.06;
        if (hash2(wx, wz, seed + 5) >= density) continue;
        if (this.isCave(wx, h, wz, h)) continue;
        trees.push([lx, lz, h, 4 + Math.floor(hash2(wx, wz, seed + 9) * 3)]);
      }
    }
    const set = (lx, y, lz, id, force) => {
      if (lx < 0 || lx >= CS || lz < 0 || lz >= CS || y < 0 || y >= CH) return;
      const i = (y * CS + lz) * CS + lx;
      if (force || data[i] === B.AIR) data[i] = id;
    };
    for (const [lx, lz, h, th] of trees) {
      const topY = h + th;
      for (let dy = -2; dy <= 1; dy++) {
        const r = dy < 0 ? 2 : 1;
        const y = topY + dy;
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            const corner = Math.abs(dx) === r && Math.abs(dz) === r;
            if (corner && (dy >= 0 || hash3(x0 + lx + dx, y, z0 + lz + dz, seed + 3) < 0.5)) continue;
            set(lx + dx, y, lz + dz, B.LEAVES, false);
          }
        }
      }
    }
    for (const [lx, lz, h, th] of trees) {
      set(lx, h, lz, B.DIRT, true);
      for (let y = h + 1; y <= h + th; y++) set(lx, y, lz, B.LOG, true);
    }

    const key = chunkKey(cx, cz);
    const edits = this.edits.get(key);
    if (edits) for (const [i, id] of edits) data[i] = id;

    const chunk = { cx, cz, key, data, dirty: true, solidMesh: null, waterMesh: null };
    this.chunks.set(key, chunk);
    return chunk;
  }

  getChunk(cx, cz) {
    return this.chunks.get(chunkKey(cx, cz));
  }

  neighborsReady(cx, cz) {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!this.chunks.has(chunkKey(cx + dx, cz + dz))) return false;
      }
    }
    return true;
  }

  // x, y, z deben ser enteros.
  getBlock(x, y, z) {
    if (y < 0) return B.BEDROCK;
    if (y >= CH) return B.AIR;
    const c = this.chunks.get(chunkKey(x >> 4, z >> 4));
    if (!c) return B.AIR;
    return c.data[(y * CS + (z & 15)) * CS + (x & 15)];
  }

  // Cambia un bloque y devuelve los chunks que hay que volver a mallar.
  setBlock(x, y, z, id) {
    if (y < 0 || y >= CH) return null;
    const cx = x >> 4;
    const cz = z >> 4;
    const c = this.getChunk(cx, cz);
    if (!c) return null;
    const lx = x & 15;
    const lz = z & 15;
    const i = (y * CS + lz) * CS + lx;
    if (c.data[i] === id) return null;
    c.data[i] = id;
    let m = this.edits.get(c.key);
    if (!m) this.edits.set(c.key, (m = new Map()));
    m.set(i, id);
    this.editsChanged = true;

    const affected = [c];
    const dxs = [0];
    const dzs = [0];
    if (lx === 0) dxs.push(-1);
    if (lx === CS - 1) dxs.push(1);
    if (lz === 0) dzs.push(-1);
    if (lz === CS - 1) dzs.push(1);
    for (const dx of dxs) {
      for (const dz of dzs) {
        if (!dx && !dz) continue;
        const n = this.getChunk(cx + dx, cz + dz);
        if (n) affected.push(n);
      }
    }
    for (const a of affected) a.dirty = true;
    return affected;
  }

  serializeEdits() {
    const out = {};
    for (const [k, m] of this.edits) out[k] = [...m];
    return out;
  }

  // Busca un punto de aparición en tierra firme cerca del origen.
  findSpawn() {
    for (let d = 0; d < 4000; d += 16) {
      for (const [x, z] of [[d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, -d]]) {
        const h = this.heightAt(x, z);
        if (h > SEA + 1 && h < SNOW_LINE) return { x: x + 0.5, z: z + 0.5 };
      }
    }
    return { x: 0.5, z: 0.5 };
  }
}
