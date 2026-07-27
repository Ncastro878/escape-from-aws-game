import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// ============================================================================
// THE BACKROOMS — Level 0 (and beyond)
// Infinite, procedurally generated liminal spaces.
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
//
// Levels: the same engine drives multiple "levels" — each level is a config
// (textures, fog, light density, layout mix, hash salt). EXIT doors appear
// on random walls; walk up to one and it opens into the next level.
// ============================================================================

const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 800;

// ---------- World constants ----------
const CELL = 4;                        // world units per grid cell
const CHUNK_CELLS = 10;                // cells per chunk side
const CHUNK_SIZE = CELL * CHUNK_CELLS; // 40 units
const WALL_HEIGHT = 3;                 // low ceilings for that claustrophobic feel
const EYE_HEIGHT = 1.7;
const LOAD_RADIUS = 2;                 // keep a 5x5 grid of chunks around the player
const UNLOAD_RADIUS = 3;               // dispose chunks beyond this
const PLAYER_RADIUS = 0.45;
const LIGHT_RADIUS_CELLS = 3.4;

// ---------- Scene ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2b2514);
scene.fog = new THREE.Fog(0x2b2514, 8, 50);

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

// --- Level 0: mono-yellow backrooms ---
function buildBackroomsTextures() {
  // Mono-yellow wallpaper with faint vertical striping and grime
  const wall = makeTexture(256, (ctx, s) => {
    ctx.fillStyle = '#cbb964';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    for (let x = 0; x < s; x += 16) ctx.fillRect(x, 0, 6, s);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,250,220'},${Math.random() * 0.06})`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
    const grad = ctx.createLinearGradient(0, s * 0.7, 0, s);
    grad.addColorStop(0, 'rgba(60,50,20,0)');
    grad.addColorStop(1, 'rgba(60,50,20,0.25)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);
  });

  // Old moist carpet
  const floor = makeTexture(256, (ctx, s) => {
    ctx.fillStyle = '#a3924e';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 6000; i++) {
      ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '40,34,12' : '200,185,110'},${Math.random() * 0.14})`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 1.5, 1.5);
    }
    for (let i = 0; i < 5; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = 15 + Math.random() * 35;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(50,42,15,0.18)');
      g.addColorStop(1, 'rgba(50,42,15,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
  floor.repeat.set(CHUNK_CELLS, CHUNK_CELLS);

  const drawCeilingBase = (ctx, s) => {
    ctx.fillStyle = '#d8d2a4';
    ctx.fillRect(0, 0, s, s);
    for (let k = 0; k < 900; k++) {
      ctx.fillStyle = `rgba(90,82,50,${Math.random() * 0.15})`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 1.5, 1.5);
    }
    ctx.strokeStyle = '#8a8258';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, s - 4, s - 4);
  };

  const ceilPlain = makeTexture(128, drawCeilingBase);

  const ceilLight = makeTexture(128, (ctx, s) => {
    drawCeilingBase(ctx, s);
    // recessed rectangular office light fixture
    const inset = 26;
    ctx.fillStyle = '#6e6640';
    ctx.fillRect(inset - 4, inset - 4, s - (inset - 4) * 2, s - (inset - 4) * 2);
    const g = ctx.createRadialGradient(s / 2, s / 2, 6, s / 2, s / 2, s / 2 - inset + 14);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.7, '#fffbe0');
    g.addColorStop(1, '#efe4ac');
    ctx.fillStyle = g;
    ctx.fillRect(inset, inset, s - inset * 2, s - inset * 2);
    ctx.strokeStyle = 'rgba(200,190,140,0.5)';
    ctx.lineWidth = 2;
    for (let x = inset + 8; x < s - inset; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x, inset);
      ctx.lineTo(x, s - inset);
      ctx.stroke();
    }
  });

  return { wall, floor, ceilPlain, ceilLight };
}

// --- Level 1: the nice, endless house ---
function buildHouseTextures() {
  // Cream wallpaper with soft sage stripes over white wainscot paneling
  const wall = makeTexture(256, (ctx, s) => {
    const wainscotY = s * 0.68; // bottom ~third of the wall is wainscot
    ctx.fillStyle = '#f3eee1';
    ctx.fillRect(0, 0, s, wainscotY);
    ctx.fillStyle = 'rgba(178,190,160,0.5)';
    for (let x = 8; x < s; x += 36) ctx.fillRect(x, 0, 13, wainscotY);
    ctx.fillStyle = 'rgba(150,140,110,0.12)';
    for (let i = 0; i < 300; i++) {
      ctx.fillRect(Math.random() * s, Math.random() * wainscotY, 1.5, 1.5);
    }
    // chair rail
    ctx.fillStyle = '#e2dccb';
    ctx.fillRect(0, wainscotY - 4, s, 8);
    ctx.fillStyle = 'rgba(120,110,90,0.35)';
    ctx.fillRect(0, wainscotY + 4, s, 2);
    // wainscot panels
    ctx.fillStyle = '#faf8f1';
    ctx.fillRect(0, wainscotY + 6, s, s - wainscotY - 6);
    ctx.strokeStyle = 'rgba(160,152,130,0.5)';
    ctx.lineWidth = 3;
    for (let x = 10; x < s; x += 64) {
      ctx.strokeRect(x, wainscotY + 18, 44, s - wainscotY - 42);
    }
    // baseboard
    ctx.fillStyle = '#eee9db';
    ctx.fillRect(0, s - 14, s, 14);
    ctx.fillStyle = 'rgba(120,110,90,0.4)';
    ctx.fillRect(0, s - 16, s, 2);
  });

  // Oak plank floor
  const floor = makeTexture(256, (ctx, s) => {
    const plankH = 32;
    const tones = ['#c9a26d', '#bf9560', '#d2ac79', '#c49b66'];
    for (let row = 0; row < s / plankH; row++) {
      ctx.fillStyle = tones[row % tones.length];
      ctx.fillRect(0, row * plankH, s, plankH);
      for (let g = 0; g < 22; g++) {
        ctx.strokeStyle = `rgba(120,80,40,${0.05 + Math.random() * 0.09})`;
        ctx.lineWidth = 1;
        const y = row * plankH + Math.random() * plankH;
        const wob = (Math.random() - 0.5) * 6;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(s * 0.3, y + wob, s * 0.6, y - wob, s, y);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(80,55,30,0.45)';
      ctx.fillRect(0, row * plankH - 1, s, 2);
      ctx.fillRect(((row * 89) % 8) / 8 * s, row * plankH, 2, plankH);
    }
  });
  floor.repeat.set(CHUNK_CELLS, CHUNK_CELLS);

  // Smooth plaster ceiling
  const drawPlaster = (ctx, s) => {
    ctx.fillStyle = '#f5f2e9';
    ctx.fillRect(0, 0, s, s);
    for (let k = 0; k < 500; k++) {
      ctx.fillStyle = `rgba(190,184,165,${Math.random() * 0.1})`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 1.5, 1.5);
    }
  };

  const ceilPlain = makeTexture(128, drawPlaster);

  const ceilLight = makeTexture(128, (ctx, s) => {
    drawPlaster(ctx, s);
    // clean recessed panel light with a soft white glow
    const inset = 30;
    ctx.fillStyle = '#dcd7c8';
    ctx.fillRect(inset - 5, inset - 5, s - (inset - 5) * 2, s - (inset - 5) * 2);
    const g = ctx.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s / 2 - inset + 12);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#f7f2e2');
    ctx.fillStyle = g;
    ctx.fillRect(inset, inset, s - inset * 2, s - inset * 2);
  });

  return { wall, floor, ceilPlain, ceilLight };
}

// ---------- Level definitions ----------
const LEVELS = {
  backrooms: {
    id: 'backrooms',
    hudName: 'LEVEL 0',
    salt: 0,
    fogColor: 0x2b2514, fogNear: 8, fogFar: 50,
    ambientColor: 0xfff3c4, ambientIntensity: 0.75,
    hemiSky: 0xfff6d0, hemiGround: 0x5a5138, hemiIntensity: 0.9,
    emissiveColor: 0xfff8d8, emissiveIntensity: 0.9,
    minBrightness: 0.14,
    deadRegionChance: 0.33,
    laneLightChance: 0.32,
    openLightChance: 0.16,
    // cumulative zone thresholds: solid / maze / sparse / (rest = open)
    zones: { solid: 0.40, maze: 0.62, sparse: 0.78 },
    flicker: true,
    wojaks: true,
    doorTarget: 'house',
    doorStyle: 'metal',
    hum: { f1: 120, f2: 60, gain: 0.025 },
    buildTextures: buildBackroomsTextures
  },
  house: {
    id: 'house',
    hudName: 'LEVEL 1',
    salt: 1,
    fogColor: 0xe4ded1, fogNear: 10, fogFar: 55,
    ambientColor: 0xffffff, ambientIntensity: 0.95,
    hemiSky: 0xffffff, hemiGround: 0xd8d2c4, hemiIntensity: 1.0,
    emissiveColor: 0xfff8ee, emissiveIntensity: 0.75,
    minBrightness: 0.62,
    deadRegionChance: 0,
    laneLightChance: 0.45,
    openLightChance: 0.28,
    zones: { solid: 0.30, maze: 0.38, sparse: 0.70 },
    flicker: false,
    wojaks: false,
    doorTarget: 'backrooms',
    doorStyle: 'white',
    hum: { f1: 90, f2: 45, gain: 0.01 },
    buildTextures: buildHouseTextures
  }
};

let currentLevel = LEVELS.backrooms;

function levelMaterials(level) {
  if (level._materials) return level._materials;
  const tex = level.buildTextures();
  level._materials = {
    wall: new THREE.MeshLambertMaterial({ map: tex.wall }),
    floor: new THREE.MeshLambertMaterial({ map: tex.floor, vertexColors: true }),
    ceilPlain: new THREE.MeshLambertMaterial({ map: tex.ceilPlain }),
    ceilLight: new THREE.MeshLambertMaterial({
      map: tex.ceilLight,
      emissive: level.emissiveColor,
      emissiveMap: tex.ceilLight,
      emissiveIntensity: level.emissiveIntensity
    })
  };
  return level._materials;
}

// ---------- Shared geometry ----------
const wallGeometry = new THREE.BoxGeometry(CELL, WALL_HEIGHT, CELL);
// per-cell ceiling tile, pre-rotated to face down so instances are pure translations
const ceilingTileGeometry = new THREE.PlaneGeometry(CELL, CELL);
ceilingTileGeometry.rotateX(Math.PI / 2);
// floor plane subdivided per cell so brightness can vary smoothly across it
const floorGeometryTemplate = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, CHUNK_CELLS, CHUNK_CELLS);

// ---------- Deterministic layout generation ----------
function hash2(x, z) {
  let h = Math.imul(x, 374761393) + Math.imul(z, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

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
// Each block rolls a zone type from the level's mix — solid blocks turn the
// lanes into narrow hallways, maze blocks add nooks and dead ends, sparse
// blocks read as half-empty rooms, open blocks merge into wide halls.
function fillBlock(layout, localOx, localOz, rng, zones) {
  const zone = rng();

  if (zone < zones.solid) {
    for (let dx = 0; dx < 4; dx++) {
      for (let dz = 0; dz < 4; dz++) {
        layout[(localOz + dz) * CHUNK_CELLS + localOx + dx] = 1;
      }
    }
    return;
  }

  if (zone < zones.maze) {
    for (let dx = 0; dx < 4; dx++) {
      for (let dz = 0; dz < 4; dz++) {
        if (rng() < 0.5) layout[(localOz + dz) * CHUNK_CELLS + localOx + dx] = 1;
      }
    }
    return;
  }

  if (zone < zones.sparse) {
    const segmentCount = 1 + Math.floor(rng() * 2);
    for (let sIdx = 0; sIdx < segmentCount; sIdx++) {
      const horizontal = rng() < 0.5;
      const length = 2 + Math.floor(rng() * 3);
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

  // OPEN: nothing
}

// Layouts are tiny (100 bytes each) so the cache can just grow — even hours
// of walking costs a few hundred KB. Meshes are what get unloaded, not this.
const layoutCache = new Map();

function chunkLayout(cx, cz) {
  const key = currentLevel.id + ':' + cx + ',' + cz;
  let layout = layoutCache.get(key);
  if (layout) return layout;
  layout = new Uint8Array(CHUNK_CELLS * CHUNK_CELLS);
  const salt = currentLevel.salt;
  for (let bi = 0; bi < 2; bi++) {
    for (let bj = 0; bj < 2; bj++) {
      const rng = mulberry32(hash2(cx * 2 + bi + salt * 100003, cz * 2 + bj + salt * 50021));
      fillBlock(layout, bi * 5 + 1, bj * 5 + 1, rng, currentLevel.zones);
    }
  }
  layoutCache.set(key, layout);
  return layout;
}

function isSolidCell(gx, gz) {
  if (mod(gx, 5) === 0 || mod(gz, 5) === 0) return false; // corridor lanes
  const cx = Math.floor(gx / CHUNK_CELLS);
  const cz = Math.floor(gz / CHUNK_CELLS);
  const layout = chunkLayout(cx, cz);
  return layout[(gz - cz * CHUNK_CELLS) * CHUNK_CELLS + (gx - cx * CHUNK_CELLS)] === 1;
}

// ---------- Lighting field ----------
// Ceiling light fixtures are sparse and deterministic; in levels with a
// deadRegionChance whole 8x8-cell regions have no working lights at all.
// Surface brightness is the falloff from the nearest fixture, baked into
// vertex/instance colors at chunk build time — dark hallways sit next to
// lit ones and light spills around corners with zero runtime lighting cost.
function hasLight(gx, gz) {
  if (isSolidCell(gx, gz)) return false;
  const salt = currentLevel.salt;
  if (currentLevel.deadRegionChance > 0) {
    const rx = Math.floor(gx / 8);
    const rz = Math.floor(gz / 8);
    if (hash2(rx * 13 + 101 + salt * 7919, rz * 13 + 57 - salt * 104729) / 4294967296 < currentLevel.deadRegionChance) {
      return false;
    }
  }
  const roll = hash2(gx * 3 + 7 + salt * 31337, gz * 3 - 5 + salt * 271) / 4294967296;
  const onLane = mod(gx, 5) === 0 || mod(gz, 5) === 0;
  return roll < (onLane ? currentLevel.laneLightChance : currentLevel.openLightChance);
}

function brightnessAt(x, z) {
  const minB = currentLevel.minBrightness;
  const cgx = Math.floor(x / CELL);
  const cgz = Math.floor(z / CELL);
  let b = minB;
  for (let gx = cgx - 3; gx <= cgx + 3; gx++) {
    for (let gz = cgz - 3; gz <= cgz + 3; gz++) {
      if (!hasLight(gx, gz)) continue;
      const dist = Math.hypot(x - (gx * CELL + CELL / 2), z - (gz * CELL + CELL / 2)) / CELL;
      const contribution = minB + (1 - minB) * Math.max(0, 1 - dist / LIGHT_RADIUS_CELLS);
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
  const materials = levelMaterials(currentLevel);
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
  const floor = new THREE.Mesh(floorGeometry, materials.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(centerX, 0, centerZ);
  group.add(floor);

  // Classify cells: walls, lit ceiling tiles, plain ceiling tiles.
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
    const walls = new THREE.InstancedMesh(wallGeometry, materials.wall, solidCells.length);
    solidCells.forEach(([lx, lz], i) => {
      const x = cellCenter(lx, originX);
      const z = cellCenter(lz, originZ);
      tmpMatrix.setPosition(x, WALL_HEIGHT / 2, z);
      walls.setMatrixAt(i, tmpMatrix);
      walls.setColorAt(i, tmpColor.setScalar(brightnessAt(x, z)));
    });
    group.add(walls);
  }

  if (litCells.length > 0) {
    const lit = new THREE.InstancedMesh(ceilingTileGeometry, materials.ceilLight, litCells.length);
    litCells.forEach(([lx, lz], i) => {
      tmpMatrix.setPosition(cellCenter(lx, originX), WALL_HEIGHT, cellCenter(lz, originZ));
      lit.setMatrixAt(i, tmpMatrix);
    });
    group.add(lit);
  }

  if (plainCells.length > 0) {
    const plain = new THREE.InstancedMesh(ceilingTileGeometry, materials.ceilPlain, plainCells.length);
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

  for (let cx = pcx - LOAD_RADIUS; cx <= pcx + LOAD_RADIUS; cx++) {
    for (let cz = pcz - LOAD_RADIUS; cz <= pcz + LOAD_RADIUS; cz++) {
      if (!loadedChunks.has(cx + ',' + cz)) buildChunk(cx, cz);
    }
  }
  for (const key of [...loadedChunks.keys()]) {
    const [cx, cz] = key.split(',').map(Number);
    if (Math.abs(cx - pcx) > UNLOAD_RADIUS || Math.abs(cz - pcz) > UNLOAD_RADIUS) {
      disposeChunk(key);
    }
  }
}

// ---------- Fluorescent hum (WebAudio, no asset) ----------
let audioCtx = null;
let humGain = null;
let humOsc1 = null;
let humOsc2 = null;
let isMuted = false;

function startHum() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    humGain = audioCtx.createGain();
    humGain.gain.value = isMuted ? 0 : currentLevel.hum.gain;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    humOsc1 = audioCtx.createOscillator();
    humOsc1.type = 'sawtooth';
    humOsc1.frequency.value = currentLevel.hum.f1;
    humOsc2 = audioCtx.createOscillator();
    humOsc2.type = 'sine';
    humOsc2.frequency.value = currentLevel.hum.f2;
    humOsc1.connect(filter);
    humOsc2.connect(filter);
    filter.connect(humGain);
    humGain.connect(audioCtx.destination);
    humOsc1.start();
    humOsc2.start();
  } catch (e) {
    console.log('Audio unavailable:', e);
  }
}

function applyHumForLevel() {
  if (!audioCtx) return;
  humOsc1.frequency.value = currentLevel.hum.f1;
  humOsc2.frequency.value = currentLevel.hum.f2;
  humGain.gain.value = isMuted ? 0 : currentLevel.hum.gain;
}

const muteBtn = document.getElementById('mute-btn');
muteBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  isMuted = !isMuted;
  if (humGain) humGain.gain.value = isMuted ? 0 : currentLevel.hum.gain;
  muteBtn.textContent = isMuted ? '🔇' : '🔊';
});

// ---------- Controls (same scheme as the main game) ----------
const controls = new PointerLockControls(camera, document.body);
const blocker = document.getElementById('blocker');
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
let nextWojakTimer = 15 + Math.random() * 20;
const MAX_WOJAKS = 4;

function spawnWojak() {
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

function clearWojaks() {
  for (const npc of wojaks) scene.remove(npc);
  wojaks.length = 0;
}

function updateWojaks(delta) {
  if (currentLevel.wojaks) {
    nextWojakTimer -= delta;
    if (nextWojakTimer <= 0 && wojaks.length < MAX_WOJAKS) {
      spawnWojak();
      nextWojakTimer = 30 + Math.random() * 45;
    }
  }

  for (let i = wojaks.length - 1; i >= 0; i--) {
    const npc = wojaks[i];
    const distToPlayer = npc.position.distanceTo(camera.position);

    if (distToPlayer > 130) {
      scene.remove(npc);
      wojaks.splice(i, 1);
      continue;
    }

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

// ---------- EXIT doors between levels ----------
// A door appears on a random wall every so often. Walk up to it and it
// swings open by itself, revealing the glow of somewhere else — then the
// screen fades and you step through into the next level.
const exitSignTexture = makeTexture(128, (ctx, s) => {
  ctx.fillStyle = '#141414';
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = '#3a3a3a';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, s - 6, s - 6);
  ctx.shadowColor = '#ff5a4e';
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#ff3b30';
  ctx.font = 'bold 44px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('EXIT', s / 2, s / 2 + 2);
});
const exitSignMaterial = new THREE.MeshBasicMaterial({ map: exitSignTexture });

function doorMaterials(level) {
  if (level._doorMats) return level._doorMats;
  const slabTexture = makeTexture(128, (ctx, s) => {
    if (level.doorStyle === 'metal') {
      // battered gray metal door
      ctx.fillStyle = '#8f8a7a';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 400; i++) {
        ctx.fillStyle = `rgba(60,58,48,${Math.random() * 0.12})`;
        ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
      }
      ctx.fillStyle = '#6e6a5c';
      ctx.fillRect(0, s * 0.82, s, s * 0.18); // kick plate
      ctx.strokeStyle = 'rgba(40,38,30,0.5)';
      ctx.lineWidth = 3;
      ctx.strokeRect(4, 4, s - 8, s - 8);
    } else {
      // clean white paneled door
      ctx.fillStyle = '#f7f4ec';
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = 'rgba(170,162,140,0.6)';
      ctx.lineWidth = 3;
      ctx.strokeRect(18, 12, s - 36, s * 0.38);
      ctx.strokeRect(18, s * 0.52, s - 36, s * 0.4);
      ctx.strokeStyle = 'rgba(210,204,186,0.8)';
      ctx.strokeRect(21, 15, s - 42, s * 0.38 - 6);
      ctx.strokeRect(21, s * 0.52 + 3, s - 42, s * 0.4 - 6);
    }
  });
  level._doorMats = {
    slab: new THREE.MeshLambertMaterial({ map: slabTexture }),
    frame: new THREE.MeshLambertMaterial({ color: level.doorStyle === 'metal' ? 0x5f5a48 : 0xe0dbc9 }),
    handle: new THREE.MeshLambertMaterial({ color: 0xb8b0a0 })
  };
  return level._doorMats;
}

const doorSlabGeometry = new THREE.BoxGeometry(1.5, 2.3, 0.1);
const doorFrameGeometry = new THREE.BoxGeometry(2.0, 2.55, 0.06);
const doorPortalGeometry = new THREE.PlaneGeometry(1.5, 2.3);
const doorSignGeometry = new THREE.BoxGeometry(0.9, 0.32, 0.08);
const doorHandleGeometry = new THREE.BoxGeometry(0.06, 0.06, 0.18);
const portalMaterialCache = {};

function portalMaterial(targetId) {
  if (!portalMaterialCache[targetId]) {
    portalMaterialCache[targetId] = new THREE.MeshBasicMaterial({
      color: LEVELS[targetId].fogColor
    });
  }
  return portalMaterialCache[targetId];
}

const doors = [];
let nextDoorTimer = 25 + Math.random() * 30;
let doorTransitioning = false;
const fadeEl = document.getElementById('level-fade');
const levelNameEl = document.getElementById('level-name');

function buildDoorGroup(level) {
  const mats = doorMaterials(level);
  const group = new THREE.Group();

  const frame = new THREE.Mesh(doorFrameGeometry, mats.frame);
  frame.position.set(0, 2.55 / 2, 0.03);
  group.add(frame);

  // the void you see when the slab swings open — glows with the color of
  // wherever this door leads
  const portal = new THREE.Mesh(doorPortalGeometry, portalMaterial(level.doorTarget));
  portal.position.set(0, 1.15, 0.07);
  group.add(portal);

  const hinge = new THREE.Group();
  hinge.position.set(-0.75, 0, 0.13);
  const slab = new THREE.Mesh(doorSlabGeometry, mats.slab);
  slab.position.set(0.75, 1.15, 0);
  hinge.add(slab);
  const handle = new THREE.Mesh(doorHandleGeometry, mats.handle);
  handle.position.set(0.58, -0.05, 0.06);
  slab.add(handle);
  group.add(hinge);

  const sign = new THREE.Mesh(doorSignGeometry, exitSignMaterial);
  sign.position.set(0, 2.72, 0.1);
  group.add(sign);

  group.userData.hinge = hinge;
  return group;
}

function spawnDoor() {
  for (let attempt = 0; attempt < 40; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 12 + Math.random() * 16;
    const px = camera.position.x + Math.cos(angle) * dist;
    const pz = camera.position.z + Math.sin(angle) * dist;
    const gx = Math.floor(px / CELL);
    const gz = Math.floor(pz / CELL);
    if (isSolidCell(gx, gz)) continue; // need an open cell to stand in

    // find a solid neighbor to mount the door on
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const start = Math.floor(Math.random() * 4);
    for (let d = 0; d < 4; d++) {
      const [dx, dz] = dirs[(start + d) % 4];
      if (!isSolidCell(gx + dx, gz + dz)) continue;

      const faceX = (gx + 0.5 + dx * 0.5) * CELL;
      const faceZ = (gz + 0.5 + dz * 0.5) * CELL;
      // local +Z must point away from the wall, into the open cell
      const yaw = Math.atan2(-dx, -dz);

      const group = buildDoorGroup(currentLevel);
      group.position.set(faceX, 0, faceZ);
      group.rotation.y = yaw;
      scene.add(group);
      doors.push({
        group,
        hinge: group.userData.hinge,
        state: 'closed',
        progress: 0,
        x: faceX,
        z: faceZ,
        target: currentLevel.doorTarget
      });
      return true;
    }
  }
  return false;
}

function clearDoors() {
  for (const door of doors) scene.remove(door.group);
  doors.length = 0;
}

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

function updateDoors(delta) {
  if (!doorTransitioning) {
    nextDoorTimer -= delta;
    if (nextDoorTimer <= 0 && doors.length < 1) {
      // if no valid wall was found nearby, retry again shortly
      nextDoorTimer = spawnDoor() ? 60 + Math.random() * 60 : 5;
    }
  }

  for (let i = doors.length - 1; i >= 0; i--) {
    const door = doors[i];
    const dist = Math.hypot(camera.position.x - door.x, camera.position.z - door.z);

    if (door.state === 'closed') {
      if (dist > 140) {
        scene.remove(door.group);
        doors.splice(i, 1);
        continue;
      }
      if (dist < 1.8) door.state = 'opening';
    } else if (door.state === 'opening') {
      door.progress += delta / 0.7;
      const t = Math.min(door.progress, 1);
      door.hinge.rotation.y = -1.9 * easeOutCubic(t);
      if (t >= 1) {
        door.state = 'open';
        beginLevelTransition(door.target);
      }
    }
  }
}

function beginLevelTransition(targetId) {
  if (doorTransitioning) return;
  doorTransitioning = true;
  fadeEl.classList.add('active');
  setTimeout(() => {
    setLevel(targetId);
    setTimeout(() => {
      fadeEl.classList.remove('active');
      doorTransitioning = false;
    }, 250);
  }, 650);
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

// ---------- Light flicker (levels with dodgy wiring only) ----------
let flickerTime = 0;

function updateFlicker(delta) {
  if (!currentLevel.flicker) {
    ambientLight.intensity = currentLevel.ambientIntensity;
    return;
  }
  if (flickerTime > 0) {
    flickerTime -= delta;
    ambientLight.intensity = 0.35 + Math.random() * 0.5;
    if (flickerTime <= 0) ambientLight.intensity = currentLevel.ambientIntensity;
  } else if (Math.random() < 0.002) {
    flickerTime = 0.15 + Math.random() * 0.35;
  }
}

// ---------- HUD ----------
const distanceEl = document.getElementById('distance');
let spawnX = camera.position.x;
let spawnZ = camera.position.z;
let hudTimer = 0;

function updateHUD(delta) {
  hudTimer += delta;
  if (hudTimer < 0.25) return;
  hudTimer = 0;
  distanceEl.textContent = Math.round(Math.hypot(camera.position.x - spawnX, camera.position.z - spawnZ));
}

// ---------- Level switching ----------
function setLevel(id) {
  currentLevel = LEVELS[id];

  // environment
  scene.background.setHex(currentLevel.fogColor);
  scene.fog.color.setHex(currentLevel.fogColor);
  scene.fog.near = currentLevel.fogNear;
  scene.fog.far = currentLevel.fogFar;
  ambientLight.color.setHex(currentLevel.ambientColor);
  ambientLight.intensity = currentLevel.ambientIntensity;
  hemiLight.color.setHex(currentLevel.hemiSky);
  hemiLight.groundColor.setHex(currentLevel.hemiGround);
  hemiLight.intensity = currentLevel.hemiIntensity;
  flickerTime = 0;

  // tear down the old world
  if (dialogActive) endDialog();
  for (const key of [...loadedChunks.keys()]) disposeChunk(key);
  clearWojaks();
  clearDoors();

  // fresh spawn on an always-open corridor lane
  camera.position.set(CELL / 2, EYE_HEIGHT, CELL / 2);
  player.velocity.set(0, 0, 0);
  lastPlayerChunkX = null;
  lastPlayerChunkZ = null;
  updateChunks();

  spawnX = camera.position.x;
  spawnZ = camera.position.z;
  if (levelNameEl) levelNameEl.textContent = currentLevel.hudName;
  nextWojakTimer = 15 + Math.random() * 20;
  nextDoorTimer = 25 + Math.random() * 30;
  applyHumForLevel();
}

// ---------- Game loop ----------
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.1);
  const isPlaying = isMobile ? gameStarted : controls.isLocked;

  if (isPlaying) {
    if (!dialogActive && !doorTransitioning) {
      updatePlayer(delta);
      updateWojaks(delta);
      updateDoors(delta);
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

updateChunks(); // build the initial 5x5 neighborhood
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
  isDialogActive: () => dialogActive,
  doors,
  spawnDoor,
  updateDoors,
  setLevel,
  getLevel: () => currentLevel.id,
  isTransitioning: () => doorTransitioning
};

console.log('🟨 The Backrooms loaded. There is no exit. (Or is there?)', isMobile ? '(Mobile mode)' : '(Desktop mode)');
