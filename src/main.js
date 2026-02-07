import * as THREE from 'https://unpkg.com/three@0.164.1/build/three.module.js';

const app = document.getElementById('app');
const startOverlay = document.getElementById('start');
const startBtn = document.getElementById('startBtn');
const endMessage = document.getElementById('endMessage');
const timeEl = document.getElementById('time');
const bluePctEl = document.getElementById('bluePct');
const orangePctEl = document.getElementById('orangePct');
const inkBarEl = document.getElementById('inkBar');

const moveStick = document.getElementById('moveStick');
const aimStick = document.getElementById('aimStick');
const moveKnob = document.getElementById('moveKnob');
const aimKnob = document.getElementById('aimKnob');
const fireBtn = document.getElementById('fireBtn');
const jumpBtn = document.getElementById('jumpBtn');
const dashBtn = document.getElementById('dashBtn');
const touchUi = document.getElementById('touchUi');

const MATCH_TIME = 90;
const ARENA_SIZE = 70;
const GRID_SIZE = 42;
const HALF_ARENA = ARENA_SIZE / 2;
const MAX_INK = 100;

let remainingTime = MATCH_TIME;
let started = false;
let finished = false;

const isTouchDevice = matchMedia('(hover: none), (pointer: coarse)').matches;
const keys = new Set();
let yaw = 0;
let pitch = -0.25;
let mouseDown = false;

const touchInput = {
  moveX: 0,
  moveY: 0,
  aimX: 0,
  aimY: 0,
  fire: false,
  jump: false,
  dash: false,
};

const scene = new THREE.Scene();
scene.background = new THREE.Color('#081021');
scene.fog = new THREE.Fog('#081021', 30, 120);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 250);
camera.position.set(0, 2.2, 16);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
app.appendChild(renderer.domElement);

const hemi = new THREE.HemisphereLight('#9dd8ff', '#1c2333', 0.95);
scene.add(hemi);

const sun = new THREE.DirectionalLight('#ffffff', 1.15);
sun.position.set(18, 28, 14);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE),
  new THREE.MeshStandardMaterial({ color: '#3e485e', roughness: 0.92, metalness: 0.05 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const wallMat = new THREE.MeshStandardMaterial({ color: '#2d3a4d', roughness: 0.85 });
const walls = [
  [0, 4, -HALF_ARENA],
  [0, 4, HALF_ARENA],
  [-HALF_ARENA, 4, 0, Math.PI / 2],
  [HALF_ARENA, 4, 0, Math.PI / 2],
];
for (const [x, y, z, ry = 0] of walls) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(ARENA_SIZE, 8, 1.8), wallMat);
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
}

const obstacles = [];
function addStageBlock(x, y, z, w, h, d, color = '#4a4f63') {
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.8 }),
  );
  box.position.set(x, y, z);
  box.castShadow = true;
  box.receiveShadow = true;
  box.userData.collider = { half: new THREE.Vector3(w / 2 + 1.2, h / 2 + 1.2, d / 2 + 1.2) };
  obstacles.push(box);
  scene.add(box);
}

// ステージ: 中央高台、左右通路、遮蔽物群
addStageBlock(0, 2, 0, 16, 4, 16, '#545772');
addStageBlock(-20, 1.5, 0, 14, 3, 8, '#434a5f');
addStageBlock(20, 1.5, 0, 14, 3, 8, '#434a5f');
addStageBlock(0, 1.2, -20, 22, 2.4, 6, '#3f465b');
addStageBlock(0, 1.2, 20, 22, 2.4, 6, '#3f465b');
for (let i = 0; i < 8; i++) {
  const w = 3 + Math.random() * 3;
  const h = 2 + Math.random() * 3;
  const d = 3 + Math.random() * 3;
  addStageBlock((Math.random() - 0.5) * 46, h / 2, (Math.random() - 0.5) * 46, w, h, d, i % 2 ? '#3f455b' : '#4d4a57');
}

const territory = new Uint8Array(GRID_SIZE * GRID_SIZE);

