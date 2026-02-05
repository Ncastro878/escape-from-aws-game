import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// Detect mobile
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 800;

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a2a2a); // Dark gray for Doom vibe
scene.fog = new THREE.Fog(0x2a2a2a, 50, 150);  // Extended fog to see skyline backdrop

// Camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 2, 0);

// Camera rotation for mobile
let cameraYaw = 0;
let cameraPitch = 0;

// Renderer - optimized for performance
const renderer = new THREE.WebGLRenderer({ 
  antialias: false,  // Disabled for better performance
  powerPreference: 'high-performance'
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // Reduced from 2 for performance
renderer.shadowMap.enabled = false; // Disabled for better performance
document.body.appendChild(renderer.domElement);

// Pointer lock controls (desktop only)
const controls = new PointerLockControls(camera, document.body);

// Game state
let gameStarted = false;
let isFiring = false;

// Preload gun images
const gunIdleImg = new Image();
gunIdleImg.src = '/gun-idle.png';
const gunFireImg = new Image();
gunFireImg.src = '/gun-fire.png';

// UI elements
const blocker = document.getElementById('blocker');
const instructions = document.getElementById('instructions');
const mobileControls = document.getElementById('mobile-controls');

// Show appropriate instructions
if (isMobile) {
  document.getElementById('desktop-instructions').style.display = 'none';
  document.getElementById('mobile-instructions').style.display = 'block';
}

// Start game
blocker.addEventListener('click', startGame);
instructions.addEventListener('click', startGame);

function startGame() {
  // Show weapon sprite when game starts
  const weaponSprite = document.getElementById('weapon-sprite');
  if (weaponSprite) {
    weaponSprite.style.display = 'block';
  }
  
  if (isMobile) {
    blocker.style.display = 'none';
    mobileControls.classList.add('active');
    gameStarted = true;
  } else {
    controls.lock();
  }
}

// Player state
const player = {
  velocity: new THREE.Vector3(),
  direction: new THREE.Vector3(),
  onGround: true,
  speed: 10,  // Slower, more deliberate movement
  jumpForce: 15,
  health: 100,
  ammo: 30,
  walkCycle: 0,  // For walk hop timing
  lastHopTime: 0,  // Track when last hop happened
  hopInterval: 0.25  // Time between hops (seconds) - faster
};

controls.addEventListener('lock', () => {
  blocker.style.display = 'none';
  gameStarted = true;
  
  // Show weapon sprite
  const weaponSprite = document.getElementById('weapon-sprite');
  if (weaponSprite) {
    weaponSprite.style.display = 'block';
  }
});

controls.addEventListener('unlock', () => {
  if (player.health > 0) {
    blocker.style.display = 'flex';
    gameStarted = false;
  }
});

// Lighting - Doom-style darker atmosphere
const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4);
directionalLight.position.set(10, 20, 10);
directionalLight.castShadow = true;
scene.add(directionalLight);

// Texture loader
const textureLoader = new THREE.TextureLoader();

// ========== FLOOR ==========
const floorTexture = textureLoader.load('/models/floor-panel.png', 
  (texture) => {
    console.log('✅ Floor panel texture loaded!');
  },
  undefined,
  (err) => console.error('❌ Error loading floor texture:', err)
);

// Make the texture repeat as tiles
floorTexture.wrapS = THREE.RepeatWrapping;
floorTexture.wrapT = THREE.RepeatWrapping;
floorTexture.repeat.set(20, 20); // 20x20 tiles across the 200x200 floor

const floorGeometry = new THREE.PlaneGeometry(200, 200);
const floorMaterial = new THREE.MeshStandardMaterial({ 
  map: floorTexture,
  roughness: 0.9 
});
const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// ========== CEILING ==========
const ceilingTexture = textureLoader.load('/models/ceiling-panel.png', 
  (texture) => {
    console.log('✅ Ceiling panel texture loaded!');
  },
  undefined,
  (err) => console.error('❌ Error loading ceiling texture:', err)
);

// Make the texture repeat as tiles
ceilingTexture.wrapS = THREE.RepeatWrapping;
ceilingTexture.wrapT = THREE.RepeatWrapping;
ceilingTexture.repeat.set(20, 20); // Match floor tiling

const ceilingGeometry = new THREE.PlaneGeometry(200, 200);
const ceilingMaterial = new THREE.MeshStandardMaterial({ 
  map: ceilingTexture,
  roughness: 0.8,
  emissive: 0x112233,
  emissiveIntensity: 0.1 // Slight glow from the ceiling panels
});
const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
ceiling.rotation.x = Math.PI / 2;
ceiling.position.y = 4;
ceiling.receiveShadow = true;
scene.add(ceiling);

// Wall collision boxes
const wallColliders = [];

function addWallCollider(minX, maxX, minZ, maxZ) {
  wallColliders.push({ minX, maxX, minZ, maxZ });
}

// ========== SERVER RACK HALLWAYS (AWS OFFICE STYLE) ==========

// Load server rack wall texture
const serverRackTexture = textureLoader.load('/models/server-rack.png', 
  (texture) => {
    console.log('✅ Server rack texture loaded!');
  },
  undefined,
  (err) => console.error('❌ Error loading server rack texture:', err)
);

const awsPanelTexture = textureLoader.load('/models/aws-panel.png', 
  (texture) => {
    console.log('✅ AWS panel texture loaded!');
  },
  undefined,
  (err) => console.error('❌ Error loading AWS panel texture:', err)
);

const serverRackMaterial = new THREE.MeshStandardMaterial({ 
  map: serverRackTexture,
  roughness: 0.7,
  metalness: 0.3  // Add some metallic sheen for servers
});

const awsPanelMaterial = new THREE.MeshStandardMaterial({ 
  map: awsPanelTexture,
  roughness: 0.7,
  metalness: 0.3,
  emissive: 0x00aaaa,
  emissiveIntensity: 0.2  // Slight glow for AWS logo
});

// Size of each individual cubicle panel
const panelWidth = 3;  // Width of one panel
const wallHeight = 4;
const wallDepth = 0.3;

// Helper function to create a wall made of repeated panels
function createWall(startX, startZ, length, rotation = 0) {
  const numPanels = Math.ceil(length / panelWidth);
  const isVertical = rotation !== 0;
  
  for (let i = 0; i < numPanels; i++) {
    // 1 in 30 chance for AWS panel
    const useAWSPanel = Math.random() < (1 / 30);
    const material = useAWSPanel ? awsPanelMaterial : serverRackMaterial;
    
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(panelWidth, wallHeight, wallDepth),
      material
    );
    
    if (isVertical) {
      // Vertical wall (along Z axis)
      panel.position.set(startX, wallHeight / 2, startZ + (i * panelWidth) - length/2 + panelWidth/2);
      panel.rotation.y = rotation;
    } else {
      // Horizontal wall (along X axis)
      panel.position.set(startX + (i * panelWidth) - length/2 + panelWidth/2, wallHeight / 2, startZ);
    }
    
    panel.castShadow = true;
    panel.receiveShadow = true;
    scene.add(panel);
  }
  
  // Add collision box for entire wall (with padding)
  const padding = 0.5;
  if (rotation === 0) {
    // Horizontal wall
    addWallCollider(startX - length/2 - padding, startX + length/2 + padding, startZ - wallDepth/2 - padding, startZ + wallDepth/2 + padding);
  } else {
    // Vertical wall
    addWallCollider(startX - wallDepth/2 - padding, startX + wallDepth/2 + padding, startZ - length/2 - padding, startZ + length/2 + padding);
  }
}

