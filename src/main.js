import * as THREE from 'three';
import { B, BLOCKS, KIND, KIND_LIQUID, SOLID, PLACEABLE } from './blocks.js';
import { createAtlas, drawBlockIcon } from './textures.js';
import { World, CS, CH } from './world.js';
import { buildChunkMesh } from './mesher.js';
import { Player, EYE_HEIGHT } from './player.js';

const SAVE_KEY = 'minecfraft-save-v1';
const DAY_LENGTH = 600; // segundos por día completo
const REACH = 6;

const $ = (id) => document.getElementById(id);

// ---------- Partida guardada ----------
function loadSave() {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY)) || null;
  } catch {
    return null;
  }
}
const save = loadSave();
const seed = save?.seed ?? Math.floor(Math.random() * 2 ** 31);
const world = new World(seed, save?.edits);
const player = new Player(world);
let needsSpawn = true;
if (save?.player) {
  const s = save.player;
  player.pos.set(s.x, s.y, s.z);
  player.yaw = s.yaw;
  player.pitch = s.pitch;
  player.flying = !!s.flying;
  needsSpawn = false;
} else {
  const sp = world.findSpawn();
  player.pos.set(sp.x, CH, sp.z);
}
let time = save?.time ?? 0.08;
const hotbar = save?.hotbar ?? [B.GRASS, B.DIRT, B.STONE, B.COBBLE, B.PLANKS, B.LOG, B.GLASS, B.BRICK, B.SAND];
let selected = save?.selected ?? 0;
let renderDist = save?.renderDist ?? 6;

function writeSave() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      seed,
      edits: world.serializeEdits(),
      player: needsSpawn ? null : {
        x: player.pos.x, y: player.pos.y, z: player.pos.z,
        yaw: player.yaw, pitch: player.pitch, flying: player.flying,
      },
      time, hotbar, selected, renderDist,
    }));
  } catch {
    // almacenamiento no disponible: se juega sin guardar
  }
}

// ---------- Renderizado ----------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const skyColor = new THREE.Color(0x87b8ff);
scene.background = skyColor;
scene.fog = new THREE.Fog(skyColor.clone(), 40, 90);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 1000);
camera.rotation.order = 'YXZ';

const atlas = createAtlas();
const atlasTex = new THREE.CanvasTexture(atlas);
atlasTex.magFilter = THREE.NearestFilter;
atlasTex.minFilter = THREE.NearestFilter;
atlasTex.generateMipmaps = false;
atlasTex.colorSpace = THREE.SRGBColorSpace;

const solidMat = new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true, alphaTest: 0.5 });
const waterMat = new THREE.MeshBasicMaterial({
  map: atlasTex, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide,
});

// Cielo: sol, luna, estrellas y nubes.
const sun = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ color: 0xfff3b0, fog: false }));
const moon = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: 0xdfe6f5, fog: false }));
scene.add(sun, moon);

const starGeo = new THREE.BufferGeometry();
{
  const pts = [];
  for (let i = 0; i < 900; i++) {
    const u = Math.random() * 2 - 1;
    const a = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    pts.push(Math.cos(a) * s * 450, u * 450, Math.sin(a) * s * 450);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
}
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
  color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false,
}));
scene.add(stars);

const CLOUD_SIZE = 1400;
const CLOUD_REPEAT = 6;
function makeCloudTextures() {
  const N = 32;
  let v = Array.from({ length: N * N }, () => Math.random());
  for (let pass = 0; pass < 3; pass++) {
    const nv = new Array(N * N);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        let s = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) s += v[((y + dy + N) % N) * N + ((x + dx + N) % N)];
        }
        nv[y * N + x] = s / 9;
      }
    }
    v = nv;
  }
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const img = g.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255;
    img.data[i * 4 + 3] = v[i] > 0.53 ? 220 : 0;
  }
  g.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(c);
  map.magFilter = map.minFilter = THREE.NearestFilter;
  map.generateMipmaps = false;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(CLOUD_REPEAT, CLOUD_REPEAT);

  const f = document.createElement('canvas');
  f.width = f.height = 128;
  const fg = f.getContext('2d');
  const grad = fg.createRadialGradient(64, 64, 10, 64, 64, 64);
  grad.addColorStop(0, '#fff');
  grad.addColorStop(1, '#000');
  fg.fillStyle = grad;
  fg.fillRect(0, 0, 128, 128);
  const alphaMap = new THREE.CanvasTexture(f);
  return { map, alphaMap };
}
const cloudTex = makeCloudTextures();
const clouds = new THREE.Mesh(
  new THREE.PlaneGeometry(CLOUD_SIZE, CLOUD_SIZE),
  new THREE.MeshBasicMaterial({
    map: cloudTex.map, alphaMap: cloudTex.alphaMap, transparent: true, opacity: 0.85,
    fog: false, depthWrite: false, side: THREE.DoubleSide,
  }),
);
clouds.rotation.x = -Math.PI / 2;
scene.add(clouds);