function resetTerritory() {
  for (let z = 0; z < GRID_SIZE; z++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      territory[z * GRID_SIZE + x] = x < GRID_SIZE / 2 ? 1 : 2;
    }
  }
}
resetTerritory();

const paintCanvas = document.createElement('canvas');
paintCanvas.width = GRID_SIZE;
paintCanvas.height = GRID_SIZE;
const paintCtx = paintCanvas.getContext('2d');
paintCtx.imageSmoothingEnabled = false;

const paintTex = new THREE.CanvasTexture(paintCanvas);
paintTex.colorSpace = THREE.SRGBColorSpace;
paintTex.magFilter = THREE.NearestFilter;
paintTex.minFilter = THREE.NearestFilter;

const paintOverlay = new THREE.Mesh(
  new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE),
  new THREE.MeshBasicMaterial({ map: paintTex, transparent: true, opacity: 0.82 }),
);
paintOverlay.rotation.x = -Math.PI / 2;
paintOverlay.position.y = 0.02;
scene.add(paintOverlay);

function drawTerritory() {
  const image = paintCtx.createImageData(GRID_SIZE, GRID_SIZE);
  for (let i = 0; i < territory.length; i++) {
    const p = i * 4;
    if (territory[i] === 1) {
      image.data[p] = 28;
      image.data[p + 1] = 183;
      image.data[p + 2] = 255;
      image.data[p + 3] = 235;
    } else {
      image.data[p] = 255;
      image.data[p + 1] = 147;
      image.data[p + 2] = 42;
      image.data[p + 3] = 235;
    }
  }
  paintCtx.putImageData(image, 0, 0);
  paintTex.needsUpdate = true;
}

drawTerritory();

const splashGeo = new THREE.CircleGeometry(1.1, 16);
const splashes = [];

