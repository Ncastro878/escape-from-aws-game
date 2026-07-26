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
const FOG_COLOR = 0x4a4126;
scene.background = new THREE.Color(FOG_COLOR);
scene.fog = new THREE.Fog(FOG_COLOR, 8, 55);

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

// Ceiling: 2x2 acoustic tiles, one of which is a fluorescent light panel.
// Texture spans 2 cells, so there's a light every other cell (every 8 units).
const ceilingTexture = makeTexture(256, (ctx, s) => {
  const t = s / 2;
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const isLight = i === 0 && j === 0;
      ctx.fillStyle = isLight ? '#fffbe0' : '#d8d2a4';
      ctx.fillRect(i * t, j * t, t, t);
      if (isLight) {
        const g = ctx.createRadialGradient(i * t + t / 2, j * t + t / 2, 5, i * t + t / 2, j * t + t / 2, t / 1.4);
        g.addColorStop(0, 'rgba(255,255,240,1)');
        g.addColorStop(1, 'rgba(240,230,180,0.4)');
        ctx.fillStyle = g;
        ctx.fillRect(i * t + 8, j * t + 8, t - 16, t - 16);
      } else {
        // speckled acoustic tile
        for (let k = 0; k < 250; k++) {
          ctx.fillStyle = `rgba(90,82,50,${Math.random() * 0.15})`;
          ctx.fillRect(i * t + Math.random() * t, j * t + Math.random() * t, 1.5, 1.5);
        }
      }
      ctx.strokeStyle = '#8a8258';
      ctx.lineWidth = 3;
      ctx.strokeRect(i * t + 1.5, j * t + 1.5, t - 3, t - 3);
    }
  }
});
ceilingTexture.repeat.set(CHUNK_CELLS / 2, CHUNK_CELLS / 2);

// ---------- Shared geometry & materials (one of each, reused by all chunks) ----------
const wallMaterial = new THREE.MeshLambertMaterial({ map: wallTexture });
const floorMaterial = new THREE.MeshLambertMaterial({ map: carpetTexture });
const ceilingMaterial = new THREE.MeshLambertMaterial({
  map: ceilingTexture,
  emissive: 0xfff6d0,
  emissiveMap: ceilingTexture,
  emissiveIntensity: 0.55
});
const wallGeometry = new THREE.BoxGeometry(CELL, WALL_HEIGHT, CELL);
const planeGeometry = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE);

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
// Each block gets random partition walls / pillars seeded by its own coords.
function fillBlock(layout, localOx, localOz, rng) {
  const roll = rng();
  const segmentCount = roll < 0.15 ? 0 : roll < 0.6 ? 1 : roll < 0.9 ? 2 : 3;
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
    // a lone pillar
    layout[(localOz + Math.floor(rng() * 4)) * CHUNK_CELLS + localOx + Math.floor(rng() * 4)] = 1;
  }
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

function buildChunk(cx, cz) {
  const layout = chunkLayout(cx, cz);
  const group = new THREE.Group();
  const originX = cx * CHUNK_SIZE;
  const originZ = cz * CHUNK_SIZE;

  const floor = new THREE.Mesh(planeGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(originX + CHUNK_SIZE / 2, 0, originZ + CHUNK_SIZE / 2);
  group.add(floor);

  const ceiling = new THREE.Mesh(planeGeometry, ceilingMaterial);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(originX + CHUNK_SIZE / 2, WALL_HEIGHT, originZ + CHUNK_SIZE / 2);
  group.add(ceiling);

  // All wall cells in this chunk share a single InstancedMesh (1 draw call)
  const solidCells = [];
  for (let lz = 0; lz < CHUNK_CELLS; lz++) {
    for (let lx = 0; lx < CHUNK_CELLS; lx++) {
      if (layout[lz * CHUNK_CELLS + lx]) solidCells.push([lx, lz]);
    }
  }
  if (solidCells.length > 0) {
    const walls = new THREE.InstancedMesh(wallGeometry, wallMaterial, solidCells.length);
    const matrix = new THREE.Matrix4();
    solidCells.forEach(([lx, lz], i) => {
      matrix.setPosition(
        originX + lx * CELL + CELL / 2,
        WALL_HEIGHT / 2,
        originZ + lz * CELL + CELL / 2
      );
      walls.setMatrixAt(i, matrix);
    });
    group.add(walls);
  }

  scene.add(group);
  loadedChunks.set(cx + ',' + cz, group);
}

function disposeChunk(key) {
  const group = loadedChunks.get(key);
  if (!group) return;
  scene.remove(group);
  group.traverse((obj) => {
    // geometry/materials are shared — only free per-chunk instance buffers
    if (obj.isInstancedMesh) obj.dispose();
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
    updatePlayer(delta);
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
  chunkCount: () => loadedChunks.size
};

console.log('🟨 The Backrooms loaded. There is no exit.', isMobile ? '(Mobile mode)' : '(Desktop mode)');