// Contorno del bloque apuntado.
const highlight = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
  new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 }),
);
highlight.visible = false;
scene.add(highlight);

// ---------- Chunks ----------
let offsets = [];
function computeOffsets() {
  offsets = [];
  const R = renderDist + 2;
  for (let dz = -R; dz <= R; dz++) {
    for (let dx = -R; dx <= R; dx++) {
      const d = Math.hypot(dx, dz);
      if (d <= R) offsets.push([dx, dz, d]);
    }
  }
  offsets.sort((a, b) => a[2] - b[2]);
  scene.fog.far = renderDist * CS;
  scene.fog.near = renderDist * CS * 0.55;
}
computeOffsets();

function makeMesh(d, mat, chunk) {
  if (d.idx.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(d.pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(d.uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(d.col, 3));
  g.setIndex(new THREE.BufferAttribute(d.idx, 1));
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat);
  m.position.set(chunk.cx * CS, 0, chunk.cz * CS);
  m.matrixAutoUpdate = false;
  m.updateMatrix();
  scene.add(m);
  return m;
}

function disposeMeshes(c) {
  for (const k of ['solidMesh', 'waterMesh']) {
    if (c[k]) {
      scene.remove(c[k]);
      c[k].geometry.dispose();
      c[k] = null;
    }
  }
}

function remesh(c) {
  const m = buildChunkMesh(world, c);
  disposeMeshes(c);
  c.solidMesh = makeMesh(m.solid, solidMat, c);
  c.waterMesh = makeMesh(m.water, waterMat, c);
  c.dirty = false;
  c.meshed = true;
}

let frameCount = 0;
function updateChunks() {
  const pcx = Math.floor(player.pos.x / CS);
  const pcz = Math.floor(player.pos.z / CS);
  const start = performance.now();
  const budget = 8;

  let work = 0;
  for (const [dx, dz] of offsets) {
    if (world.getChunk(pcx + dx, pcz + dz)) continue;
    if (work > 0 && performance.now() - start > budget) break;
    world.generateChunk(pcx + dx, pcz + dz);
    work++;
  }

  work = 0;
  for (const [dx, dz, d] of offsets) {
    if (d > renderDist) break;
    const c = world.getChunk(pcx + dx, pcz + dz);
    if (!c || !c.dirty || !world.neighborsReady(c.cx, c.cz)) continue;
    if (work > 0 && performance.now() - start > budget * 1.5) break;
    remesh(c);
    work++;
  }

  if (++frameCount % 60 === 0) {
    const limit = renderDist + 3;
    for (const [k, c] of world.chunks) {
      if (Math.hypot(c.cx - pcx, c.cz - pcz) > limit) {
        disposeMeshes(c);
        world.chunks.delete(k);
      }
    }
  }
}

// ---------- Interacción con bloques ----------
function raycast(origin, dir, maxDist) {
  let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
  const sx = Math.sign(dir.x), sy = Math.sign(dir.y), sz = Math.sign(dir.z);
  const tdx = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
  const tdy = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
  const tdz = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;
  let tmx = sx > 0 ? (x + 1 - origin.x) * tdx : sx < 0 ? (origin.x - x) * tdx : Infinity;
  let tmy = sy > 0 ? (y + 1 - origin.y) * tdy : sy < 0 ? (origin.y - y) * tdy : Infinity;
  let tmz = sz > 0 ? (z + 1 - origin.z) * tdz : sz < 0 ? (origin.z - z) * tdz : Infinity;
  let nx = 0, ny = 0, nz = 0, t = 0;
  while (t <= maxDist) {
    const id = world.getBlock(x, y, z);
    if (id !== B.AIR && KIND[id] !== KIND_LIQUID) return { x, y, z, nx, ny, nz, id };
    if (tmx < tmy && tmx < tmz) {
      x += sx; t = tmx; tmx += tdx; nx = -sx; ny = 0; nz = 0;
    } else if (tmy < tmz) {
      y += sy; t = tmy; tmy += tdy; nx = 0; ny = -sy; nz = 0;
    } else {
      z += sz; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -sz;
    }
  }
  return null;
}

let target = null;

function applyEdit(x, y, z, id) {
  const affected = world.setBlock(x, y, z, id);
  if (!affected) return;
  for (const c of affected) if (world.neighborsReady(c.cx, c.cz)) remesh(c);
}

function breakBlock() {
  if (!target || target.y <= 0) return;
  applyEdit(target.x, target.y, target.z, B.AIR);
}

function placeBlock() {
  if (!target) return;
  const x = target.x + target.nx, y = target.y + target.ny, z = target.z + target.nz;
  const id = hotbar[selected];
  if (y < 0 || y >= CH) return;
  const existing = world.getBlock(x, y, z);
  if (existing !== B.AIR && KIND[existing] !== KIND_LIQUID) return;
  if (SOLID[id] && player.intersectsBlock(x, y, z)) return;
  applyEdit(x, y, z, id);
}

function pickBlock() {
  if (!target) return;
  const i = hotbar.indexOf(target.id);
  if (i >= 0) selectSlot(i);
  else {
    hotbar[selected] = target.id;
    renderHotbar();
    showBlockName();
  }
}

// ---------- Interfaz ----------
const hotbarEl = $('hotbar');
function renderHotbar() {
  hotbarEl.replaceChildren();
  hotbar.forEach((id, i) => {
    const slot = document.createElement('div');
    slot.className = 'slot' + (i === selected ? ' selected' : '');
    slot.appendChild(drawBlockIcon(atlas, id, 40));
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = i + 1;
    slot.appendChild(num);
    slot.addEventListener('click', () => selectSlot(i));
    hotbarEl.appendChild(slot);
  });
}

let nameTimer = 0;
function showBlockName() {
  const el = $('blockname');
  el.textContent = BLOCKS[hotbar[selected]].name;
  el.style.opacity = 1;
  clearTimeout(nameTimer);
  nameTimer = setTimeout(() => (el.style.opacity = 0), 1500);
}

function selectSlot(i) {
  selected = (i + hotbar.length) % hotbar.length;
  renderHotbar();
  showBlockName();
}

const invGrid = $('invgrid');
for (const id of PLACEABLE) {
  const cell = document.createElement('button');
  cell.className = 'invcell';
  cell.title = BLOCKS[id].name;
  cell.appendChild(drawBlockIcon(atlas, id, 40));
  cell.addEventListener('click', () => {
    hotbar[selected] = id;
    renderHotbar();
    showBlockName();
  });
  invGrid.appendChild(cell);
}

let locked = false;
let inventoryOpen = false;
const keys = new Set();
const mouse = { left: false, right: false, timer: 0 };

function lockPointer() {
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => showMenu());
  } catch {
    showMenu();
  }
}

