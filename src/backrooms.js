import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// ============================================================================
// THE BACKROOMS — Level 0
// Infinite, procedurally generated mono-yellow office space.
//
// How the "infinite" works:
//  - The world is a grid of 4-unit cells grouped into 40x40-unit chunks.
//  - Each chunk's wall layout is a pure function of its coordinates (seeded
//    hash -> RNG), so any chunk can be (re)generated at any time and will
//    always look identical. Nothing is persisted; the map is effectively
//    endless while memory stays flat.
//  - Only chunks near the player exist as meshes. Walk away and they are
//    disposed; walk back and they are rebuilt exactly the same.
//  - Every 5th row/column of cells is guaranteed open corridor, so the
//    random partition walls can never seal the player in.
// ============================================================================

const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 800;

// ---------- World constants ----------
const CELL = 4;                       // world units per grid cell
const CHUNK_CELLS = 10;               // cells per chunk side
const CHUNK_SIZE = CELL * CHUNK_CELLS; // 40 units
const WALL_HEIGHT = 3;                // low ceilings for that claustrophobic feel
const EYE_HEIGHT = 1.7;
const LOAD_RADIUS = 2;                // keep a 5x5 grid of chunks around the player
const UNLOAD_RADIUS = 3;              // dispose chunks beyond this
const PLAYER_RADIUS = 0.45;

// ---------- Scene ----------
const scene = new THREE.Scene();
const FOG_COLOR = 0x2b2514;
scene.background = new THREE.Color(FOG_COLOR);
scene.fog = new THREE.Fog(FOG_COLOR, 8, 50);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(CELL / 2, EYE_HEIGHT, CELL / 2); // spawn in a guaranteed-open corridor cell

let cameraYaw = 0;
let cameraPitch = 0;