// Create AWS server room hallways - expanded layout with multiple corridors
// Main horizontal corridor (with gaps for doorways)
createWall(-15, 10, 10, 0);   // North wall - left section
createWall(15, 10, 10, 0);    // North wall - right section
createWall(-15, -10, 10, 0);  // South wall - left section
createWall(15, -10, 10, 0);   // South wall - right section

// Main vertical corridor (with gaps for doorways)
createWall(10, -15, 10, Math.PI / 2);  // East wall - bottom section
createWall(10, 15, 10, Math.PI / 2);   // East wall - top section
createWall(-10, -15, 10, Math.PI / 2); // West wall - bottom section
createWall(-10, 15, 10, Math.PI / 2);  // West wall - top section

// Upper right server room complex
createWall(25, 15, 10, 0);
createWall(30, 20, 10, Math.PI / 2);
createWall(35, 25, 15, 0);  // Extended corridor
createWall(40, 30, 10, Math.PI / 2);

// Lower left server room complex
createWall(-25, -15, 10, 0);
createWall(-30, -20, 10, Math.PI / 2);
createWall(-35, -25, 15, 0);  // Extended corridor
createWall(-40, -30, 10, Math.PI / 2);

// Upper left quadrant - new server wing
createWall(-25, 15, 10, 0);
createWall(-30, 20, 10, Math.PI / 2);
createWall(-35, 25, 12, 0);
createWall(-30, 30, 8, Math.PI / 2);

// Lower right quadrant - new server wing
createWall(25, -15, 10, 0);
createWall(30, -20, 10, Math.PI / 2);
createWall(35, -25, 12, 0);
createWall(30, -30, 8, Math.PI / 2);

// Central connecting hallways
createWall(0, 25, 8, 0);   // North connector
createWall(0, -25, 8, 0);  // South connector
createWall(25, 0, 8, Math.PI / 2);  // East connector
createWall(-25, 0, 8, Math.PI / 2); // West connector

// Small alcoves for hiding spots
createWall(-5, 18, 6, 0);
createWall(5, -18, 6, 0);
createWall(18, -5, 6, Math.PI / 2);
createWall(-18, 5, 6, Math.PI / 2);

// === Additional hallways and corridors ===

// Secondary ring corridors (mid-range between center and perimeter)
createWall(-35, 35, 12, 0);   // North secondary corridor
createWall(35, 35, 12, 0);    // North secondary corridor (right)
createWall(-35, -35, 12, 0);  // South secondary corridor
createWall(35, -35, 12, 0);   // South secondary corridor (right)
createWall(35, -35, 12, Math.PI / 2);  // East secondary corridor
createWall(35, 35, 12, Math.PI / 2);   // East secondary corridor (top)
createWall(-35, -35, 12, Math.PI / 2); // West secondary corridor
createWall(-35, 35, 12, Math.PI / 2);  // West secondary corridor (top)

// Diagonal connector hallways
createWall(15, 30, 8, Math.PI / 4);    // NE diagonal
createWall(-15, 30, 8, -Math.PI / 4);  // NW diagonal
createWall(15, -30, 8, -Math.PI / 4);  // SE diagonal
createWall(-15, -30, 8, Math.PI / 4);  // SW diagonal

// Additional server rooms and chambers
// Far north wing
createWall(-8, 40, 6, 0);
createWall(8, 40, 6, 0);
createWall(-12, 43, 8, Math.PI / 2);
createWall(12, 43, 8, Math.PI / 2);

// Far south wing
createWall(-8, -40, 6, 0);
createWall(8, -40, 6, 0);
createWall(-12, -43, 8, Math.PI / 2);
createWall(12, -43, 8, Math.PI / 2);

// Far east wing
createWall(40, -8, 6, Math.PI / 2);
createWall(40, 8, 6, Math.PI / 2);
createWall(43, -12, 8, 0);
createWall(43, 12, 8, 0);

// Far west wing
createWall(-40, -8, 6, Math.PI / 2);
createWall(-40, 8, 6, Math.PI / 2);
createWall(-43, -12, 8, 0);
createWall(-43, 12, 8, 0);

// Zigzag corridor system in corners
// NE corner zigzag
createWall(32, 38, 6, 0);
createWall(38, 32, 6, Math.PI / 2);

// NW corner zigzag
createWall(-32, 38, 6, 0);
createWall(-38, 32, 6, Math.PI / 2);

// SE corner zigzag
createWall(32, -38, 6, 0);
createWall(38, -32, 6, Math.PI / 2);

// SW corner zigzag
createWall(-32, -38, 6, 0);
createWall(-38, -32, 6, Math.PI / 2);

// Inner maze sections
createWall(5, 5, 10, 0);
createWall(-5, 5, 10, 0);
createWall(5, -5, 10, 0);
createWall(-5, -5, 10, 0);

// More tactical positions
createWall(20, 20, 5, Math.PI / 2);
createWall(-20, 20, 5, Math.PI / 2);
createWall(20, -20, 5, Math.PI / 2);
createWall(-20, -20, 5, Math.PI / 2);

// Perimeter walls - outer boundary of server room
const boundaryDist = 50;
const boundaryLength = 100;

// North perimeter wall
createWall(0, boundaryDist, boundaryLength, 0);
// South perimeter wall
createWall(0, -boundaryDist, boundaryLength, 0);
// East perimeter wall
createWall(boundaryDist, 0, boundaryLength, Math.PI / 2);
// West perimeter wall
createWall(-boundaryDist, 0, boundaryLength, Math.PI / 2);

// ========== CITY SKYLINE BACKDROP ==========
const skylineTexture = textureLoader.load('/models/skyline.png', 
  (texture) => {
    console.log('✅ Skyline texture loaded!');
  },
  undefined,
  (err) => console.error('❌ Error loading skyline texture:', err)
);

// Make the texture tile/repeat if needed
skylineTexture.wrapS = THREE.RepeatWrapping;
skylineTexture.wrapT = THREE.ClampToEdgeWrapping;