function showMenu() {
  $('menu').classList.remove('hidden');
}

function openInventory() {
  inventoryOpen = true;
  $('inventory').classList.remove('hidden');
  document.exitPointerLock();
}

function closeInventory(resume) {
  inventoryOpen = false;
  $('inventory').classList.add('hidden');
  if (resume) lockPointer();
  else showMenu();
}

$('play').addEventListener('click', () => {
  $('menu').classList.add('hidden');
  lockPointer();
});
$('newworld').addEventListener('click', () => {
  if (!confirm('¿Crear un mundo nuevo? Se perderá el mundo actual.')) return;
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // nada que borrar
  }
  window.removeEventListener('beforeunload', writeSave);
  location.reload();
});
const rdInput = $('rd');
rdInput.value = renderDist;
$('rdval').textContent = renderDist;
rdInput.addEventListener('input', () => {
  renderDist = Number(rdInput.value);
  $('rdval').textContent = renderDist;
  computeOffsets();
});
$('seed').textContent = seed;

canvas.addEventListener('click', () => {
  if (!locked && !inventoryOpen && $('menu').classList.contains('hidden')) lockPointer();
});

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (!locked) {
    keys.clear();
    mouse.left = mouse.right = false;
    if (!inventoryOpen) showMenu();
    writeSave();
  }
});