const renderer = new THREE.WebGLRenderer({
  antialias: false,
  powerPreference: 'high-performance'
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
document.body.appendChild(renderer.domElement);

// ---------- Lighting: flat, sourceless, fluorescent ----------
const ambientLight = new THREE.AmbientLight(0xfff3c4, 0.75);
scene.add(ambientLight);
const hemiLight = new THREE.HemisphereLight(0xfff6d0, 0x5a5138, 0.9);
scene.add(hemiLight);

// ---------- Procedural canvas textures (no image assets needed) ----------
function makeTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Mono-yellow wallpaper with faint vertical striping and grime
const wallTexture = makeTexture(256, (ctx, s) => {
  ctx.fillStyle = '#cbb964';
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  for (let x = 0; x < s; x += 16) ctx.fillRect(x, 0, 6, s);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,250,220'},${Math.random() * 0.06})`;
    ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
  }
  // grime gathering at the bottom of the wall
  const grad = ctx.createLinearGradient(0, s * 0.7, 0, s);
  grad.addColorStop(0, 'rgba(60,50,20,0)');
  grad.addColorStop(1, 'rgba(60,50,20,0.25)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, s, s);
});

// Old moist carpet
const carpetTexture = makeTexture(256, (ctx, s) => {
  ctx.fillStyle = '#a3924e';
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 6000; i++) {
    ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '40,34,12' : '200,185,110'},${Math.random() * 0.14})`;
    ctx.fillRect(Math.random() * s, Math.random() * s, 1.5, 1.5);
  }
  // damp stains
  for (let i = 0; i < 5; i++) {
    const x = Math.random() * s, y = Math.random() * s, r = 15 + Math.random() * 35;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(50,42,15,0.18)');
    g.addColorStop(1, 'rgba(50,42,15,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
});
carpetTexture.repeat.set(CHUNK_CELLS, CHUNK_CELLS);

// Ceiling tiles are placed per cell so light fixtures can be sparse and
// irregular. Two variants: a plain acoustic tile and one with a recessed
// rectangular fluorescent fixture built into it.
function drawCeilingBase(ctx, s) {
  ctx.fillStyle = '#d8d2a4';
  ctx.fillRect(0, 0, s, s);
  for (let k = 0; k < 900; k++) {
    ctx.fillStyle = `rgba(90,82,50,${Math.random() * 0.15})`;
    ctx.fillRect(Math.random() * s, Math.random() * s, 1.5, 1.5);
  }
  ctx.strokeStyle = '#8a8258';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, s - 4, s - 4);
}

const ceilingPlainTexture = makeTexture(128, drawCeilingBase);

const ceilingLightTexture = makeTexture(128, (ctx, s) => {
  drawCeilingBase(ctx, s);
  // recessed rectangular office light fixture
  const inset = 26;
  ctx.fillStyle = '#6e6640';
  ctx.fillRect(inset - 4, inset - 4, s - (inset - 4) * 2, s - (inset - 4) * 2); // frame shadow
  const g = ctx.createRadialGradient(s / 2, s / 2, 6, s / 2, s / 2, s / 2 - inset + 14);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.7, '#fffbe0');
  g.addColorStop(1, '#efe4ac');
  ctx.fillStyle = g;
  ctx.fillRect(inset, inset, s - inset * 2, s - inset * 2);
  // diffuser ribs
  ctx.strokeStyle = 'rgba(200,190,140,0.5)';
  ctx.lineWidth = 2;
  for (let x = inset + 8; x < s - inset; x += 12) {
    ctx.beginPath();
    ctx.moveTo(x, inset);
    ctx.lineTo(x, s - inset);
    ctx.stroke();
  }
});

// ---------- Shared geometry & materials (one of each, reused by all chunks) ----------
// Baked brightness rides in as instance colors (walls, ceiling tiles) and
// vertex colors (floor), all of which multiply the material color.
const wallMaterial = new THREE.MeshLambertMaterial({ map: wallTexture });
const floorMaterial = new THREE.MeshLambertMaterial({ map: carpetTexture, vertexColors: true });
const ceilingPlainMaterial = new THREE.MeshLambertMaterial({ map: ceilingPlainTexture });
const ceilingLightMaterial = new THREE.MeshLambertMaterial({
  map: ceilingLightTexture,
  emissive: 0xfff8d8,
  emissiveMap: ceilingLightTexture,
  emissiveIntensity: 0.9
});
const wallGeometry = new THREE.BoxGeometry(CELL, WALL_HEIGHT, CELL);
// per-cell ceiling tile, pre-rotated to face down so instances are pure translations
const ceilingTileGeometry = new THREE.PlaneGeometry(CELL, CELL);
ceilingTileGeometry.rotateX(Math.PI / 2);
// floor plane subdivided per cell so brightness can vary smoothly across it
const floorGeometryTemplate = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, CHUNK_CELLS, CHUNK_CELLS);

// ---------- Deterministic layout generation ----------
// 2D integer hash -> 32-bit seed
function hash2(x, z) {
  let h = Math.imul(x, 374761393) + Math.imul(z, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

// Small fast seeded PRNG
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mod = (n, m) => ((n % m) + m) % m;

// The map is carved into 4x4-cell "blocks" separated by guaranteed-open
// corridor lanes (every cell where gx%5==0 or gz%5==0 is always walkable).
// Each block rolls a zone type, so the world is mostly narrow hallways
// (solid blocks turn the lanes into corridors) with denser maze pockets,
// the occasional sparse-partition room, and some wide open areas.
function fillBlock(layout, localOx, localOz, rng) {
  const zone = rng();

  if (zone < 0.40) {
    // SOLID: the whole block is wall — the lanes around it become hallways
    for (let dx = 0; dx < 4; dx++) {
      for (let dz = 0; dz < 4; dz++) {
        layout[(localOz + dz) * CHUNK_CELLS + localOx + dx] = 1;
      }
    }
    return;
  }

  if (zone < 0.62) {
    // MAZE: dense random fill — nooks, alcoves and short dead ends
    for (let dx = 0; dx < 4; dx++) {
      for (let dz = 0; dz < 4; dz++) {
        if (rng() < 0.5) layout[(localOz + dz) * CHUNK_CELLS + localOx + dx] = 1;
      }
    }
    return;
  }

  if (zone < 0.78) {
    // SPARSE: a couple of partition walls, like a half-hearted office
    const segmentCount = 1 + Math.floor(rng() * 2);
    for (let sIdx = 0; sIdx < segmentCount; sIdx++) {
      const horizontal = rng() < 0.5;
      const length = 2 + Math.floor(rng() * 3); // 2-4 cells
      const startX = Math.floor(rng() * 4);
      const startZ = Math.floor(rng() * 4);
      for (let k = 0; k < length; k++) {
        const lx = localOx + (horizontal ? Math.min(startX + k, 3) : startX);
        const lz = localOz + (horizontal ? startZ : Math.min(startZ + k, 3));
        layout[lz * CHUNK_CELLS + lx] = 1;
      }
    }
    if (rng() < 0.25) {
      layout[(localOz + Math.floor(rng() * 4)) * CHUNK_CELLS + localOx + Math.floor(rng() * 4)] = 1;
    }
    return;
  }

  // OPEN: nothing — adjacent open blocks merge into wide empty halls
}

// Layouts are tiny (100 bytes each) so the cache can just grow — even hours
// of walking costs a few hundred KB. Meshes are what get unloaded, not this.
const layoutCache = new Map();

function chunkLayout(cx, cz) {
  const key = cx + ',' + cz;
  let layout = layoutCache.get(key);
  if (layout) return layout;
  layout = new Uint8Array(CHUNK_CELLS * CHUNK_CELLS);
  // A chunk (10x10 cells) contains a 2x2 arrangement of blocks. Block coords
  // are global so a block generates identically regardless of chunk handling.
  for (let bi = 0; bi < 2; bi++) {
    for (let bj = 0; bj < 2; bj++) {
      const rng = mulberry32(hash2(cx * 2 + bi, cz * 2 + bj));
      fillBlock(layout, bi * 5 + 1, bj * 5 + 1, rng);
    }
  }
  layoutCache.set(key, layout);
  return layout;
}

// Is the cell at global grid coords (gx, gz) a solid wall?
function isSolidCell(gx, gz) {
  if (mod(gx, 5) === 0 || mod(gz, 5) === 0) return false; // corridor lanes
  const cx = Math.floor(gx / CHUNK_CELLS);
  const cz = Math.floor(gz / CHUNK_CELLS);
  const layout = chunkLayout(cx, cz);
  return layout[(gz - cz * CHUNK_CELLS) * CHUNK_CELLS + (gx - cx * CHUNK_CELLS)] === 1;
}

// ---------- Lighting field ----------
// Ceiling light fixtures are sparse and deterministic, and whole 8x8-cell
// regions are "dead" (no working lights at all). Surface brightness is the
// falloff from the nearest fixture, baked into vertex/instance colors when
// a chunk is built — so dark hallways sit next to lit ones and light appears
// to spill in from around the corner, with zero runtime lighting cost.
const MIN_BRIGHTNESS = 0.14;
const LIGHT_RADIUS_CELLS = 3.4;

function hasLight(gx, gz) {
  if (isSolidCell(gx, gz)) return false;
  // dead regions: about a third of the map has no working lights
  const rx = Math.floor(gx / 8);
  const rz = Math.floor(gz / 8);
  if (hash2(rx * 13 + 101, rz * 13 + 57) / 4294967296 < 0.33) return false;
  const roll = hash2(gx * 3 + 7, gz * 3 - 5) / 4294967296;
  const onLane = mod(gx, 5) === 0 || mod(gz, 5) === 0;
  return roll < (onLane ? 0.32 : 0.16);
}

function brightnessAt(x, z) {
  const cgx = Math.floor(x / CELL);
  const cgz = Math.floor(z / CELL);
  let b = MIN_BRIGHTNESS;
  for (let gx = cgx - 3; gx <= cgx + 3; gx++) {
    for (let gz = cgz - 3; gz <= cgz + 3; gz++) {
      if (!hasLight(gx, gz)) continue;
      const dist = Math.hypot(x - (gx * CELL + CELL / 2), z - (gz * CELL + CELL / 2)) / CELL;
      const contribution = MIN_BRIGHTNESS + (1 - MIN_BRIGHTNESS) * Math.max(0, 1 - dist / LIGHT_RADIUS_CELLS);
      if (contribution > b) b = contribution;
    }
  }
  return b;
}

// Collision straight off the grid — no collider lists needed
function checkWallCollision(x, z) {
  const minGX = Math.floor((x - PLAYER_RADIUS) / CELL);
  const maxGX = Math.floor((x + PLAYER_RADIUS) / CELL);
  const minGZ = Math.floor((z - PLAYER_RADIUS) / CELL);
  const maxGZ = Math.floor((z + PLAYER_RADIUS) / CELL);
  for (let gx = minGX; gx <= maxGX; gx++) {
    for (let gz = minGZ; gz <= maxGZ; gz++) {
      if (isSolidCell(gx, gz)) return true;
    }
  }
  return false;
}

// ---------- Chunk mesh lifecycle ----------
const loadedChunks = new Map(); // "cx,cz" -> THREE.Group

const tmpMatrix = new THREE.Matrix4();
const tmpColor = new THREE.Color();

function buildChunk(cx, cz) {
  const layout = chunkLayout(cx, cz);
  const group = new THREE.Group();
  const originX = cx * CHUNK_SIZE;
  const originZ = cz * CHUNK_SIZE;
  const centerX = originX + CHUNK_SIZE / 2;
  const centerZ = originZ + CHUNK_SIZE / 2;

  // Floor: per-chunk geometry clone with the brightness field baked into
  // vertex colors (smooth gradients — light spilling around corners)
  const floorGeometry = floorGeometryTemplate.clone();
  const positions = floorGeometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) {
    // plane is rotated -90deg about X: local (x, y) -> world (x, -y)
    const b = brightnessAt(centerX + positions.getX(i), centerZ - positions.getY(i));
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = b;
  }
  floorGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(centerX, 0, centerZ);
  group.add(floor);

  // Classify cells: walls, lit ceiling tiles, plain ceiling tiles.
  // (No ceiling needed above solid cells — the wall box fills the space.)
  const solidCells = [];
  const litCells = [];
  const plainCells = [];
  for (let lz = 0; lz < CHUNK_CELLS; lz++) {
    for (let lx = 0; lx < CHUNK_CELLS; lx++) {
      const gx = cx * CHUNK_CELLS + lx;
      const gz = cz * CHUNK_CELLS + lz;
      if (layout[lz * CHUNK_CELLS + lx]) {
        solidCells.push([lx, lz]);
      } else if (hasLight(gx, gz)) {
        litCells.push([lx, lz]);
      } else {
        plainCells.push([lx, lz]);
      }
    }
  }

  const cellCenter = (l, origin) => origin + l * CELL + CELL / 2;

  if (solidCells.length > 0) {
    const walls = new THREE.InstancedMesh(wallGeometry, wallMaterial, solidCells.length);
    solidCells.forEach(([lx, lz], i) => {
      const x = cellCenter(lx, originX);
      const z = cellCenter(lz, originZ);
      tmpMatrix.setPosition(x, WALL_HEIGHT / 2, z);
      walls.setMatrixAt(i, tmpMatrix);
      const b = brightnessAt(x, z);
      walls.setColorAt(i, tmpColor.setScalar(b));
    });
    group.add(walls);
  }

  if (litCells.length > 0) {
    const lit = new THREE.InstancedMesh(ceilingTileGeometry, ceilingLightMaterial, litCells.length);
    litCells.forEach(([lx, lz], i) => {
      tmpMatrix.setPosition(cellCenter(lx, originX), WALL_HEIGHT, cellCenter(lz, originZ));
      lit.setMatrixAt(i, tmpMatrix);
    });
    group.add(lit);
  }

  if (plainCells.length > 0) {
    const plain = new THREE.InstancedMesh(ceilingTileGeometry, ceilingPlainMaterial, plainCells.length);
    plainCells.forEach(([lx, lz], i) => {
      const x = cellCenter(lx, originX);
      const z = cellCenter(lz, originZ);
      tmpMatrix.setPosition(x, WALL_HEIGHT, z);
      plain.setMatrixAt(i, tmpMatrix);
      plain.setColorAt(i, tmpColor.setScalar(brightnessAt(x, z)));
    });
    group.add(plain);
  }

  scene.add(group);
  loadedChunks.set(cx + ',' + cz, group);
}

function disposeChunk(key) {
  const group = loadedChunks.get(key);
  if (!group) return;
  scene.remove(group);
  group.traverse((obj) => {
    // materials and template geometries are shared; free per-chunk buffers
    if (obj.isInstancedMesh) {
      obj.dispose();
    } else if (obj.isMesh && obj.geometry !== floorGeometryTemplate) {
      obj.geometry.dispose(); // per-chunk floor clone with baked vertex colors
    }
  });
  loadedChunks.delete(key);
}

let lastPlayerChunkX = null;
let lastPlayerChunkZ = null;

function updateChunks() {
  const pcx = Math.floor(camera.position.x / CHUNK_SIZE);
  const pcz = Math.floor(camera.position.z / CHUNK_SIZE);
  if (pcx === lastPlayerChunkX && pcz === lastPlayerChunkZ) return;
  lastPlayerChunkX = pcx;
  lastPlayerChunkZ = pcz;

  // load everything in range
  for (let cx = pcx - LOAD_RADIUS; cx <= pcx + LOAD_RADIUS; cx++) {
    for (let cz = pcz - LOAD_RADIUS; cz <= pcz + LOAD_RADIUS; cz++) {
      if (!loadedChunks.has(cx + ',' + cz)) buildChunk(cx, cz);
    }
  }
  // unload everything out of range
  for (const key of [...loadedChunks.keys()]) {
    const [cx, cz] = key.split(',').map(Number);
    if (Math.abs(cx - pcx) > UNLOAD_RADIUS || Math.abs(cz - pcz) > UNLOAD_RADIUS) {
      disposeChunk(key);
    }
  }
}

updateChunks(); // build the initial 5x5 neighborhood

// ---------- Fluorescent hum (WebAudio, no asset) ----------
let audioCtx = null;
let humGain = null;
let isMuted = false;

function startHum() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    humGain = audioCtx.createGain();
    humGain.gain.value = isMuted ? 0 : 0.025;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    const osc1 = audioCtx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = 120; // mains hum harmonic
    const osc2 = audioCtx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 60;
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(humGain);
    humGain.connect(audioCtx.destination);
    osc1.start();
    osc2.start();
  } catch (e) {
    console.log('Audio unavailable:', e);
  }
}

const muteBtn = document.getElementById('mute-btn');
muteBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  isMuted = !isMuted;
  if (humGain) humGain.gain.value = isMuted ? 0 : 0.025;
  muteBtn.textContent = isMuted ? '🔇' : '🔊';
});

// ---------- Controls (same scheme as the main game) ----------
const controls = new PointerLockControls(camera, document.body);
const blocker = document.getElementById('blocker');
const instructions = document.getElementById('instructions');
const mobileControls = document.getElementById('mobile-controls');
let gameStarted = false;

if (isMobile) {
  document.getElementById('desktop-instructions').style.display = 'none';
  document.getElementById('mobile-instructions').style.display = 'block';
}

function startGame() {
  startHum();
  if (isMobile) {
    blocker.style.display = 'none';
    mobileControls.classList.add('active');
    gameStarted = true;
  } else {
    controls.lock();
  }
}
blocker.addEventListener('click', startGame);

controls.addEventListener('lock', () => {
  blocker.style.display = 'none';
  gameStarted = true;
});
controls.addEventListener('unlock', () => {
  blocker.style.display = 'flex';
  gameStarted = false;
});

const keys = { forward: false, backward: false, left: false, right: false };

document.addEventListener('keydown', (e) => {
  switch (e.code) {
    case 'KeyW': keys.forward = true; break;
    case 'KeyS': keys.backward = true; break;
    case 'KeyA': keys.left = true; break;
    case 'KeyD': keys.right = true; break;
  }
});
document.addEventListener('keyup', (e) => {
  switch (e.code) {
    case 'KeyW': keys.forward = false; break;
    case 'KeyS': keys.backward = false; break;
    case 'KeyA': keys.left = false; break;
    case 'KeyD': keys.right = false; break;
  }
});

// Mobile joystick
const joystickZone = document.getElementById('joystick-zone');
const joystickStick = document.getElementById('joystick-stick');
let joystickActive = false;
let joystickStartX = 0, joystickStartY = 0;
const joystickMaxDist = 40;

if (isMobile && joystickZone) {
  joystickZone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    joystickActive = true;
    joystickStartX = e.touches[0].clientX;
    joystickStartY = e.touches[0].clientY;
  });
  joystickZone.addEventListener('touchmove', (e) => {
    if (!joystickActive) return;
    e.preventDefault();
    const touch = e.touches[0];
    let dx = touch.clientX - joystickStartX;
    let dy = touch.clientY - joystickStartY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > joystickMaxDist) {
      dx = dx / dist * joystickMaxDist;
      dy = dy / dist * joystickMaxDist;
    }
    joystickStick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    const threshold = 10;
    keys.forward = dy < -threshold;
    keys.backward = dy > threshold;
    keys.left = dx < -threshold;
    keys.right = dx > threshold;
  });
  joystickZone.addEventListener('touchend', () => {
    joystickActive = false;
    joystickStick.style.transform = 'translate(-50%, -50%)';
    keys.forward = keys.backward = keys.left = keys.right = false;
  });
}

// Mobile look
const lookZone = document.getElementById('look-zone');
let lookActive = false;
let lastLookX = 0, lastLookY = 0;
const lookSensitivity = 0.003;

if (isMobile && lookZone) {
  lookZone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    lookActive = true;
    lastLookX = e.touches[0].clientX;
    lastLookY = e.touches[0].clientY;
  });
  lookZone.addEventListener('touchmove', (e) => {
    if (!lookActive) return;
    e.preventDefault();
    const touch = e.touches[0];
    cameraYaw -= (touch.clientX - lastLookX) * lookSensitivity;
    cameraPitch -= (touch.clientY - lastLookY) * lookSensitivity;
    cameraPitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, cameraPitch));
    lastLookX = touch.clientX;
    lastLookY = touch.clientY;
  });
  lookZone.addEventListener('touchend', () => {
    lookActive = false;
  });
}

// Mobile turn buttons
let turningLeft = false;
let turningRight = false;
const turnSpeed = 2.5;
const turnLeftBtn = document.getElementById('turn-left');
const turnRightBtn = document.getElementById('turn-right');

if (isMobile && turnLeftBtn) {
  turnLeftBtn.addEventListener('touchstart', (e) => { e.preventDefault(); turningLeft = true; });
  turnLeftBtn.addEventListener('touchend', () => { turningLeft = false; });
}
if (isMobile && turnRightBtn) {
  turnRightBtn.addEventListener('touchstart', (e) => { e.preventDefault(); turningRight = true; });
  turnRightBtn.addEventListener('touchend', () => { turningRight = false; });
}

// ---------- Wojak: he is here too ----------
// Every now and then Wojak materializes somewhere ahead of the player.
// Walk up to him and he shares what the yellow has taught him (same
// click-through dialog as the main game). Afterwards he just... stays.
const WOJAK_DIALOG_SETS = [
  [
    "You hear it too, don't you? The buzz. It never stops.",
    "I've been walking for... days? Years? The carpet remembers my footsteps, but I don't.",
    "Every hallway looks the same because it IS the same. We never left.",
    "Keep moving. It doesn't like it when you stand still."
  ],
  [
    "You noclipped too, huh? Rookie mistake.",
    "I counted the ceiling lights once. I got to forty thousand and then they started counting me.",
    "There is no exit. There was never an exit. The exit is a rumor the walls tell.",
    "Don't trust the yellow. The yellow is hungry."
  ],
  [
    "Shhh. You smell that? Moist carpet. It gets stronger when it's near.",
    "I saw another one of you last week. He turned a corner and just... wasn't.",
    "The lights flicker when it's close. Watch the lights.",
    "If you hear humming that isn't the lights... run."
  ],
  [
    "Level 0. The Lobby. That's what the old-timers call it.",
    "I used to work in the AWS server room, you know. One day I clipped through the floor... and woke up here.",
    "Time doesn't pass here. Check your watch. It's been lying to you.",
    "You should go home. Wait... you can't. Heh. Heh heh."
  ],
  [
    "Back again? No... no, you're a new one. You're all new ones.",
    "These walls taste like almonds. Don't ask how I know that.",
    "Whatever you do, don't fall asleep on the carpet. It's moist for a reason.",
    "See you around, anon. And around. And around. And around."
  ]
];

const wojakTexture = new THREE.TextureLoader().load('/npc-hoodie-guy.png');
const wojakMaterial = new THREE.SpriteMaterial({
  map: wojakTexture,
  transparent: true,
  alphaTest: 0.5,
  depthWrite: false,
  fog: true
});

const wojaks = [];
let dialogActive = false;
let dialogIndex = 0;
let currentNPC = null;
let lastDialogAdvanceTime = 0;
const dialogAdvanceCooldown = 500;
let nextWojakTimer = 15 + Math.random() * 20; // first appearance ~15-35s in
const MAX_WOJAKS = 4;

function spawnWojak() {
  // Find an open spot 14-28 units away from the player (out in the fog, so
  // he's discovered rather than seen appearing)
  for (let attempt = 0; attempt < 25; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 14 + Math.random() * 14;
    const x = camera.position.x + Math.cos(angle) * dist;
    const z = camera.position.z + Math.sin(angle) * dist;
    if (checkWallCollision(x, z)) continue;

    const sprite = new THREE.Sprite(wojakMaterial);
    sprite.scale.set(2.0, 2.8, 1);
    sprite.position.set(x, 1.4, z);
    sprite.dialogLines = WOJAK_DIALOG_SETS[Math.floor(Math.random() * WOJAK_DIALOG_SETS.length)];
    sprite.hasSpoken = false;
    scene.add(sprite);
    wojaks.push(sprite);
    return true;
  }
  return false;
}

function updateWojaks(delta) {
  // Materialize a new one every now and then
  nextWojakTimer -= delta;
  if (nextWojakTimer <= 0 && wojaks.length < MAX_WOJAKS) {
    spawnWojak();
    nextWojakTimer = 30 + Math.random() * 45; // next one in 30-75s
  }

  for (let i = wojaks.length - 1; i >= 0; i--) {
    const npc = wojaks[i];
    const distToPlayer = npc.position.distanceTo(camera.position);

    // He stays where he is — but once he's long gone into the fog and his
    // chunks have unloaded, he quietly returns to the yellow
    if (distToPlayer > 130) {
      scene.remove(npc);
      wojaks.splice(i, 1);
      continue;
    }

    // Walk into him and he speaks (once)
    if (distToPlayer < 3 && !dialogActive && !npc.hasSpoken) {
      npc.hasSpoken = true;
      startDialog(npc);
    }
  }
}

function startDialog(npc) {
  dialogActive = true;
  dialogIndex = 0;
  currentNPC = npc;
  lastDialogAdvanceTime = 0;
  showDialogLine();
}

function showDialogLine() {
  const dialogBox = document.getElementById('npc-dialog-box');
  if (!dialogBox || !currentNPC) return;
  dialogBox.classList.add('active');
  document.getElementById('npc-portrait').src = '/npc-hoodie-guy.png';
  document.getElementById('npc-name').textContent = 'Wojak';
  document.getElementById('npc-text').textContent = currentNPC.dialogLines[dialogIndex];
  const npcContinue = document.getElementById('npc-continue');
  const isLastLine = dialogIndex >= currentNPC.dialogLines.length - 1;
  npcContinue.textContent = isLastLine ? 'Click/Tap to close...' : 'Click/Tap to continue...';
}

function advanceDialog() {
  if (!currentNPC) return;
  const now = Date.now();
  if (now - lastDialogAdvanceTime < dialogAdvanceCooldown) return;
  lastDialogAdvanceTime = now;

  dialogIndex++;
  if (dialogIndex >= currentNPC.dialogLines.length) {
    endDialog();
  } else {
    showDialogLine();
  }
}

function endDialog() {
  dialogActive = false;
  dialogIndex = 0;
  currentNPC = null;
  const dialogBox = document.getElementById('npc-dialog-box');
  if (dialogBox) dialogBox.classList.remove('active');
}

// While the dialogue is open, clicking anywhere advances it (X closes it)
document.addEventListener('click', (e) => {
  if (!dialogActive) return;
  e.stopImmediatePropagation();
  const closeBtn = document.getElementById('npc-close');
  if (closeBtn && closeBtn.contains(e.target)) {
    endDialog();
  } else {
    advanceDialog();
  }
});

document.addEventListener('touchstart', (e) => {
  if (!dialogActive) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  const closeBtn = document.getElementById('npc-close');
  if (closeBtn && closeBtn.contains(e.target)) {
    endDialog();
  } else {
    advanceDialog();
  }
}, { passive: false });

document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyE' && dialogActive) advanceDialog();
});

// ---------- Player ----------
const player = {
  velocity: new THREE.Vector3(),
  direction: new THREE.Vector3(),
  onGround: true,
  speed: 10,
  lastHopTime: 0,
  hopInterval: 0.25
};

function updatePlayer(delta) {
  player.velocity.y -= 30 * delta;

  if (camera.position.y <= EYE_HEIGHT) {
    camera.position.y = EYE_HEIGHT;
    player.velocity.y = 0;
    player.onGround = true;
  } else {
    player.onGround = false;
  }

  if (isMobile) {
    if (turningLeft) cameraYaw += turnSpeed * delta;
    if (turningRight) cameraYaw -= turnSpeed * delta;
    camera.rotation.order = 'YXZ';
    camera.rotation.y = cameraYaw;
    camera.rotation.x = cameraPitch;
  }

  player.direction.z = Number(keys.forward) - Number(keys.backward);
  player.direction.x = Number(keys.right) - Number(keys.left);
  player.direction.normalize();

  if (isMobile) {
    const moveSpeed = player.speed * delta;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0));

    let newX = camera.position.x;
    let newZ = camera.position.z;
    if (keys.forward) { newX += forward.x * moveSpeed; newZ += forward.z * moveSpeed; }
    if (keys.backward) { newX -= forward.x * moveSpeed; newZ -= forward.z * moveSpeed; }
    if (keys.right) { newX += right.x * moveSpeed; newZ += right.z * moveSpeed; }
    if (keys.left) { newX -= right.x * moveSpeed; newZ -= right.z * moveSpeed; }

    if (!checkWallCollision(newX, camera.position.z)) camera.position.x = newX;
    if (!checkWallCollision(camera.position.x, newZ)) camera.position.z = newZ;
  } else {
    const oldX = camera.position.x;
    const oldZ = camera.position.z;

    if (keys.forward || keys.backward) controls.moveForward(player.direction.z * player.speed * delta);
    if (keys.left || keys.right) controls.moveRight(player.direction.x * player.speed * delta);

    const newX = camera.position.x;
    const newZ = camera.position.z;
    if (checkWallCollision(newX, newZ)) {
      if (!checkWallCollision(newX, oldZ)) {
        camera.position.z = oldZ;
      } else if (!checkWallCollision(oldX, newZ)) {
        camera.position.x = oldX;
      } else {
        camera.position.x = oldX;
        camera.position.z = oldZ;
      }
    }
  }

  // Walking mini-hops, same feel as the main game
  const isMoving = keys.forward || keys.backward || keys.left || keys.right;
  if (isMoving && player.onGround) {
    player.lastHopTime += delta;
    if (player.lastHopTime >= player.hopInterval) {
      player.velocity.y = 3;
      player.onGround = false;
      player.lastHopTime = 0;
    }
  } else {
    player.lastHopTime = 0;
  }
  camera.position.y += player.velocity.y * delta;
}

// ---------- Light flicker ----------
let flickerTime = 0;

function updateFlicker(delta) {
  if (flickerTime > 0) {
    flickerTime -= delta;
    ambientLight.intensity = 0.35 + Math.random() * 0.5;
    if (flickerTime <= 0) ambientLight.intensity = 0.75;
  } else if (Math.random() < 0.002) {
    flickerTime = 0.15 + Math.random() * 0.35;
  }
}

// ---------- HUD ----------
const distanceEl = document.getElementById('distance');
const spawnX = camera.position.x;
const spawnZ = camera.position.z;
let hudTimer = 0;

function updateHUD(delta) {
  hudTimer += delta;
  if (hudTimer < 0.25) return;
  hudTimer = 0;
  distanceEl.textContent = Math.round(Math.hypot(camera.position.x - spawnX, camera.position.z - spawnZ));
}

// ---------- Game loop ----------
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.1);
  const isPlaying = isMobile ? gameStarted : controls.isLocked;

  if (isPlaying) {
    if (!dialogActive) {
      updatePlayer(delta);
      updateWojaks(delta);
    }
    updateChunks();
    updateFlicker(delta);
    updateHUD(delta);
  }

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();

// Debug handle (also used by the automated smoke test)
window.__backrooms = {
  camera,
  updateChunks,
  checkWallCollision,
  chunkCount: () => loadedChunks.size,
  brightnessAt,
  hasLight,
  spawnWojak,
  updateWojaks,
  wojaks,
  isDialogActive: () => dialogActive
};

console.log('🟨 The Backrooms loaded. There is no exit.', isMobile ? '(Mobile mode)' : '(Desktop mode)');