function createSplash(pos, normal, team) {
  const mat = new THREE.MeshBasicMaterial({
    color: team === 1 ? '#2ac4ff' : '#ff9c35',
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(splashGeo, mat);
  m.position.copy(pos).addScaledVector(normal, 0.05);
  m.lookAt(m.position.clone().add(normal));
  m.rotateZ(Math.random() * Math.PI * 2);
  m.scale.setScalar(0.7 + Math.random() * 1.4);
  scene.add(m);
  splashes.push({ mesh: m, life: 7 + Math.random() * 3 });
}

function paintAt(worldX, worldZ, radius, team) {
  const gx = ((worldX + HALF_ARENA) / ARENA_SIZE) * GRID_SIZE;
  const gz = ((worldZ + HALF_ARENA) / ARENA_SIZE) * GRID_SIZE;
  const minX = Math.max(0, Math.floor(gx - radius));
  const maxX = Math.min(GRID_SIZE - 1, Math.ceil(gx + radius));
  const minZ = Math.max(0, Math.floor(gz - radius));
  const maxZ = Math.min(GRID_SIZE - 1, Math.ceil(gz + radius));

  for (let z = minZ; z <= maxZ; z++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - gx;
      const dz = z - gz;
      if (dx * dx + dz * dz <= radius * radius) territory[z * GRID_SIZE + x] = team;
    }
  }
}

const players = {
  human: {
    team: 1,
    pos: new THREE.Vector3(-24, 1.2, 0),
    vel: new THREE.Vector3(),
    speed: 11,
    ink: MAX_INK,
    fireCooldown: 0,
    onGround: true,
  },
  bots: [],
};

function makeBot(index) {
  return {
    team: 2,
    pos: new THREE.Vector3(15 + (index % 4) * 3, 1.2, -12 + Math.floor(index / 4) * 8),
    vel: new THREE.Vector3(),
    speed: 7 + Math.random() * 1.5,
    fireCooldown: Math.random() * 0.6,
    target: new THREE.Vector3(),
    retarget: 0,
  };
}

for (let i = 0; i < 8; i++) players.bots.push(makeBot(i));

const actorGeo = new THREE.CapsuleGeometry(0.5, 1.0, 4, 8);
for (const actor of [players.human, ...players.bots]) {
  actor.mesh = new THREE.Mesh(
    actorGeo,
    new THREE.MeshStandardMaterial({ color: actor.team === 1 ? '#31c8ff' : '#ff9b2f', roughness: 0.38 }),
  );
  actor.mesh.castShadow = true;
  actor.mesh.position.copy(actor.pos);
  scene.add(actor.mesh);
}

const projectileGeo = new THREE.SphereGeometry(0.24, 12, 12);
const shots = [];

function fireShot(shooter, direction) {
  if (shooter.ink !== undefined && shooter.ink < 4) return;

  const shot = {
    team: shooter.team,
    pos: shooter.pos.clone().add(new THREE.Vector3(0, 0.55, 0)),
    vel: direction.clone().multiplyScalar(29),
    life: 1.6,
    mesh: new THREE.Mesh(
      projectileGeo,
      new THREE.MeshStandardMaterial({
        color: shooter.team === 1 ? '#2dc2ff' : '#ff9f37',
        emissive: shooter.team === 1 ? '#0c6792' : '#a95208',
        emissiveIntensity: 0.7,
      }),
    ),
  };

  shot.mesh.castShadow = true;
  shot.mesh.position.copy(shot.pos);
  shots.push(shot);
  scene.add(shot.mesh);

  if (shooter.ink !== undefined) shooter.ink = Math.max(0, shooter.ink - 4);
}

function resolveCollision(actor) {
  actor.pos.x = THREE.MathUtils.clamp(actor.pos.x, -HALF_ARENA + 1.5, HALF_ARENA - 1.5);
  actor.pos.z = THREE.MathUtils.clamp(actor.pos.z, -HALF_ARENA + 1.5, HALF_ARENA - 1.5);
  for (const obs of obstacles) {
    const half = obs.userData.collider.half;
    const delta = actor.pos.clone().sub(obs.position);
    const overlapX = half.x - Math.abs(delta.x);
    const overlapZ = half.z - Math.abs(delta.z);
    if (overlapX > 0 && overlapZ > 0 && actor.pos.y < obs.position.y + half.y) {
      if (overlapX < overlapZ) actor.pos.x += delta.x > 0 ? overlapX : -overlapX;
      else actor.pos.z += delta.z > 0 ? overlapZ : -overlapZ;
    }
  }
}

function scoreBoard() {
  let blue = 0;
  for (let i = 0; i < territory.length; i++) if (territory[i] === 1) blue += 1;
  const orange = territory.length - blue;
  bluePctEl.textContent = `${((blue / territory.length) * 100).toFixed(1)}%`;
  orangePctEl.textContent = `${((orange / territory.length) * 100).toFixed(1)}%`;
  return { blue, orange };
}

function handleShotCollision(shot) {
  if (shot.pos.y <= 0.2) {
    paintAt(shot.pos.x, shot.pos.z, 2.7, shot.team);
    createSplash(shot.pos.clone().setY(0.04), new THREE.Vector3(0, 1, 0), shot.team);
    return true;
  }

  for (const obs of obstacles) {
    const box = new THREE.Box3().setFromObject(obs);
    if (box.containsPoint(shot.pos)) {
      paintAt(shot.pos.x, shot.pos.z, 1.5, shot.team);
      createSplash(shot.pos, shot.vel.clone().normalize().multiplyScalar(-1), shot.team);
      return true;
    }
  }
  return false;
}

function getMoveInput() {
  if (isTouchDevice) {
    return { x: touchInput.moveX, z: -touchInput.moveY, dash: touchInput.dash, jump: touchInput.jump };
  }
  const x = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  const z = (keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0);
  return { x, z, dash: keys.has('ShiftLeft'), jump: keys.has('Space') };
}

function updateHuman(dt) {
  const human = players.human;
  const inpt = getMoveInput();

  if (isTouchDevice) {
    yaw -= touchInput.aimX * dt * 2.1;
    pitch += touchInput.aimY * dt * 1.6;
    pitch = THREE.MathUtils.clamp(pitch, -1.15, 1.1);
  }

  const input = new THREE.Vector3(inpt.x, 0, inpt.z);
  if (input.lengthSq() > 1) input.normalize();

  const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const right = new THREE.Vector3(forward.z, 0, -forward.x);
  const move = forward.multiplyScalar(-input.z).add(right.multiplyScalar(input.x));

  const sprint = inpt.dash ? 1.45 : 1;
  human.vel.x = move.x * human.speed * sprint;
  human.vel.z = move.z * human.speed * sprint;

  if (human.onGround && inpt.jump) {
    human.vel.y = 7.5;
    human.onGround = false;
    touchInput.jump = false;
  }

  human.vel.y -= 18 * dt;
  human.pos.addScaledVector(human.vel, dt);

  if (human.pos.y <= 1.2) {
    human.pos.y = 1.2;
    human.vel.y = 0;
    human.onGround = true;
  }

  resolveCollision(human);

  camera.position.copy(human.pos).add(new THREE.Vector3(0, 1.2, 0));
  const look = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  camera.lookAt(camera.position.clone().add(look));

  human.mesh.position.copy(human.pos);

  human.fireCooldown -= dt;
  const isFiring = isTouchDevice ? touchInput.fire : mouseDown;
  if (isFiring && human.fireCooldown <= 0 && !finished) {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    fireShot(human, dir);
    human.fireCooldown = 0.11;
  }

  human.ink = Math.min(MAX_INK, human.ink + dt * 8.5);
  inkBarEl.style.transform = `scaleX(${human.ink / MAX_INK})`;
}

function botThink(bot, dt) {
  bot.retarget -= dt;
  if (bot.retarget <= 0) {
    const preferred = new THREE.Vector3((Math.random() - 0.5) * 54, 1.2, (Math.random() - 0.5) * 54);
    const towardCenter = new THREE.Vector3().subVectors(new THREE.Vector3(0, 0, 0), bot.pos).setY(0).multiplyScalar(0.18);
    bot.target.copy(preferred.add(towardCenter));
    bot.retarget = 1 + Math.random() * 1.2;
  }

  const toTarget = bot.target.clone().sub(bot.pos).setY(0);
  if (toTarget.lengthSq() > 0.2) {
    toTarget.normalize();
    bot.vel.x = toTarget.x * bot.speed;
    bot.vel.z = toTarget.z * bot.speed;
  } else {
    bot.vel.multiplyScalar(0.55);
  }

  bot.pos.addScaledVector(bot.vel, dt);
  bot.pos.y = 1.2;
  resolveCollision(bot);

  bot.fireCooldown -= dt;
  if (bot.fireCooldown <= 0 && !finished) {
    const towardPlayer = players.human.pos
      .clone()
      .sub(bot.pos)
      .setY(0.25)
      .add(new THREE.Vector3((Math.random() - 0.5) * 0.48, (Math.random() - 0.5) * 0.07, (Math.random() - 0.5) * 0.48))
      .normalize();
    fireShot(bot, towardPlayer);
    bot.fireCooldown = 0.18 + Math.random() * 0.35;
  }

  bot.mesh.position.copy(bot.pos);
  bot.mesh.lookAt(bot.pos.clone().add(bot.vel));
}

function endGame() {
  finished = true;
  const { blue, orange } = scoreBoard();
  const winner = blue === orange ? '引き分け！' : blue > orange ? '青チームの勝ち！' : 'オレンジチームの勝ち！';
  endMessage.textContent = `試合終了: ${winner}`;
  startBtn.textContent = 'もう一度プレイ';
  startOverlay.style.display = 'grid';
  touchUi?.classList.remove('active');
  if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
}

function bindStick(stick, knob, onMove) {
  let pointerId = null;
  const center = { x: 0, y: 0 };

  function update(event) {
    const dx = event.clientX - center.x;
    const dy = event.clientY - center.y;
    const max = 44;
    const len = Math.hypot(dx, dy);
    const scale = len > max ? max / len : 1;
    const x = dx * scale;
    const y = dy * scale;
    knob.style.transform = `translate(${x}px, ${y}px)`;
    onMove(x / max, y / max);
  }

  function reset() {
    knob.style.transform = 'translate(0px, 0px)';
    onMove(0, 0);
  }

  stick.addEventListener('pointerdown', (event) => {
    pointerId = event.pointerId;
    const rect = stick.getBoundingClientRect();
    center.x = rect.left + rect.width / 2;
    center.y = rect.top + rect.height / 2;
    stick.setPointerCapture(pointerId);
    update(event);
  });

  stick.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointerId) return;
    update(event);
  });

  const stop = (event) => {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    reset();
  };

  stick.addEventListener('pointerup', stop);
  stick.addEventListener('pointercancel', stop);
  reset();
}