document.addEventListener('mousemove', (e) => {
  if (!locked) return;
  const sens = 0.0022;
  player.yaw -= e.movementX * sens;
  player.pitch -= e.movementY * sens;
  player.pitch = Math.max(-Math.PI / 2 + 0.001, Math.min(Math.PI / 2 - 0.001, player.pitch));
});

document.addEventListener('mousedown', (e) => {
  if (!locked) return;
  if (e.button === 0) { mouse.left = true; mouse.timer = 0.25; breakBlock(); }
  else if (e.button === 2) { mouse.right = true; mouse.timer = 0.25; placeBlock(); }
  else if (e.button === 1) { e.preventDefault(); pickBlock(); }
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouse.left = false;
  if (e.button === 2) mouse.right = false;
});
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('wheel', (e) => {
  if (locked) selectSlot(selected + Math.sign(e.deltaY));
}, { passive: true });

let showDebug = false;
document.addEventListener('keydown', (e) => {
  if (e.code === 'F3') {
    e.preventDefault();
    showDebug = !showDebug;
    $('debug').style.display = showDebug ? 'block' : 'none';
    return;
  }
  if (inventoryOpen) {
    if (e.code === 'KeyE') closeInventory(true);
    else if (e.code === 'Escape') closeInventory(false);
    return;
  }
  if (!locked) return;
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  keys.add(e.code);
  if (e.code.startsWith('Digit')) {
    const n = Number(e.code.slice(5));
    if (n >= 1 && n <= 9) selectSlot(n - 1);
  } else if (e.code === 'KeyF') {
    player.flying = !player.flying;
    player.vel.set(0, 0, 0);
  } else if (e.code === 'KeyE') {
    openInventory();
  }
});
document.addEventListener('keyup', (e) => keys.delete(e.code));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('beforeunload', writeSave);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) writeSave();
});
setInterval(() => {
  if (locked) writeSave();
}, 10000);

// ---------- Día y noche ----------
const DAY_SKY = new THREE.Color(0x87b8ff);
const NIGHT_SKY = new THREE.Color(0x0a0f26);
const SUNSET_SKY = new THREE.Color(0xf29a5f);
const WATER_FOG = new THREE.Color(0x1d4a9e);
const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const sunDir = new THREE.Vector3();

function updateSky(underwater) {
  const a = time * Math.PI * 2;
  const h = Math.sin(a);
  const day = smoothstep(-0.2, 0.25, h);
  skyColor.copy(NIGHT_SKY).lerp(DAY_SKY, day);
  skyColor.lerp(SUNSET_SKY, Math.max(0, 1 - Math.abs(h) / 0.3) * 0.45);
  const light = 0.22 + 0.78 * day;
  solidMat.color.setScalar(light);
  waterMat.color.setScalar(light);

  if (underwater) {
    scene.fog.color.copy(WATER_FOG).multiplyScalar(light);
    scene.fog.near = 0.1;
    scene.fog.far = 22;
  } else {
    scene.fog.color.copy(skyColor);
    scene.fog.near = renderDist * CS * 0.55;
    scene.fog.far = renderDist * CS;
  }

  sunDir.set(Math.cos(a), h, 0.3).normalize();
  sun.position.copy(camera.position).addScaledVector(sunDir, 400);
  sun.lookAt(camera.position);
  moon.position.copy(camera.position).addScaledVector(sunDir, -400);
  moon.lookAt(camera.position);
  stars.position.copy(camera.position);
  stars.material.opacity = 1 - day;

  clouds.position.set(camera.position.x, 110, camera.position.z);
  const tile = CLOUD_SIZE / CLOUD_REPEAT;
  cloudTex.map.offset.set((camera.position.x + time * DAY_LENGTH * 1.5) / tile, -camera.position.z / tile);
  clouds.material.color.setScalar(0.3 + 0.7 * day);
}

