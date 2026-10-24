// Convierte los datos de un chunk en geometría: sólo las caras visibles,
// con sombreado por cara y oclusión ambiental por vértice.

import { CS, CH } from './world.js';
import { ATLAS_COLS, ATLAS_ROWS } from './textures.js';
import {
  B, KIND, OCCLUDES, TEX_TOP, TEX_SIDE, TEX_BOTTOM,
  KIND_AIR, KIND_OPAQUE, KIND_LIQUID,
} from './blocks.js';

const FACES = [
  { dir: [-1, 0, 0], shade: 0.6, corners: [[0, 1, 0, 0, 1], [0, 0, 0, 0, 0], [0, 1, 1, 1, 1], [0, 0, 1, 1, 0]] },
  { dir: [1, 0, 0], shade: 0.6, corners: [[1, 1, 1, 0, 1], [1, 0, 1, 0, 0], [1, 1, 0, 1, 1], [1, 0, 0, 1, 0]] },
  { dir: [0, -1, 0], shade: 0.4, corners: [[1, 0, 1, 1, 0], [0, 0, 1, 0, 0], [1, 0, 0, 1, 1], [0, 0, 0, 0, 1]] },
  { dir: [0, 1, 0], shade: 1.0, corners: [[0, 1, 1, 1, 1], [1, 1, 1, 0, 1], [0, 1, 0, 1, 0], [1, 1, 0, 0, 0]] },
  { dir: [0, 0, -1], shade: 0.75, corners: [[1, 0, 0, 0, 0], [0, 0, 0, 1, 0], [1, 1, 0, 0, 1], [0, 1, 0, 1, 1]] },
  { dir: [0, 0, 1], shade: 0.75, corners: [[0, 0, 1, 0, 0], [1, 0, 1, 1, 0], [0, 1, 1, 0, 1], [1, 1, 1, 1, 1]] },
];

// Para cada esquina, los tres vecinos que oscurecen el vértice.
for (const f of FACES) {
  const axis = f.dir.findIndex((v) => v !== 0);
  const [u, v] = [0, 1, 2].filter((a) => a !== axis);
  f.ao = f.corners.map((c) => {
    const s1 = [...f.dir];
    const s2 = [...f.dir];
    s1[u] += c[u] ? 1 : -1;
    s2[v] += c[v] ? 1 : -1;
    const k = [...s1];
    k[v] += c[v] ? 1 : -1;
    return [s1, s2, k];
  });
}

const AO_CURVE = [0.32, 0.52, 0.75, 1];
const EPS = 0.002;
const PW = CS + 2;
const pad = new Uint8Array(PW * PW * CH);

function get(x, y, z) {
  if (y < 0) return B.BEDROCK;
  if (y >= CH) return B.AIR;
  return pad[(y * PW + z) * PW + x];
}

function createBuffers() {
  return { pos: [], uv: [], col: [], idx: [] };
}

function finish(b) {
  return {
    pos: new Float32Array(b.pos),
    uv: new Float32Array(b.uv),
    col: new Float32Array(b.col),
    idx: new Uint32Array(b.idx),
  };
}

export function buildChunkMesh(world, chunk) {
  // Copia el chunk y un borde de 1 bloque de sus 8 vecinos.
  const nb = [];
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      nb.push(world.getChunk(chunk.cx + dx, chunk.cz + dz)?.data ?? null);
    }
  }
  for (let pz = 0; pz < PW; pz++) {
    const lz = pz - 1;
    const oz = lz < 0 ? 0 : lz >= CS ? 2 : 1;
    const sz = (lz + CS) % CS;
    for (let px = 0; px < PW; px++) {
      const lx = px - 1;
      const ox = lx < 0 ? 0 : lx >= CS ? 2 : 1;
      const sx = (lx + CS) % CS;
      const src = nb[oz * 3 + ox];
      for (let y = 0; y < CH; y++) {
        pad[(y * PW + pz) * PW + px] = src ? src[(y * CS + sz) * CS + sx] : 0;
      }
    }
  }

  const solid = createBuffers();
  const water = createBuffers();
  const ao = [0, 0, 0, 0];

  for (let y = 0; y < CH; y++) {
    for (let z = 1; z <= CS; z++) {
      for (let x = 1; x <= CS; x++) {
        const id = pad[(y * PW + z) * PW + x];
        if (id === B.AIR) continue;
        const kind = KIND[id];
        const liquid = kind === KIND_LIQUID;
        const lowerTop = liquid && get(x, y + 1, z) !== B.WATER;

        for (const f of FACES) {
          const nid = get(x + f.dir[0], y + f.dir[1], z + f.dir[2]);
          const nk = KIND[nid];
          let visible;
          if (nk === KIND_AIR) visible = true;
          else if (nk === KIND_OPAQUE) visible = false;
          else if (nk === KIND_LIQUID) visible = !liquid;
          else visible = !(nid === id && id === B.GLASS);
          if (!visible) continue;

          const buf = liquid ? water : solid;
          const tile = f.dir[1] === 1 ? TEX_TOP[id] : f.dir[1] === -1 ? TEX_BOTTOM[id] : TEX_SIDE[id];
          const tu = tile % ATLAS_COLS;
          const tv = Math.floor(tile / ATLAS_COLS);

          for (let c = 0; c < 4; c++) {
            if (liquid) {
              ao[c] = 3;
              continue;
            }
            const [s1, s2, k] = f.ao[c];
            const a = OCCLUDES[get(x + s1[0], y + s1[1], z + s1[2])];
            const b = OCCLUDES[get(x + s2[0], y + s2[1], z + s2[2])];
            const d = OCCLUDES[get(x + k[0], y + k[1], z + k[2])];
            ao[c] = a && b ? 0 : 3 - (a + b + d);
          }

          const base = buf.pos.length / 3;
          for (let c = 0; c < 4; c++) {
            const [cx, cy, cz, u, v] = f.corners[c];
            const top = cy === 1 && lowerTop ? 0.875 : cy;
            buf.pos.push(x - 1 + cx, y + top, z - 1 + cz);
            buf.uv.push(
              (tu + EPS + u * (1 - 2 * EPS)) / ATLAS_COLS,
              1 - (tv + EPS + (1 - v) * (1 - 2 * EPS)) / ATLAS_ROWS,
            );
            const l = f.shade * AO_CURVE[ao[c]];
            buf.col.push(l, l, l);
          }
          // Gira la diagonal del quad para que la oclusión no se vea "rota".
          if (AO_CURVE[ao[0]] + AO_CURVE[ao[3]] > AO_CURVE[ao[1]] + AO_CURVE[ao[2]]) {
            buf.idx.push(base, base + 1, base + 3, base, base + 3, base + 2);
          } else {
            buf.idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
          }
        }
      }
    }
  }

  return { solid: finish(solid), water: finish(water) };
}