function setupTouchControls() {
  touchUi?.classList.remove('active');
  if (!isTouchDevice) return;

  bindStick(moveStick, moveKnob, (x, y) => {
    touchInput.moveX = x;
    touchInput.moveY = y;
  });
  bindStick(aimStick, aimKnob, (x, y) => {
    touchInput.aimX = x;
    touchInput.aimY = y;
  });

  const holdButton = (element, key) => {
    element.addEventListener('pointerdown', () => {
      touchInput[key] = true;
    });
    const stop = () => {
      touchInput[key] = false;
    };
    element.addEventListener('pointerup', stop);
    element.addEventListener('pointercancel', stop);
    element.addEventListener('pointerleave', stop);
  };

  holdButton(fireBtn, 'fire');
  holdButton(dashBtn, 'dash');
  jumpBtn.addEventListener('pointerdown', () => {
    touchInput.jump = true;
  });
}

document.addEventListener('keydown', (event) => keys.add(event.code));
document.addEventListener('keyup', (event) => keys.delete(event.code));
document.addEventListener('mousedown', () => {
  mouseDown = true;
});
document.addEventListener('mouseup', () => {
  mouseDown = false;
});
document.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement !== renderer.domElement || finished) return;
  yaw -= event.movementX * 0.0026;
  pitch -= event.movementY * 0.0023;
  pitch = THREE.MathUtils.clamp(pitch, -1.15, 1.1);
});