const skylineMaterial = new THREE.MeshBasicMaterial({ 
  map: skylineTexture,
  side: THREE.DoubleSide,
  fog: false  // Don't let fog affect the skyline
});

const backdropDistance = 80;  // How far from center
const backdropWidth = 200;    // Width of each backdrop panel
const backdropHeight = 120;   // Tall skyline that fills the view

// Create backdrop planes for all 4 sides
function createBackdrop(x, z, rotationY) {
  const geometry = new THREE.PlaneGeometry(backdropWidth, backdropHeight);
  const backdrop = new THREE.Mesh(geometry, skylineMaterial);
  backdrop.position.set(x, backdropHeight / 2, z);  // Bottom at ground level, extends up to sky
  backdrop.rotation.y = rotationY;
  scene.add(backdrop);
}

// North backdrop (behind +Z)
createBackdrop(0, backdropDistance, Math.PI);
// South backdrop (behind -Z)
createBackdrop(0, -backdropDistance, 0);
// East backdrop (behind +X)
createBackdrop(backdropDistance, 0, -Math.PI / 2);
// West backdrop (behind -X)
createBackdrop(-backdropDistance, 0, Math.PI / 2);

// ========== ZOMBIES ==========
const zombies = [];
const zombieTextureLoader = new THREE.TextureLoader();
const zombieSpriteFrame1 = zombieTextureLoader.load('/zombie-1.png');
const zombieSpriteFrame2 = zombieTextureLoader.load('/zombie-2.png');
const zombieSpriteFrame3 = zombieTextureLoader.load('/zombie-3.png');

// Create sprite-based zombie
function createZombie(x, z) {
  const spriteMaterial = new THREE.SpriteMaterial({ 
    map: zombieSpriteFrame1,
    transparent: true
  });
  
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(2.1, 3.15, 1);  // 5% wider, 10% shorter
  sprite.position.set(x, 1.575, z);  // Adjust position for new height
  
  // Zombie AI properties (Doom-style)
  sprite.speed = 6; // Chase speed - faster!
  sprite.wanderSpeed = 2; // Faster when wandering
  sprite.state = 'idle'; // 'idle', 'chase', 'attack'
  sprite.direction = new THREE.Vector3(
    (Math.random() - 0.5) * 2,
    0,
    (Math.random() - 0.5) * 2
  ).normalize();
  sprite.changeDirectionTimer = Math.random() * 5;
  sprite.walkAnimationTime = Math.random() * Math.PI * 2;
  sprite.animationFrame = 0;
  sprite.health = 30;
  sprite.attackTimer = 0;
  sprite.attackCooldown = 2.0; // Disabled fireball shooting
  
  return sprite;
}

// Line of sight check (raycast to see if zombie can see player)
const raycaster = new THREE.Raycaster();
function hasLineOfSight(zombiePos, playerPos) {
  const direction = new THREE.Vector3();
  direction.subVectors(playerPos, zombiePos);
  const distance = direction.length();
  direction.normalize();
  
  raycaster.set(zombiePos, direction);
  raycaster.far = distance;
  
  // Check if ray hits any walls (we don't have wall meshes, so check collision boxes)
  // Simple approximation: if player is close and no wall between, can see
  const steps = Math.ceil(distance / 0.5);
  for (let i = 1; i < steps; i++) {
    const testX = zombiePos.x + direction.x * (distance / steps) * i;
    const testZ = zombiePos.z + direction.z * (distance / steps) * i;
    if (checkWallCollision(testX, testZ)) {
      return false; // Wall blocking view
    }
  }
  return true;
}

// Spawn zombies around the expanded server room (reduced for performance)
for (let i = 0; i < 18; i++) {
  const x = (Math.random() - 0.5) * 80;  // Much larger spawn area for all the new hallways
  const z = (Math.random() - 0.5) * 80;
  const zombie = createZombie(x, z);
  zombies.push(zombie);
  scene.add(zombie);
}

// Update zombies (Doom-style AI)
function updateZombies(delta) {
  for (let i = zombies.length - 1; i >= 0; i--) {
    const zombie = zombies[i];
    
    // Remove dead zombies
    if (zombie.health <= 0) {
      // Play zombie death sound
      const zombieDeathSound = document.getElementById('zombie-death-sound');
      if (zombieDeathSound) {
        zombieDeathSound.currentTime = 0;
        zombieDeathSound.volume = 0.5;
        zombieDeathSound.play().catch(e => console.log('Zombie death sound failed:', e));
      }
      
      scene.remove(zombie);
      zombies.splice(i, 1);
      continue;
    }
    
    const distToPlayer = zombie.position.distanceTo(camera.position);
    
    // Zombie touch damage
    if (distToPlayer < 1.5) {
      // Add damage cooldown to prevent rapid damage
      if (!zombie.lastDamageTime || Date.now() - zombie.lastDamageTime > 500) {
        player.health -= 3;
        document.getElementById('health').textContent = Math.round(player.health);
        zombie.lastDamageTime = Date.now();
        
        // Play zombie attack sound (40% chance to play voice instead)
        const playVoice = Math.random() < 0.4;
        if (playVoice) {
          // Randomly pick between the two voice lines (EC2 and Lambda)
          const voiceChoice = Math.random() < 0.5 ? 'zombie-voice2-sound' : 'zombie-voice3-sound';
          const zombieVoiceSound = document.getElementById(voiceChoice);
          if (zombieVoiceSound) {
            zombieVoiceSound.currentTime = 0;
            zombieVoiceSound.volume = 0.6;
            zombieVoiceSound.play().catch(e => console.log('Zombie voice sound failed:', e));
          }
        } else {
          const zombieAttackSound = document.getElementById('zombie-attack-sound');
          if (zombieAttackSound) {
            zombieAttackSound.currentTime = 0;
            zombieAttackSound.volume = 0.5;
            zombieAttackSound.play().catch(e => console.log('Zombie attack sound failed:', e));
          }
        }
        
        // Visual feedback
        const damageFlash = document.getElementById('damage-flash');
        if (damageFlash) {
          damageFlash.classList.add('active');
          setTimeout(() => damageFlash.classList.remove('active'), 150);
        }
      }
    }
    
    // === AI STATE MACHINE ===
    
    // Check if zombie can see player (within 30 units and line of sight)
    if (zombie.state === 'idle' && distToPlayer < 30) {
      if (hasLineOfSight(zombie.position, camera.position)) {
        zombie.state = 'chase'; // Alert! Player spotted
      }
    }
    
    // State behaviors
    if (zombie.state === 'idle') {
      // Wander randomly
      zombie.changeDirectionTimer -= delta;
      if (zombie.changeDirectionTimer <= 0) {
        zombie.direction.set(
          (Math.random() - 0.5) * 2,
          0,
          (Math.random() - 0.5) * 2
        ).normalize();
        zombie.changeDirectionTimer = 3 + Math.random() * 4;
      }
      
      const moveSpeed = zombie.wanderSpeed * delta;
      const newX = zombie.position.x + zombie.direction.x * moveSpeed;
      const newZ = zombie.position.z + zombie.direction.z * moveSpeed;
      
      if (!checkWallCollision(newX, newZ) && Math.abs(newX) < 35 && Math.abs(newZ) < 35) {
        zombie.position.x = newX;
        zombie.position.z = newZ;
      } else {
        zombie.direction.multiplyScalar(-1);
        zombie.changeDirectionTimer = 1;
      }
    }
    else if (zombie.state === 'chase') {
      const minDistance = 2.0; // Minimum distance to stay visible
      
      // Chase player but stop at minimum distance
      if (distToPlayer > minDistance) {
        zombie.direction.subVectors(camera.position, zombie.position);
        zombie.direction.y = 0;
        zombie.direction.normalize();
        
        const moveSpeed = zombie.speed * delta;
        const newX = zombie.position.x + zombie.direction.x * moveSpeed;
        const newZ = zombie.position.z + zombie.direction.z * moveSpeed;
        
        if (!checkWallCollision(newX, newZ)) {
          zombie.position.x = newX;
          zombie.position.z = newZ;
        }
      }
      // If too close (somehow got past minimum), back up slightly
      else if (distToPlayer < minDistance - 0.5) {
        zombie.direction.subVectors(zombie.position, camera.position);
        zombie.direction.y = 0;
        zombie.direction.normalize();
        
        const moveSpeed = zombie.speed * delta * 0.3;
        const newX = zombie.position.x + zombie.direction.x * moveSpeed;
        const newZ = zombie.position.z + zombie.direction.z * moveSpeed;
        
        if (!checkWallCollision(newX, newZ)) {
          zombie.position.x = newX;
          zombie.position.z = newZ;
        }
      }
    }
    
    // Walking animation (sprite frame swap only, no bobbing)
    zombie.walkAnimationTime += delta * 2;
    
    // Swap sprite frames (cycle through 3 frames)
    const frameTime = 0.8;
    const currentFrame = Math.floor(zombie.walkAnimationTime / frameTime) % 3;
    if (currentFrame !== zombie.animationFrame) {
      zombie.animationFrame = currentFrame;
      if (currentFrame === 0) {
        zombie.material.map = zombieSpriteFrame1;
      } else if (currentFrame === 1) {
        zombie.material.map = zombieSpriteFrame2;
      } else {
        zombie.material.map = zombieSpriteFrame3;
      }
      zombie.material.needsUpdate = true;
    }
    
    // Always face camera (billboard sprite)
    zombie.lookAt(camera.position.x, zombie.position.y, camera.position.z);
  }
}

