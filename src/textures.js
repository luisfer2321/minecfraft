// Genera por código el atlas de texturas pixeladas (16x16 por casilla).

import { mulberry32 } from './noise.js';
import { T, TEX_TOP, TEX_SIDE } from './blocks.js';

export const TILE = 16;
export const ATLAS_COLS = 16;
export const ATLAS_ROWS = 2;

export function createAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = TILE * ATLAS_COLS;
  canvas.height = TILE * ATLAS_ROWS;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(canvas.width, canvas.height);
  const data = img.data;
  const r = mulberry32(20240607);

  const paint = (tile, fn) => {
    const ox = (tile % ATLAS_COLS) * TILE;
    const oy = Math.floor(tile / ATLAS_COLS) * TILE;
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const c = fn(x, y);
        const i = ((oy + y) * canvas.width + ox + x) * 4;
        data[i] = c[0];
        data[i + 1] = c[1];
        data[i + 2] = c[2];
        data[i + 3] = c.length > 3 ? c[3] : 255;
      }
    }
  };
  const jitter = (c, amount, alpha = 255) => {
    const k = (r() - 0.5) * 2 * amount;
    return [c[0] + k, c[1] + k, c[2] + k, alpha];
  };
  const dirt = () => (r() < 0.12 ? jitter([105, 75, 50], 8) : jitter([134, 96, 67], 14));
  const stone = () => (r() < 0.1 ? jitter([104, 104, 104], 8) : jitter([128, 128, 128], 12));
  const grass = () => (r() < 0.15 ? jitter([84, 140, 48], 10) : jitter([106, 170, 64], 16));
  const snow = () => jitter([238, 244, 250], 7);
  const edge = (min, spread) => Array.from({ length: TILE }, () => min + Math.floor(r() * spread));

  paint(T.DIRT, dirt);
  paint(T.GRASS_TOP, grass);
  const grassEdge = edge(3, 3);
  paint(T.GRASS_SIDE, (x, y) => (y < grassEdge[x] ? grass() : dirt()));
  paint(T.STONE, stone);
  paint(T.SAND, () => (r() < 0.1 ? jitter([200, 188, 140], 8) : jitter([220, 208, 160], 10)));
  paint(T.WATER, (x, y) => {
    const wave = (x + y * 2) % 7 === 0 || (x * 3 + y) % 11 === 0;
    return wave ? jitter([80, 130, 230], 8, 190) : jitter([50, 95, 210], 10, 180);
  });
  paint(T.LOG_SIDE, (x) => (x % 4 === 0 || x % 7 === 3 ? jitter([82, 63, 36], 8) : jitter([108, 84, 50], 10)));
  paint(T.LOG_TOP, (x, y) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (d > 6.5) return jitter([95, 74, 44], 8);
    return Math.floor(d) % 2 ? jitter([176, 140, 88], 8) : jitter([150, 116, 70], 8);
  });
  paint(T.LEAVES, () => (r() < 0.2 ? [0, 0, 0, 0] : r() < 0.25 ? jitter([40, 100, 28], 10) : jitter([62, 140, 42], 18)));
  paint(T.PLANKS, (x, y) => {
    const row = Math.floor(y / 4);
    if (y % 4 === 3) return jitter([118, 92, 54], 6);
    if (x === (row * 5 + 3) % 16) return jitter([128, 100, 60], 6);
    return jitter([166, 133, 82], 10);
  });

  const cells = Array.from({ length: 8 }, () => [r() * 16, r() * 16, (r() - 0.5) * 34]);
  paint(T.COBBLE, (x, y) => {
    let d1 = Infinity, d2 = Infinity, ci = 0;
    cells.forEach(([cx, cy], i) => {
      for (let ox = -16; ox <= 16; ox += 16) {
        for (let oy = -16; oy <= 16; oy += 16) {
          const d = Math.hypot(x + 0.5 - cx - ox, y + 0.5 - cy - oy);
          if (d < d1) { d2 = d1; d1 = d; ci = i; }
          else if (d < d2) d2 = d;
        }
      }
    });
    if (d2 - d1 < 1.2) return jitter([74, 74, 74], 8);
    const v = 122 + cells[ci][2] + (d1 < 2 ? 14 : 0);
    return jitter([v, v, v], 9);
  });

  paint(T.GLASS, (x, y) => {
    if (x === 0 || y === 0 || x === 15 || y === 15) return [214, 236, 244, 255];
    if ((x + y === 7 || x + y === 9) && x > 1 && x < 8) return [255, 255, 255, 255];
    return [0, 0, 0, 0];
  });
  paint(T.BEDROCK, () => (r() < 0.5 ? jitter([46, 46, 46], 12) : jitter([96, 96, 96], 18)));
  paint(T.SNOW, snow);
  const snowEdge = edge(3, 3);
  paint(T.SNOW_SIDE, (x, y) => (y < snowEdge[x] ? snow() : dirt()));
  paint(T.BRICK, (x, y) => {
    const row = Math.floor(y / 4);
    if (y % 4 === 3 || (x + (row % 2) * 4) % 8 === 0) return jitter([176, 168, 158], 8);
    return jitter([152, 64, 46], 14);
  });

  const ore = (tile, color) => {
    const spots = Array.from({ length: 5 }, () => [1 + r() * 14, 1 + r() * 14]);
    paint(tile, (x, y) => {
      const near = spots.some(([sx, sy]) => Math.hypot(x - sx, y - sy) < 1.6);
      return near ? jitter(color, 12) : stone();
    });
  };
  ore(T.COAL_ORE, [34, 34, 34]);
  ore(T.IRON_ORE, [214, 172, 132]);

  ctx.putImageData(img, 0, 0);
  return canvas;
}

// Dibuja un icono isométrico del bloque para la barra rápida e inventario.
export function drawBlockIcon(atlas, id, size = 48) {
  const c = document.createElement('canvas');
  c.width = c.height = 48;
  c.style.width = c.style.height = `${size}px`;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const face = (tile, m, shade) => {
    g.setTransform(...m);
    const sx = (tile % ATLAS_COLS) * TILE;
    const sy = Math.floor(tile / ATLAS_COLS) * TILE;
    g.drawImage(atlas, sx, sy, TILE, TILE, 0, 0, TILE, TILE);
    if (shade) {
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = `rgba(0,0,0,${shade})`;
      g.fillRect(0, 0, TILE, TILE);
      g.globalCompositeOperation = 'source-over';
    }
  };
  face(TEX_SIDE[id], [1.25, 0.625, 0, 1.5, 4, 12], 0.25);
  face(TEX_SIDE[id], [1.25, -0.625, 0, 1.5, 24, 22], 0.42);
  face(TEX_TOP[id], [1.25, -0.625, 1.25, 0.625, 4, 12], 0);
  return c;
}