startBtn.addEventListener('click', () => {
  if (!started || finished) {
    started = true;
    finished = false;
    remainingTime = MATCH_TIME;
    endMessage.textContent = '';
    players.human.pos.set(-24, 1.2, 0);
    players.human.vel.set(0, 0, 0);
    players.human.ink = MAX_INK;

    resetTerritory();
    for (let i = 0; i < players.bots.length; i++) {
      const bot = players.bots[i];
      bot.pos.set(12 + (i % 4) * 4, 1.2, -14 + Math.floor(i / 4) * 10);
      bot.target.copy(bot.pos);
      bot.fireCooldown = Math.random() * 0.4;
    }
    drawTerritory();
  }

  startOverlay.style.display = 'none';
  if (isTouchDevice) touchUi?.classList.add('active');
  if (!isTouchDevice) renderer.domElement.requestPointerLock();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

setupTouchControls();

const clock = new THREE.Clock();

function animate() {
  const dt = Math.min(clock.getDelta(), 0.033);

  if (started && !finished) {
    remainingTime -= dt;
    if (remainingTime <= 0) {
      remainingTime = 0;
      endGame();
    }

    updateHuman(dt);
    for (const bot of players.bots) botThink(bot, dt);

    for (let i = shots.length - 1; i >= 0; i--) {
      const shot = shots[i];
      shot.life -= dt;
      shot.vel.y -= 16 * dt;
      shot.pos.addScaledVector(shot.vel, dt);
      shot.mesh.position.copy(shot.pos);
      if (shot.life <= 0 || handleShotCollision(shot)) {
        scene.remove(shot.mesh);
        shot.mesh.material.dispose();
        shots.splice(i, 1);
      }
    }

    for (let i = splashes.length - 1; i >= 0; i--) {
      const splash = splashes[i];
      splash.life -= dt;
      splash.mesh.material.opacity = Math.max(0, Math.min(0.72, splash.life / 6));
      if (splash.life <= 0) {
        scene.remove(splash.mesh);
        splash.mesh.material.dispose();
        splashes.splice(i, 1);
      }
    }

    drawTerritory();
    scoreBoard();
    timeEl.textContent = remainingTime.toFixed(1);
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
scoreBoard();