// ========== HEALTH PACKS ==========
const healthPacks = [];
const healthPackTexture = textureLoader.load('/health-pack.png');

function createHealthPack(x, z) {
  const spriteMaterial = new THREE.SpriteMaterial({ 
    map: healthPackTexture,
    transparent: true
  });
  
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(1.5, 1.5, 1);
  sprite.position.set(x, 1, z);
  sprite.bobTime = Math.random() * Math.PI * 2; // For floating animation
  
  return sprite;
}

// Spawn health packs around the map
const healthPackPositions = [
  [10, 10], [-10, 10], [10, -10], [-10, -10],
  [20, 0], [-20, 0], [0, 20], [0, -20],
  [15, 15], [-15, -15], [15, -15], [-15, 15]
];

healthPackPositions.forEach(pos => {
  const pack = createHealthPack(pos[0], pos[1]);
  healthPacks.push(pack);
  scene.add(pack);
});

function updateHealthPacks(delta) {
  for (let i = healthPacks.length - 1; i >= 0; i--) {
    const pack = healthPacks[i];
    
    // Floating animation
    pack.bobTime += delta * 2;
    pack.position.y = 1 + Math.sin(pack.bobTime) * 0.2;
    
    // Always face camera (billboard)
    pack.lookAt(camera.position);
    
    // Check if player picks it up
    const distToPlayer = pack.position.distanceTo(camera.position);
    if (distToPlayer < 2) {
      // Restore health to 100!
      if (player.health < 100) {
        player.health = 100;
        document.getElementById('health').textContent = '100';
        
        // Play health pack pickup sound
        const healthPackSound = document.getElementById('health-pack-sound');
        if (healthPackSound) {
          healthPackSound.currentTime = 0;
          healthPackSound.volume = 0.6;
          healthPackSound.play().catch(e => console.log('Health pack sound failed:', e));
        }
        
        // Green flash effect!
        const healFlash = document.getElementById('heal-flash');
        if (healFlash) {
          healFlash.classList.add('active');
          setTimeout(() => healFlash.classList.remove('active'), 300);
        }
        
        // Remove the health pack
        scene.remove(pack);
        healthPacks.splice(i, 1);
      }
    }
  }
}

// ========== NPC SYSTEM ==========
const npcs = [];
let currentNPC = null;
let dialogActive = false;
let dialogIndex = 0;
let lastDialogAdvanceTime = 0;
const dialogAdvanceCooldown = 500; // 500ms cooldown between advances

const npcTextureLoader = new THREE.TextureLoader();
const npcHoodieTexture = npcTextureLoader.load('/npc-hoodie-guy.png', (texture) => {
  texture.format = THREE.RGBAFormat;
  texture.needsUpdate = true;
});
const npcPepeTexture = npcTextureLoader.load('/npc-pepe.png', (texture) => {
  texture.format = THREE.RGBAFormat;
  texture.needsUpdate = true;
});

function createNPC(x, z, name, dialogLines, texture = npcHoodieTexture) {
  const spriteMaterial = new THREE.SpriteMaterial({ 
    map: texture,
    transparent: true,
    alphaTest: 0.5,
    depthWrite: false
  });
  
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(2.5, 3.5, 1);
  sprite.position.set(x, 1.75, z);
  
  sprite.npcName = name;
  sprite.dialogLines = dialogLines;
  sprite.canInteract = false;
  sprite.npcTexture = texture; // Store texture for portrait
  
  return sprite;
}

// Spawn the hoodie guy NPC - spawn in open area away from walls
const hoodieGuy = createNPC(8, 0, "Wojak", [
  "Hey... you made it.",
  "This place... it's not what it seems.",
  "The servers hold secrets. Dark ones.",
  "Stay sharp out there."
]);
npcs.push(hoodieGuy);
scene.add(hoodieGuy);

// Spawn Pepe NPC
const pepe = createNPC(-8, 0, "Pepe", [
  "Feels good man...",
  "These zombies are getting out of hand.",
  "I used to work here... before the incident.",
  "Stay frosty, anon."
], npcPepeTexture);
npcs.push(pepe);
scene.add(pepe);