// ---------- Bucle principal ----------
const input = { forward: false, back: false, left: false, right: false, jump: false, down: false, sprint: false };
const lookDir = new THREE.Vector3();
let last = performance.now();
let fps = 0, fpsFrames = 0, fpsTime = 0;
let loadingDone = false;

function readInput() {
  input.forward = keys.has('KeyW') || keys.has('ArrowUp');
  input.back = keys.has('KeyS') || keys.has('ArrowDown');
  input.left = keys.has('KeyA') || keys.has('ArrowLeft');
  input.right = keys.has('KeyD') || keys.has('ArrowRight');
  input.jump = keys.has('Space');
  const shift = keys.has('ShiftLeft') || keys.has('ShiftRight');
  input.down = shift;
  // Shift corre al caminar y baja al volar; Ctrl corre siempre.
  input.sprint = keys.has('ControlLeft') || (shift && !player.flying);
}

function trySpawn() {
  const x = Math.floor(player.pos.x), z = Math.floor(player.pos.z);
  if (!world.getChunk(x >> 4, z >> 4)) return;
  for (let y = CH - 1; y > 0; y--) {
    if (SOLID[world.getBlock(x, y, z)]) {
      player.pos.y = y + 1;
      break;
    }
  }
  needsSpawn = false;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  updateChunks();
  if (needsSpawn) trySpawn();

  const pc = world.getChunk(Math.floor(player.pos.x) >> 4, Math.floor(player.pos.z) >> 4);
  const ready = !needsSpawn && pc && pc.meshed;
  if (!loadingDone && ready) {
    loadingDone = true;
    $('loading').textContent = 'Mundo listo';
  }

  if (locked && ready) {
    time = (time + dt / DAY_LENGTH) % 1;
    readInput();
    player.update(dt, input);
    if (player.pos.y < -30) {
      needsSpawn = true;
      player.vel.set(0, 0, 0);
    }
    if (mouse.left || mouse.right) {
      mouse.timer -= dt;
      if (mouse.timer <= 0) {
        mouse.timer = 0.2;
        if (mouse.left) breakBlock();
        else placeBlock();
      }
    }
  }

  camera.position.set(player.pos.x, player.pos.y + EYE_HEIGHT, player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, 0);

  camera.getWorldDirection(lookDir);
  target = ready ? raycast(camera.position, lookDir, REACH) : null;
  highlight.visible = !!target;
  if (target) highlight.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);

  const eyeBlock = world.getBlock(Math.floor(camera.position.x), Math.floor(camera.position.y), Math.floor(camera.position.z));
  const underwater = KIND[eyeBlock] === KIND_LIQUID;
  $('water-overlay').style.display = underwater ? 'block' : 'none';
  updateSky(underwater);

  renderer.render(scene, camera);

  fpsFrames++;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    fps = Math.round(fpsFrames / fpsTime);
    fpsFrames = 0;
    fpsTime = 0;
    if (showDebug) {
      const p = player.pos;
      const hours = Math.floor(((time * 24 + 6) % 24));
      $('debug').textContent = [
        `Minecfraft  ${fps} FPS`,
        `XYZ: ${p.x.toFixed(2)} / ${p.y.toFixed(2)} / ${p.z.toFixed(2)}`,
        `Chunk: ${Math.floor(p.x / CS)}, ${Math.floor(p.z / CS)}  (cargados: ${world.chunks.size})`,
        `Mirando: ${target ? `${BLOCKS[target.id].name} (${target.x}, ${target.y}, ${target.z})` : '-'}`,
        `Hora: ${String(hours).padStart(2, '0')}:00  Vuelo: ${player.flying ? 'sí' : 'no'}`,
        `Semilla: ${seed}`,
      ].join('\n');
    }
  }
}

renderHotbar();
requestAnimationFrame(frame);

// Para pruebas automatizadas y depuración desde la consola.
window.minecfraft = { world, player, camera, get target() { return target; }, applyEdit, selectSlot };