function updateNPCs() {
  for (const npc of npcs) {
    // Always face camera (billboard)
    npc.lookAt(camera.position);
    
    // Check distance to player
    const distToPlayer = npc.position.distanceTo(camera.position);
    
    // Auto-start dialog when player gets close
    if (distToPlayer < 3 && !dialogActive && !npc.hasSpoken) {
      npc.canInteract = true;
      currentNPC = npc;
      startDialog(npc);
      npc.hasSpoken = true; // Mark as spoken so dialog doesn't loop
    }
  }
}

function startDialog(npc) {
  dialogActive = true;
  dialogIndex = 0;
  currentNPC = npc;
  lastDialogAdvanceTime = 0; // Reset cooldown for new dialog
  showDialogLine();
}

function showDialogLine() {
  const dialogBox = document.getElementById('npc-dialog-box');
  const npcPortrait = document.getElementById('npc-portrait');
  const npcName = document.getElementById('npc-name');
  const npcText = document.getElementById('npc-text');
  
  if (dialogBox && currentNPC) {
    dialogBox.classList.add('active');
    // Set portrait based on NPC name
    if (currentNPC.npcName === 'Pepe') {
      npcPortrait.src = '/npc-pepe.png';
    } else {
      npcPortrait.src = '/npc-hoodie-guy.png';
    }
    npcName.textContent = currentNPC.npcName;
    npcText.textContent = currentNPC.dialogLines[dialogIndex];
  }
}

function advanceDialog() {
  if (!currentNPC) return;
  
  // Check cooldown to prevent rapid clicking
  const now = Date.now();
  if (now - lastDialogAdvanceTime < dialogAdvanceCooldown) {
    return; // Too soon, ignore
  }
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
  if (dialogBox) {
    dialogBox.classList.remove('active');
  }
}

// Handle E key for interaction
document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyE') {
    if (dialogActive) {
      advanceDialog();
    }
  }
});

// Handle click/tap on dialog box to advance
document.addEventListener('click', (e) => {
  const dialogBox = document.getElementById('npc-dialog-box');
  if (dialogActive && dialogBox && dialogBox.contains(e.target)) {
    e.stopPropagation(); // Prevent shooting
    advanceDialog();
  }
});

// Handle mobile tap on dialog box
document.addEventListener('touchstart', (e) => {
  const dialogBox = document.getElementById('npc-dialog-box');
  if (dialogActive && dialogBox && dialogBox.contains(e.target)) {
    e.preventDefault();
    e.stopPropagation();
    advanceDialog();
  }
});

// ========== BALD VILLAINS ==========
const villains = [];
const villainWalk1Texture = textureLoader.load('/models/bald-villain-walk1.png');
const villainWalk2Texture = textureLoader.load('/models/bald-villain-walk2.png');
const villainPunchTexture = textureLoader.load('/models/bald-villain-punch.png');

// Create sprite-based villain
function createVillain(x, z) {
  const spriteMaterial = new THREE.SpriteMaterial({ 
    map: villainWalk1Texture,
    transparent: true
  });
  
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(2.5, 3.5, 1);  // Intimidating size
  sprite.position.set(x, 1.75, z);
  
  // Villain AI properties
  sprite.speed = 4; // Faster chase speed
  sprite.state = 'chase'; // Always aggressive
  sprite.direction = new THREE.Vector3();
  sprite.walkAnimationTime = Math.random() * Math.PI * 2;
  sprite.animationFrame = 0;
  sprite.health = 50; // Tougher than zombies
  sprite.attackTimer = 0;
  sprite.attackCooldown = 1.5; // Punches every 1.5 seconds
  sprite.isPunching = false;
  sprite.punchDuration = 0; // Track how long punch animation has been showing
  
  return sprite;
}

// Spawn villains (fewer than zombies, more dangerous) - reduced for performance
for (let i = 0; i < 6; i++) {
  const x = (Math.random() - 0.5) * 80;
  const z = (Math.random() - 0.5) * 80;
  const villain = createVillain(x, z);
  villains.push(villain);
  scene.add(villain);
}

// Update villains
function updateVillains(delta) {
  for (let i = villains.length - 1; i >= 0; i--) {
    const villain = villains[i];
    
    // Remove dead villains
    if (villain.health <= 0) {
      // Play death sound
      const deathSound = document.getElementById('villain-death-sound');
      if (deathSound) {
        deathSound.currentTime = 0;
        deathSound.volume = 0.5;
        deathSound.play().catch(e => console.log('Villain death sound failed:', e));
      }
      
      scene.remove(villain);
      villains.splice(i, 1);
      continue;
    }
    
    const distToPlayer = villain.position.distanceTo(camera.position);
    
    // Handle punch animation duration
    if (villain.isPunching) {
      villain.punchDuration += delta;
      // After 1 second, return to walking
      if (villain.punchDuration >= 1.0) {
        villain.isPunching = false;
        villain.punchDuration = 0;
      }
    }
    
    // Always chase player
    if (distToPlayer <= 3 && !villain.isPunching) {
      // PUNCH RANGE - switch to punch sprite and attack
      villain.attackTimer += delta;
      if (villain.attackTimer >= villain.attackCooldown) {
        villain.isPunching = true;
        villain.punchDuration = 0;
        villain.material.map = villainPunchTexture;
        villain.material.needsUpdate = true;
        
        // Deal melee damage
        player.health -= 15; // Heavy punch!
        document.getElementById('health').textContent = Math.round(player.health);
        
        // Play punch sound effect (60% chance to play voice instead)
        const playVoice = Math.random() < 0.6;
        if (playVoice) {
          // Randomly pick between the two villain voice lines
          const voiceChoice = Math.random() < 0.5 ? 'villain-voice-sound' : 'villain-voice2-sound';
          const villainVoiceSound = document.getElementById(voiceChoice);
          if (villainVoiceSound) {
            villainVoiceSound.currentTime = 0;
            villainVoiceSound.volume = 0.7;
            villainVoiceSound.play().catch(e => console.log('Villain voice sound failed:', e));
          }
        } else {
          const punchSound = document.getElementById('zombie-punch-sound');
          if (punchSound) {
            punchSound.currentTime = 0;
            punchSound.volume = 0.6;
            punchSound.play().catch(e => console.log('Punch sound failed:', e));
          }
        }
        
        // Visual feedback
        const damageFlash = document.getElementById('damage-flash');
        if (damageFlash) {
          damageFlash.classList.add('active');
          setTimeout(() => damageFlash.classList.remove('active'), 150);
        }
        
        villain.attackTimer = 0;
      }
    }
    
    // CHASE or continue walking during punch animation
    if (!villain.isPunching) {
      villain.direction.subVectors(camera.position, villain.position);
      villain.direction.y = 0;
      villain.direction.normalize();
      
      // Only move if not too close to player (prevents disappearing behind camera)
      const minDistance = 2.5; // Stay at least this far from player
      if (distToPlayer > minDistance) {
        const moveSpeed = villain.speed * delta;
        const newX = villain.position.x + villain.direction.x * moveSpeed;
        const newZ = villain.position.z + villain.direction.z * moveSpeed;
        
        if (!checkWallCollision(newX, newZ)) {
          villain.position.x = newX;
          villain.position.z = newZ;
        }
      }
      
      // Walking animation (alternate between walk1 and walk2)
      villain.walkAnimationTime += delta * 4;
      const frameTime = 0.4;
      const currentFrame = Math.floor(villain.walkAnimationTime / frameTime) % 2;
      
      if (currentFrame !== villain.animationFrame) {
        villain.animationFrame = currentFrame;
        villain.material.map = currentFrame === 0 ? villainWalk1Texture : villainWalk2Texture;
        villain.material.needsUpdate = true;
      }
    }
    
    // Always face camera (billboard sprite)
    villain.lookAt(camera.position.x, villain.position.y, camera.position.z);
  }
}

// ========== FLYING BOSS (ZUCKERBERG) ==========
const flyingBosses = [];
const flyingBossProjectiles = [];

const zuckIdle1Texture = textureLoader.load('/models/zuck-idle1.png', (texture) => {
  texture.format = THREE.RGBAFormat;
  texture.needsUpdate = true;
});
const zuckIdle2Texture = textureLoader.load('/models/zuck-idle2.png', (texture) => {
  texture.format = THREE.RGBAFormat;
  texture.needsUpdate = true;
});
const zuckShootTexture = textureLoader.load('/models/zuck-shoot.png', (texture) => {
  texture.format = THREE.RGBAFormat;
  texture.needsUpdate = true;
});

// Create flying boss
function createFlyingBoss(x, z) {
  const spriteMaterial = new THREE.SpriteMaterial({ 
    map: zuckIdle1Texture,
    transparent: true,
    alphaTest: 0.1,
    depthWrite: false
  });
  
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(4, 4, 1);  // Larger, intimidating
  sprite.position.set(x, 1.8, z);  // Float in the air
  
  // Boss AI properties
  sprite.speed = 5;
  sprite.health = 150; // Boss-tier health
  sprite.attackTimer = 0;
  sprite.attackCooldown = 2.0; // Shoot every 2 seconds
  sprite.isShooting = false;
  sprite.shootDuration = 0;
  sprite.hoverTime = Math.random() * Math.PI * 2; // For bobbing animation
  sprite.animationFrame = 0;
  sprite.animationTime = Math.random() * Math.PI * 2;
  
  return sprite;
}

// Spawn a few flying bosses - reduced for performance
for (let i = 0; i < 3; i++) {
  const x = (Math.random() - 0.5) * 60;
  const z = (Math.random() - 0.5) * 60;
  const boss = createFlyingBoss(x, z);
  flyingBosses.push(boss);
  scene.add(boss);
}

// Update flying bosses
function updateFlyingBosses(delta) {
  for (let i = flyingBosses.length - 1; i >= 0; i--) {
    const boss = flyingBosses[i];
    
    // Remove dead bosses
    if (boss.health <= 0) {
      const deathSound = document.getElementById('villain-death-sound');
      if (deathSound) {
        deathSound.currentTime = 0;
        deathSound.volume = 0.7;
        deathSound.play().catch(e => console.log('Boss death failed:', e));
      }
      scene.remove(boss);
      flyingBosses.splice(i, 1);
      continue;
    }
    
    const distToPlayer = boss.position.distanceTo(camera.position);
    
    // Floating animation (bob up and down)
    boss.hoverTime += delta * 2;
    boss.position.y = 1.8 + Math.sin(boss.hoverTime) * 0.3;
    
    // Shoot at player
    boss.attackTimer += delta;
    if (distToPlayer < 40 && boss.attackTimer >= boss.attackCooldown) {
      // Shoot!
      boss.isShooting = true;
      boss.shootDuration = 0;
      boss.material.map = zuckShootTexture;
      boss.material.needsUpdate = true;
      
      // Create projectile
      const projectile = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 8, 8),
        new THREE.MeshBasicMaterial({ 
          color: 0xff0000,
          emissive: 0xff0000,
          emissiveIntensity: 1
        })
      );
      projectile.position.copy(boss.position);
      
      // Direction toward player
      const direction = new THREE.Vector3();
      direction.subVectors(camera.position, boss.position);
      direction.normalize();
      projectile.velocity = direction.multiplyScalar(20); // Fast projectile
      projectile.lifetime = 5;
      
      flyingBossProjectiles.push(projectile);
      scene.add(projectile);
      
      // Play sound
      const gunshotSound = document.getElementById('gunshot-sound');
      if (gunshotSound) {
        gunshotSound.currentTime = 0;
        gunshotSound.volume = 0.5;
        gunshotSound.play().catch(e => console.log('Boss shot failed:', e));
      }
      
      boss.attackTimer = 0;
    }
    
    // Handle shoot animation
    if (boss.isShooting) {
      boss.shootDuration += delta;
      if (boss.shootDuration >= 0.3) {
        boss.isShooting = false;
        boss.shootDuration = 0;
      }
    }
    
    // Idle animation when not shooting
    if (!boss.isShooting) {
      boss.animationTime += delta * 1.5;
      const frameTime = 1.0;  // Slower alternation
      const currentFrame = Math.floor(boss.animationTime / frameTime) % 2;
      
      if (currentFrame !== boss.animationFrame) {
        boss.animationFrame = currentFrame;
        boss.material.map = currentFrame === 0 ? zuckIdle1Texture : zuckIdle2Texture;
        boss.material.needsUpdate = true;
      }
    }
    
    // Fly toward player aggressively
    const direction = new THREE.Vector3();
    direction.subVectors(camera.position, boss.position);
    direction.y = 0;
    direction.normalize();
    
    const minDistance = 4; // Fly much closer
    if (distToPlayer > minDistance) {
      const moveSpeed = boss.speed * delta;
      const newX = boss.position.x + direction.x * moveSpeed;
      const newZ = boss.position.z + direction.z * moveSpeed;
      
      if (!checkWallCollision(newX, newZ)) {
        boss.position.x = newX;
        boss.position.z = newZ;
      }
    }
    
    // Always face camera
    boss.lookAt(camera.position.x, boss.position.y, camera.position.z);
  }
}

// Update boss projectiles
function updateFlyingBossProjectiles(delta) {
  for (let i = flyingBossProjectiles.length - 1; i >= 0; i--) {
    const projectile = flyingBossProjectiles[i];
    projectile.position.add(projectile.velocity.clone().multiplyScalar(delta));
    projectile.lifetime -= delta;
    
    // Remove if expired or hit wall
    if (projectile.lifetime <= 0 || checkWallCollision(projectile.position.x, projectile.position.z)) {
      scene.remove(projectile);
      flyingBossProjectiles.splice(i, 1);
      continue;
    }
    
    // Check if hit player
    if (projectile.position.distanceTo(camera.position) < 1.5) {
      player.health -= 20; // Heavy damage
      document.getElementById('health').textContent = Math.round(player.health);
      
      // Visual feedback
      const damageFlash = document.getElementById('damage-flash');
      if (damageFlash) {
        damageFlash.classList.add('active');
        setTimeout(() => damageFlash.classList.remove('active'), 150);
      }
      
      scene.remove(projectile);
      flyingBossProjectiles.splice(i, 1);
    }
  }
}

// ========== LIGHTING (Doom-style overhead) ==========
// Add point lights along the corridors
const lightPositions = [
  [0, 0], [15, 0], [-15, 0],
  [0, 15], [0, -15],
  [25, 20], [-25, -20]
];

lightPositions.forEach(pos => {
  const light = new THREE.PointLight(0xffaa66, 1.5, 25);
  light.position.set(pos[0], 5, pos[1]);
  light.castShadow = true;
  scene.add(light);
  
  // Visible bulb
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 8, 8),
    new THREE.MeshStandardMaterial({ 
      color: 0xffaa66,
      emissive: 0xffaa66,
      emissiveIntensity: 1
    })
  );
  bulb.position.set(pos[0], 5, pos[1]);
  scene.add(bulb);
});

// ========== MOVEMENT ==========
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

// Wall collision check
const playerRadius = 0.5;
function checkWallCollision(x, z) {
  for (const wall of wallColliders) {
    if (x + playerRadius > wall.minX && x - playerRadius < wall.maxX &&
        z + playerRadius > wall.minZ && z - playerRadius < wall.maxZ) {
      return true;
    }
  }
  return false;
}

// ========== SHOOTING ==========
const bullets = [];
const bulletGeometry = new THREE.BoxGeometry(0.4, 0.4, 0.8);
const bulletMaterial = new THREE.MeshBasicMaterial({ 
  color: 0xffff00,
  emissive: 0xffff00,
  emissiveIntensity: 1,
  transparent: true,
  opacity: 0
});

// Blood particles - optimized with shared material
const bloodParticles = [];
const bloodGeometry = new THREE.SphereGeometry(0.04, 3, 3); // Simpler geometry for performance

function createBloodSplatter(position) {
  // Create fewer particles (5-8 instead of 8-12) for better performance
  const numParticles = 5 + Math.floor(Math.random() * 4);
  for (let i = 0; i < numParticles; i++) {
    // Share material but clone it for individual opacity
    const particleMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xff0000,
      transparent: true,
      opacity: 1
    });
    const particle = new THREE.Mesh(bloodGeometry, particleMaterial);
    particle.position.copy(position);
    
    // Random velocity in all directions
    particle.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 10
    );
    particle.lifetime = 0.5 + Math.random() * 0.3; // 0.5-0.8 seconds
    
    bloodParticles.push(particle);
    scene.add(particle);
  }
}

function updateBloodParticles(delta) {
  for (let i = bloodParticles.length - 1; i >= 0; i--) {
    const particle = bloodParticles[i];
    
    // Move particle
    particle.position.add(particle.velocity.clone().multiplyScalar(delta));
    
    // Gravity
    particle.velocity.y -= 20 * delta;
    
    // Fade out
    particle.lifetime -= delta;
    particle.material.opacity = particle.lifetime / 0.8;
    
    if (particle.lifetime <= 0) {
      scene.remove(particle);
      bloodParticles.splice(i, 1);
    }
  }
}

// ========== ZOMBIE FIREBALLS ==========
const fireballs = [];
const fireballGeometry = new THREE.SphereGeometry(0.3, 12, 12);
const fireballMaterial = new THREE.MeshBasicMaterial({ 
  color: 0xff4400,
  emissive: 0xff4400,
  emissiveIntensity: 1
});

function shoot() {
  // Don't shoot when dialog is active
  if (dialogActive) return;
  
  const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
  bullet.position.copy(camera.position);
  
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  bullet.velocity = direction.multiplyScalar(100);
  bullet.lifetime = 2;
  
  bullets.push(bullet);
  scene.add(bullet);
  
  document.getElementById('ammo').textContent = '∞';
  
  // Play gunshot sound effect
  const gunshotSound = document.getElementById('gunshot-sound');
  if (gunshotSound) {
    gunshotSound.currentTime = 0; // Reset to start for rapid fire
    gunshotSound.volume = 0.4; // Set volume
    gunshotSound.play().catch(e => console.log('Gunshot sound failed:', e));
  }
  
  // Show firing sprite - use preloaded images
  const weaponSprite = document.getElementById('weapon-sprite');
  if (weaponSprite) {
    // Switch to firing image
    weaponSprite.src = gunFireImg.src;
    weaponSprite.style.transform = 'translateX(-50%) scale(1.1)';
    
    setTimeout(() => {
      weaponSprite.src = gunIdleImg.src;
      weaponSprite.style.transform = 'translateX(-50%) scale(1)';
    }, 130);
  }
}

document.addEventListener('click', () => {
  if (!isMobile && controls.isLocked && !dialogActive) shoot();
});

function updateBullets(delta) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    bullet.position.add(bullet.velocity.clone().multiplyScalar(delta));
    bullet.lifetime -= delta;
    
    // Rotate bullet for retro effect
    bullet.rotation.x += delta * 10;
    bullet.rotation.y += delta * 15;

    if (bullet.lifetime <= 0 || checkWallCollision(bullet.position.x, bullet.position.z)) {
      scene.remove(bullet);
      bullets.splice(i, 1);
      continue;
    }
    
    // Check if bullet hits zombie
    for (const zombie of zombies) {
      if (bullet.position.distanceTo(zombie.position) < 1.5) {
        zombie.health -= 10;
        
        // Blood splatter effect
        createBloodSplatter(zombie.position.clone());
        
        // Flash red on hit
        zombie.material.color.setHex(0xff0000);
        setTimeout(() => zombie.material.color.setHex(0xffffff), 100);
        
        scene.remove(bullet);
        bullets.splice(i, 1);
        break;
      }
    }
    
    // Check if bullet hits villain
    for (const villain of villains) {
      if (bullet.position.distanceTo(villain.position) < 1.5) {
        villain.health -= 10;
        
        // Blood splatter effect
        createBloodSplatter(villain.position.clone());
        
        // Flash red on hit
        villain.material.color.setHex(0xff0000);
        setTimeout(() => villain.material.color.setHex(0xffffff), 100);
        
        scene.remove(bullet);
        bullets.splice(i, 1);
        break;
      }
    }
    
    // Check if bullet hits flying boss
    for (const boss of flyingBosses) {
      if (bullet.position.distanceTo(boss.position) < 2) {
        boss.health -= 10;
        
        // Blood splatter effect
        createBloodSplatter(boss.position.clone());
        
        // Flash red on hit
        boss.material.color.setHex(0xff0000);
        setTimeout(() => boss.material.color.setHex(0xffffff), 100);
        
        scene.remove(bullet);
        bullets.splice(i, 1);
        break;
      }
    }
  }
}

function updateFireballs(delta) {
  for (let i = fireballs.length - 1; i >= 0; i--) {
    const fireball = fireballs[i];
    fireball.position.add(fireball.velocity.clone().multiplyScalar(delta));
    fireball.lifetime -= delta;
    
    // Rotate fireball for effect
    fireball.rotation.x += delta * 5;
    fireball.rotation.y += delta * 3;

    if (fireball.lifetime <= 0 || checkWallCollision(fireball.position.x, fireball.position.z)) {
      scene.remove(fireball);
      fireballs.splice(i, 1);
      continue;
    }
    
    // Check if fireball hits player
    if (fireball.position.distanceTo(camera.position) < 1.5) {
      player.health -= 5; // 5 damage per fireball
      document.getElementById('health').textContent = Math.round(player.health);
      
      // Visual feedback
      const damageFlash = document.getElementById('damage-flash');
      if (damageFlash) {
        damageFlash.classList.add('active');
        setTimeout(() => damageFlash.classList.remove('active'), 150);
      }
      
      scene.remove(fireball);
      fireballs.splice(i, 1);
    }
  }
}

// ========== MOBILE CONTROLS ==========
const joystickZone = document.getElementById('joystick-zone');
const joystickStick = document.getElementById('joystick-stick');
let joystickActive = false;
let joystickStartX = 0, joystickStartY = 0;
const joystickMaxDist = 40;

if (isMobile && joystickZone) {
  joystickZone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    joystickActive = true;
    const touch = e.touches[0];
    joystickStartX = touch.clientX;
    joystickStartY = touch.clientY;
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
    const dx = touch.clientX - lastLookX;
    const dy = touch.clientY - lastLookY;
    
    cameraYaw -= dx * lookSensitivity;
    cameraPitch -= dy * lookSensitivity;
    cameraPitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, cameraPitch));
    
    lastLookX = touch.clientX;
    lastLookY = touch.clientY;
  });

  lookZone.addEventListener('touchend', () => {
    lookActive = false;
  });
}

const shootBtn = document.getElementById('shoot-btn');
if (isMobile && shootBtn) {
  shootBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (gameStarted && !dialogActive) shoot();
  });
}

let turningLeft = false;
let turningRight = false;
const turnSpeed = 2.5;

const turnLeftBtn = document.getElementById('turn-left');
const turnRightBtn = document.getElementById('turn-right');

if (isMobile && turnLeftBtn) {
  turnLeftBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    turningLeft = true;
  });
  turnLeftBtn.addEventListener('touchend', () => {
    turningLeft = false;
  });
}

if (isMobile && turnRightBtn) {
  turnRightBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    turningRight = true;
  });
  turnRightBtn.addEventListener('touchend', () => {
    turningRight = false;
  });
}

// ========== PLAYER UPDATE ==========
const clock = new THREE.Clock();

function updatePlayer(delta) {
  // Gravity
  player.velocity.y -= 30 * delta;

  if (camera.position.y <= 2) {
    camera.position.y = 2;
    player.velocity.y = 0;
    player.onGround = true;
  } else {
    player.onGround = false;
  }

  // Mobile camera rotation
  if (isMobile) {
    if (turningLeft) cameraYaw += turnSpeed * delta;
    if (turningRight) cameraYaw -= turnSpeed * delta;
    
    camera.rotation.order = 'YXZ';
    camera.rotation.y = cameraYaw;
    camera.rotation.x = cameraPitch;
  }

  // Movement
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
    
    if (!checkWallCollision(newX, camera.position.z)) {
      camera.position.x = newX;
    }
    if (!checkWallCollision(camera.position.x, newZ)) {
      camera.position.z = newZ;
    }
  } else {
    const oldX = camera.position.x;
    const oldZ = camera.position.z;
    
    if (keys.forward || keys.backward) {
      controls.moveForward(player.direction.z * player.speed * delta);
    }
    if (keys.left || keys.right) {
      controls.moveRight(player.direction.x * player.speed * delta);
    }
    
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

  // Walking mini-hops (like automatic mini-jumps) - do BEFORE applying velocity
  const isMoving = keys.forward || keys.backward || keys.left || keys.right;
  
  if (isMoving && player.onGround) {
    player.lastHopTime += delta;
    
    // Every hopInterval seconds, do a mini-jump
    if (player.lastHopTime >= player.hopInterval) {
      player.velocity.y = 3; // Smaller mini-jump force
      player.onGround = false; // Prevent immediate ground reset
      player.lastHopTime = 0;
    }
  } else {
    // Reset hop timer when not moving
    player.lastHopTime = 0;
  }
  
  camera.position.y += player.velocity.y * delta;
}

// ========== GAME LOOP ==========
function animate() {
  requestAnimationFrame(animate);
  
  const delta = clock.getDelta();
  const isPlaying = isMobile ? gameStarted : controls.isLocked;
  
  if (isPlaying) {
    // Always update NPCs (even when paused, for billboard effect)
    updateNPCs();
    
    // Pause game when dialog is active
    if (!dialogActive) {
      updatePlayer(delta);
      updateBullets(delta);
      updateFireballs(delta);
      updateZombies(delta);
      updateVillains(delta);
      updateFlyingBosses(delta);
      updateFlyingBossProjectiles(delta);
      updateHealthPacks(delta);
      updateBloodParticles(delta);
    }
    
    // Low health warning
    const lowHealthWarning = document.getElementById('low-health-warning');
    if (lowHealthWarning) {
      if (player.health <= 30 && player.health > 0) {
        lowHealthWarning.classList.add('active');
      } else {
        lowHealthWarning.classList.remove('active');
      }
    }
    
    // Check game over
    if (player.health <= 0) {
      if (isMobile) {
        mobileControls.classList.remove('active');
        blocker.style.display = 'flex';
        gameStarted = false;
      } else {
        controls.unlock();
      }
      alert('Game Over! Refresh to restart.');
      player.health = 100; // Reset for next time
    }
  }

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();

console.log('🎮 AWS Server Room loaded!', isMobile ? '(Mobile mode)' : '(Desktop mode)');
