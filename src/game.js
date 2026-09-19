const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d", { alpha: false });

const ui = {
  hud: document.querySelector("#hud"),
  healthBar: document.querySelector("#health-bar"),
  healthText: document.querySelector("#health-text"),
  xpBar: document.querySelector("#xp-bar"),
  levelText: document.querySelector("#level-text"),
  waveText: document.querySelector("#wave-text"),
  timerText: document.querySelector("#timer-text"),
  killsText: document.querySelector("#kills-text"),
  startScreen: document.querySelector("#start-screen"),
  upgradeScreen: document.querySelector("#upgrade-screen"),
  pauseScreen: document.querySelector("#pause-screen"),
  gameOverScreen: document.querySelector("#game-over-screen"),
  upgradeList: document.querySelector("#upgrade-list"),
  joystick: document.querySelector("#joystick"),
  joystickKnob: document.querySelector(".joystick-knob"),
  toast: document.querySelector("#toast"),
  resultTime: document.querySelector("#result-time"),
  resultLevel: document.querySelector("#result-level"),
  resultKills: document.querySelector("#result-kills"),
};

const TAU = Math.PI * 2;
const WAVE_LENGTH = 30;
const COLORS = {
  cyan: "#65f4ff",
  violet: "#9b7cff",
  red: "#ff5578",
  orange: "#ff9b5c",
  lime: "#b8ff62",
  ink: "#f5f7ff",
};

let width = 390;
let height = 844;
let dpr = 1;
let lastFrame = performance.now();
let state = "menu";
let run = null;
let toastTimer = 0;

const input = {
  keys: new Set(),
  pointerId: null,
  originX: 0,
  originY: 0,
  x: 0,
  y: 0,
};

const upgrades = [
  {
    id: "damage",
    icon: "✦",
    title: "HOTTER CORE",
    description: "+25% projectile damage",
    apply: (player) => { player.damage *= 1.25; },
  },
  {
    id: "firerate",
    icon: "⌁",
    title: "OVERCLOCK",
    description: "+18% attack speed",
    apply: (player) => { player.fireDelay = Math.max(0.11, player.fireDelay * 0.82); },
  },
  {
    id: "speed",
    icon: "➤",
    title: "PHASE BOOTS",
    description: "+12% movement speed",
    apply: (player) => { player.speed *= 1.12; },
  },
  {
    id: "multishot",
    icon: "⋔",
    title: "SPLIT SIGNAL",
    description: "+1 projectile per volley",
    max: 4,
    apply: (player) => { player.projectiles += 1; },
  },
  {
    id: "pierce",
    icon: "↠",
    title: "GHOST ROUND",
    description: "+1 enemy pierced",
    max: 4,
    apply: (player) => { player.pierce += 1; },
  },
  {
    id: "vitality",
    icon: "♥",
    title: "VITAL SHELL",
    description: "+25 max HP and heal 25 HP",
    apply: (player) => {
      player.maxHp += 25;
      player.hp = Math.min(player.maxHp, player.hp + 25);
    },
  },
  {
    id: "magnet",
    icon: "◎",
    title: "GRAVITY WELL",
    description: "+35% pickup radius",
    apply: (player) => { player.pickupRadius *= 1.35; },
  },
  {
    id: "bulletspeed",
    icon: "➟",
    title: "LIGHTSPEED",
    description: "+22% projectile speed and size",
    apply: (player) => {
      player.bulletSpeed *= 1.22;
      player.bulletSize = Math.min(10, player.bulletSize + 0.7);
    },
  },
];

function resize() {
  const rect = canvas.getBoundingClientRect();
  width = rect.width;
  height = rect.height;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function makeRun() {
  return {
    time: 0,
    wave: 1,
    waveTime: WAVE_LENGTH,
    nextSpawn: 0,
    nextShot: 0,
    shake: 0,
    flash: 0,
    kills: 0,
    enemies: [],
    bullets: [],
    orbs: [],
    particles: [],
    damageTexts: [],
    upgradeLevels: {},
    levelQueue: 0,
    player: {
      x: 0,
      y: 0,
      radius: 15,
      hp: 100,
      maxHp: 100,
      speed: 220,
      damage: 22,
      fireDelay: 0.52,
      bulletSpeed: 580,
      bulletSize: 4.5,
      projectiles: 1,
      pierce: 0,
      pickupRadius: 90,
      level: 1,
      xp: 0,
      xpToNext: 12,
      invulnerable: 0,
      angle: 0,
    },
  };
}

function startGame() {
  run = makeRun();
  state = "playing";
  hideScreens();
  ui.hud.classList.remove("hidden");
  updateHud();
  showToast("WAVE 1 · SURVIVE");
  lastFrame = performance.now();
}

function endGame() {
  if (!run) return;
  state = "gameover";
  ui.resultTime.textContent = formatTime(run.time);
  ui.resultLevel.textContent = String(run.player.level);
  ui.resultKills.textContent = String(run.kills);
  ui.gameOverScreen.classList.add("active");
  ui.hud.classList.add("hidden");
  resetJoystick();
}

function hideScreens() {
  document.querySelectorAll(".screen").forEach((screen) => screen.classList.remove("active"));
}

function togglePause(forceResume = false) {
  if (!run || (state !== "playing" && state !== "paused")) return;
  if (state === "paused" || forceResume) {
    state = "playing";
    ui.pauseScreen.classList.remove("active");
    lastFrame = performance.now();
  } else {
    state = "paused";
    ui.pauseScreen.classList.add("active");
    resetJoystick();
  }
}

function showToast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove("show"), 1450);
}

function randomChoice(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function distanceSquared(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function normalized(x, y) {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length, length };
}

function spawnEnemy(forceBoss = false) {
  const player = run.player;
  const edgeDistance = Math.max(width, height) * 0.68 + 80;
  const angle = Math.random() * TAU;
  const wave = run.wave;
  const isBoss = forceBoss;
  let type = "drone";

  if (isBoss) type = "boss";
  else if (wave >= 4 && Math.random() < Math.min(0.12 + wave * 0.015, 0.3)) type = "tank";
  else if (wave >= 2 && Math.random() < 0.3) type = "runner";

  const templates = {
    drone: { radius: 13, hp: 35, speed: 76, damage: 12, xp: 2, color: COLORS.red },
    runner: { radius: 9, hp: 23, speed: 126, damage: 9, xp: 2, color: COLORS.orange },
    tank: { radius: 21, hp: 115, speed: 49, damage: 22, xp: 5, color: COLORS.violet },
    boss: { radius: 42, hp: 780, speed: 42, damage: 32, xp: 40, color: COLORS.lime },
  };

  const template = templates[type];
  const healthScale = 1 + (wave - 1) * (isBoss ? 0.18 : 0.12);
  const enemy = {
    x: player.x + Math.cos(angle) * edgeDistance,
    y: player.y + Math.sin(angle) * edgeDistance,
    radius: template.radius,
    hp: template.hp * healthScale,
    maxHp: template.hp * healthScale,
    speed: template.speed * (1 + Math.min(wave * 0.018, 0.32)),
    damage: template.damage * (1 + wave * 0.06),
    xp: template.xp,
    color: template.color,
    type,
    hit: 0,
    phase: Math.random() * TAU,
  };

  run.enemies.push(enemy);
  if (isBoss) showToast(`WAVE ${wave} · BOSS SIGNAL`);
}

function nearestEnemy() {
  let nearest = null;
  let nearestDistance = Infinity;
  for (const enemy of run.enemies) {
    const d = distanceSquared(run.player, enemy);
    if (d < nearestDistance) {
      nearestDistance = d;
      nearest = enemy;
    }
  }
  return nearest;
}

function fireVolley() {
  const target = nearestEnemy();
  if (!target) return;

  const player = run.player;
  const baseAngle = Math.atan2(target.y - player.y, target.x - player.x);
  player.angle = baseAngle;
  const count = player.projectiles;
  const spread = Math.min(0.16 * (count - 1), 0.54);

  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const angle = baseAngle - spread / 2 + spread * t;
    run.bullets.push({
      x: player.x + Math.cos(angle) * 20,
      y: player.y + Math.sin(angle) * 20,
      vx: Math.cos(angle) * player.bulletSpeed,
      vy: Math.sin(angle) * player.bulletSpeed,
      radius: player.bulletSize,
      damage: player.damage,
      life: 1.35,
      hitsLeft: player.pierce + 1,
      hitIds: new Set(),
    });
  }
}

function getMoveVector() {
  let x = 0;
  let y = 0;
  if (input.keys.has("KeyA") || input.keys.has("ArrowLeft")) x -= 1;
  if (input.keys.has("KeyD") || input.keys.has("ArrowRight")) x += 1;
  if (input.keys.has("KeyW") || input.keys.has("ArrowUp")) y -= 1;
  if (input.keys.has("KeyS") || input.keys.has("ArrowDown")) y += 1;

  if (input.pointerId !== null) {
    x += input.x;
    y += input.y;
  }

  const vector = normalized(x, y);
  return vector.length > 0.08 ? vector : { x: 0, y: 0 };
}

function update(dt) {
  const player = run.player;
  run.time += dt;
  run.waveTime -= dt;
  run.nextSpawn -= dt;
  run.nextShot -= dt;
  run.shake = Math.max(0, run.shake - dt * 18);
  run.flash = Math.max(0, run.flash - dt * 3.5);
  player.invulnerable = Math.max(0, player.invulnerable - dt);

  if (run.waveTime <= 0) {
    run.wave += 1;
    run.waveTime += WAVE_LENGTH;
    showToast(`WAVE ${run.wave} · PRESSURE RISING`);
    if (run.wave % 5 === 0) spawnEnemy(true);
  }

  if (run.nextSpawn <= 0) {
    spawnEnemy();
    const pressure = 1 + run.wave * 0.16 + run.time / 240;
    run.nextSpawn = Math.max(0.18, 0.92 / pressure) * (0.78 + Math.random() * 0.42);
  }

  const move = getMoveVector();
  player.x += move.x * player.speed * dt;
  player.y += move.y * player.speed * dt;

  if (run.nextShot <= 0) {
    fireVolley();
    run.nextShot = player.fireDelay;
  }

  updateBullets(dt);
  updateEnemies(dt);
  updateOrbs(dt);
  updateParticles(dt);
  updateHud();
}

function updateBullets(dt) {
  for (let i = run.bullets.length - 1; i >= 0; i -= 1) {
    const bullet = run.bullets[i];
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;

    for (let j = run.enemies.length - 1; j >= 0 && bullet.hitsLeft > 0; j -= 1) {
      const enemy = run.enemies[j];
      if (bullet.hitIds.has(enemy)) continue;
      const hitRadius = bullet.radius + enemy.radius;
      if (distanceSquared(bullet, enemy) > hitRadius * hitRadius) continue;

      bullet.hitIds.add(enemy);
      bullet.hitsLeft -= 1;
      enemy.hp -= bullet.damage;
      enemy.hit = 0.1;
      addDamageText(enemy.x, enemy.y, Math.round(bullet.damage));
      burst(enemy.x, enemy.y, enemy.color, 4, 80);

      if (enemy.hp <= 0) killEnemy(j, enemy);
    }

    if (bullet.life <= 0 || bullet.hitsLeft <= 0) run.bullets.splice(i, 1);
  }
}

function updateEnemies(dt) {
  const player = run.player;
  for (let i = run.enemies.length - 1; i >= 0; i -= 1) {
    const enemy = run.enemies[i];
    enemy.hit = Math.max(0, enemy.hit - dt);
    enemy.phase += dt * (enemy.type === "runner" ? 8 : 3);

    const direction = normalized(player.x - enemy.x, player.y - enemy.y);
    const wobble = enemy.type === "runner" ? Math.sin(enemy.phase) * 0.18 : 0;
    const cos = Math.cos(wobble);
    const sin = Math.sin(wobble);
    enemy.x += (direction.x * cos - direction.y * sin) * enemy.speed * dt;
    enemy.y += (direction.x * sin + direction.y * cos) * enemy.speed * dt;

    const touchRadius = enemy.radius + player.radius;
    if (distanceSquared(enemy, player) < touchRadius * touchRadius && player.invulnerable <= 0) {
      player.hp -= enemy.damage;
      player.invulnerable = 0.55;
      run.shake = 7;
      run.flash = 0.6;
      burst(player.x, player.y, COLORS.red, 12, 150);
      if (player.hp <= 0) {
        player.hp = 0;
        updateHud();
        endGame();
        return;
      }
    }
  }
}

function updateOrbs(dt) {
  const player = run.player;
  for (let i = run.orbs.length - 1; i >= 0; i -= 1) {
    const orb = run.orbs[i];
    orb.life += dt;
    const d = normalized(player.x - orb.x, player.y - orb.y);
    const distance = d.length;

    if (distance < player.pickupRadius) {
      const pull = 180 + (player.pickupRadius - distance) * 7;
      orb.x += d.x * pull * dt;
      orb.y += d.y * pull * dt;
    }

    if (distance < player.radius + 9) {
      gainXp(orb.value);
      run.orbs.splice(i, 1);
    }
  }
}

function updateParticles(dt) {
  for (let i = run.particles.length - 1; i >= 0; i -= 1) {
    const particle = run.particles[i];
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 0.96;
    particle.vy *= 0.96;
    particle.life -= dt;
    if (particle.life <= 0) run.particles.splice(i, 1);
  }

  for (let i = run.damageTexts.length - 1; i >= 0; i -= 1) {
    const text = run.damageTexts[i];
    text.y -= 34 * dt;
    text.life -= dt;
    if (text.life <= 0) run.damageTexts.splice(i, 1);
  }
}

function killEnemy(index, enemy) {
  run.enemies.splice(index, 1);
  run.kills += 1;
  const orbCount = enemy.type === "boss" ? 12 : Math.max(1, Math.ceil(enemy.xp / 3));
  const value = enemy.xp / orbCount;
  for (let i = 0; i < orbCount; i += 1) {
    const angle = Math.random() * TAU;
    const distance = Math.random() * enemy.radius;
    run.orbs.push({
      x: enemy.x + Math.cos(angle) * distance,
      y: enemy.y + Math.sin(angle) * distance,
      value,
      life: Math.random() * 3,
    });
  }
  burst(enemy.x, enemy.y, enemy.color, enemy.type === "boss" ? 34 : 10, enemy.type === "boss" ? 210 : 125);
  if (enemy.type === "boss") showToast("BOSS ELIMINATED · CORE EXPOSED");
}

function gainXp(amount) {
  const player = run.player;
  player.xp += amount;

  while (player.xp >= player.xpToNext) {
    player.xp -= player.xpToNext;
    player.level += 1;
    player.xpToNext = Math.floor(12 + player.level * 6.4);
    run.levelQueue += 1;
  }

  if (run.levelQueue > 0 && state === "playing") presentUpgrade();
}

function presentUpgrade() {
  state = "upgrading";
  run.levelQueue -= 1;
  resetJoystick();
  const available = upgrades.filter((upgrade) => {
    const level = run.upgradeLevels[upgrade.id] || 0;
    return !upgrade.max || level < upgrade.max;
  });
  const choices = [];
  while (choices.length < Math.min(3, available.length)) {
    const choice = randomChoice(available);
    if (!choices.includes(choice)) choices.push(choice);
  }

  ui.upgradeList.replaceChildren();
  choices.forEach((upgrade) => {
    const level = run.upgradeLevels[upgrade.id] || 0;
    const button = document.createElement("button");
    button.className = "upgrade-card";
    button.innerHTML = `
      <span class="upgrade-icon">${upgrade.icon}</span>
      <span class="upgrade-copy"><strong>${upgrade.title}</strong><span>${upgrade.description}</span></span>
      <span class="upgrade-level">LV ${level + 1}</span>
    `;
    button.addEventListener("click", () => selectUpgrade(upgrade), { once: true });
    ui.upgradeList.append(button);
  });
  ui.upgradeScreen.classList.add("active");
  updateHud();
}

function selectUpgrade(upgrade) {
  run.upgradeLevels[upgrade.id] = (run.upgradeLevels[upgrade.id] || 0) + 1;
  upgrade.apply(run.player);
  ui.upgradeScreen.classList.remove("active");
  state = "playing";
  showToast(`${upgrade.title} · LV ${run.upgradeLevels[upgrade.id]}`);
  lastFrame = performance.now();
  if (run.levelQueue > 0) setTimeout(presentUpgrade, 220);
}

function addDamageText(x, y, value) {
  run.damageTexts.push({ x, y, value, life: 0.48 });
}

function burst(x, y, color, count, speed) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * TAU;
    const velocity = speed * (0.35 + Math.random() * 0.65);
    run.particles.push({
      x,
      y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      radius: 1.2 + Math.random() * 2.8,
      color,
      life: 0.25 + Math.random() * 0.45,
      maxLife: 0.7,
    });
  }
}

function worldToScreen(x, y) {
  const shakeX = run?.shake ? (Math.random() - 0.5) * run.shake : 0;
  const shakeY = run?.shake ? (Math.random() - 0.5) * run.shake : 0;
  return {
    x: width / 2 + x - run.player.x + shakeX,
    y: height / 2 + y - run.player.y + shakeY,
  };
}

function render() {
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#070a12";
  ctx.fillRect(0, 0, width, height);

  drawGrid();
  if (run) {
    drawOrbs();
    drawBullets();
    drawEnemies();
    drawPlayer();
    drawParticles();
    drawDamageTexts();
    drawEdgeWarnings();
    if (run.flash > 0) {
      ctx.fillStyle = `rgba(255, 50, 95, ${run.flash * 0.12})`;
      ctx.fillRect(0, 0, width, height);
    }
  } else {
    drawAmbient();
  }
  ctx.restore();
}

function drawGrid() {
  const spacing = 52;
  const offsetX = run ? ((-run.player.x % spacing) + spacing) % spacing : 0;
  const offsetY = run ? ((-run.player.y % spacing) + spacing) % spacing : 0;
  ctx.strokeStyle = "rgba(112, 125, 174, 0.075)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = offsetX; x < width; x += spacing) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = offsetY; y < height; y += spacing) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();

  const glow = ctx.createRadialGradient(width / 2, height / 2, 10, width / 2, height / 2, Math.max(width, height) * 0.7);
  glow.addColorStop(0, "rgba(71, 57, 135, 0.16)");
  glow.addColorStop(1, "rgba(4, 6, 12, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
}

function drawAmbient() {
  const now = performance.now() / 1000;
  for (let i = 0; i < 22; i += 1) {
    const x = (i * 97.3 + now * (4 + (i % 4))) % (width + 80) - 40;
    const y = (i * 173.7 + Math.sin(now + i) * 25) % height;
    ctx.fillStyle = i % 3 === 0 ? "rgba(101,244,255,.24)" : "rgba(155,124,255,.18)";
    ctx.beginPath();
    ctx.arc(x, y, 1 + (i % 3), 0, TAU);
    ctx.fill();
  }
}

function drawPlayer() {
  const player = run.player;
  const center = worldToScreen(player.x, player.y);
  const blinking = player.invulnerable > 0 && Math.floor(player.invulnerable * 16) % 2 === 0;
  if (blinking) ctx.globalAlpha = 0.38;

  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate(player.angle + Math.PI / 2);
  ctx.shadowColor = COLORS.cyan;
  ctx.shadowBlur = 18;
  ctx.fillStyle = COLORS.cyan;
  ctx.beginPath();
  ctx.moveTo(0, -19);
  ctx.lineTo(13, 13);
  ctx.lineTo(0, 8);
  ctx.lineTo(-13, 13);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#07111a";
  ctx.beginPath();
  ctx.arc(0, 2, 5, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawEnemies() {
  for (const enemy of run.enemies) {
    const point = worldToScreen(enemy.x, enemy.y);
    if (point.x < -80 || point.x > width + 80 || point.y < -80 || point.y > height + 80) continue;

    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(enemy.phase * (enemy.type === "boss" ? 0.12 : 0.04));
    ctx.shadowColor = enemy.color;
    ctx.shadowBlur = enemy.hit > 0 ? 24 : 10;
    ctx.strokeStyle = enemy.hit > 0 ? "#fff" : enemy.color;
    ctx.fillStyle = enemy.type === "boss" ? "rgba(184,255,98,.16)" : "rgba(14,18,31,.96)";
    ctx.lineWidth = enemy.type === "boss" ? 4 : 2;
    ctx.beginPath();
    const sides = enemy.type === "runner" ? 3 : enemy.type === "tank" ? 6 : enemy.type === "boss" ? 8 : 4;
    for (let i = 0; i < sides; i += 1) {
      const angle = (i / sides) * TAU - Math.PI / 2;
      const radius = enemy.radius * (i % 2 === 0 || sides < 5 ? 1 : 0.83);
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = enemy.color;
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(2.5, enemy.radius * 0.18), 0, TAU);
    ctx.fill();
    ctx.restore();

    if (enemy.type === "boss" || enemy.type === "tank") {
      const barWidth = enemy.radius * 2;
      const hpRatio = Math.max(0, enemy.hp / enemy.maxHp);
      ctx.fillStyle = "rgba(255,255,255,.12)";
      ctx.fillRect(point.x - barWidth / 2, point.y - enemy.radius - 12, barWidth, 3);
      ctx.fillStyle = enemy.color;
      ctx.fillRect(point.x - barWidth / 2, point.y - enemy.radius - 12, barWidth * hpRatio, 3);
    }
  }
}

function drawBullets() {
  ctx.save();
  ctx.fillStyle = COLORS.ink;
  ctx.shadowColor = COLORS.cyan;
  ctx.shadowBlur = 14;
  for (const bullet of run.bullets) {
    const point = worldToScreen(bullet.x, bullet.y);
    ctx.beginPath();
    ctx.arc(point.x, point.y, bullet.radius, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawOrbs() {
  ctx.save();
  ctx.fillStyle = COLORS.violet;
  ctx.shadowColor = COLORS.violet;
  ctx.shadowBlur = 12;
  for (const orb of run.orbs) {
    const point = worldToScreen(orb.x, orb.y);
    const pulse = 2.8 + Math.sin(orb.life * 5) * 0.6;
    ctx.beginPath();
    ctx.arc(point.x, point.y, pulse, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawParticles() {
  for (const particle of run.particles) {
    const point = worldToScreen(particle.x, particle.y);
    ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
    ctx.fillStyle = particle.color;
    ctx.fillRect(point.x - particle.radius / 2, point.y - particle.radius / 2, particle.radius, particle.radius);
  }
  ctx.globalAlpha = 1;
}

function drawDamageTexts() {
  ctx.textAlign = "center";
  ctx.font = "800 11px system-ui";
  for (const text of run.damageTexts) {
    const point = worldToScreen(text.x, text.y);
    ctx.globalAlpha = Math.min(1, text.life * 3);
    ctx.fillStyle = COLORS.ink;
    ctx.fillText(String(text.value), point.x, point.y);
  }
  ctx.globalAlpha = 1;
}

function drawEdgeWarnings() {
  const player = run.player;
  for (const enemy of run.enemies) {
    if (enemy.type !== "boss") continue;
    const point = worldToScreen(enemy.x, enemy.y);
    if (point.x > 25 && point.x < width - 25 && point.y > 90 && point.y < height - 25) continue;
    const angle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
    const x = Math.min(width - 24, Math.max(24, width / 2 + Math.cos(angle) * width * 0.42));
    const y = Math.min(height - 32, Math.max(100, height / 2 + Math.sin(angle) * height * 0.42));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = COLORS.lime;
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-7, -6);
    ctx.lineTo(-7, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function updateHud() {
  if (!run) return;
  const player = run.player;
  const hpRatio = Math.max(0, player.hp / player.maxHp);
  const xpRatio = Math.max(0, player.xp / player.xpToNext);
  ui.healthBar.style.transform = `scaleX(${hpRatio})`;
  ui.healthText.textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
  ui.xpBar.style.transform = `scaleX(${xpRatio})`;
  ui.levelText.textContent = `LV ${player.level}`;
  ui.waveText.textContent = `WAVE ${run.wave}`;
  ui.timerText.textContent = formatTime(Math.max(0, run.waveTime));
  ui.killsText.textContent = `${run.kills} KILLS`;
}

function formatTime(seconds) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function frame(now) {
  const dt = Math.min((now - lastFrame) / 1000, 0.033);
  lastFrame = now;
  if (state === "playing") update(dt);
  render();
  requestAnimationFrame(frame);
}

function updateJoystick(clientX, clientY) {
  const maxRadius = 40;
  const delta = normalized(clientX - input.originX, clientY - input.originY);
  const magnitude = Math.min(delta.length, maxRadius);
  input.x = delta.x * Math.min(1, delta.length / maxRadius);
  input.y = delta.y * Math.min(1, delta.length / maxRadius);
  ui.joystickKnob.style.transform = `translate(calc(-50% + ${delta.x * magnitude}px), calc(-50% + ${delta.y * magnitude}px))`;
}

function resetJoystick() {
  input.pointerId = null;
  input.x = 0;
  input.y = 0;
  ui.joystick.style.display = "none";
  ui.joystickKnob.style.transform = "translate(-50%, -50%)";
}

canvas.addEventListener("pointerdown", (event) => {
  const rect = canvas.getBoundingClientRect();
  const localX = event.clientX - rect.left;
  const localY = event.clientY - rect.top;
  if (state !== "playing" || input.pointerId !== null || localX > width * 0.72) return;
  event.preventDefault();
  input.pointerId = event.pointerId;
  input.originX = localX;
  input.originY = localY;
  ui.joystick.style.left = `${localX - 59}px`;
  ui.joystick.style.top = `${localY - 59}px`;
  ui.joystick.style.display = "block";
  canvas.setPointerCapture(event.pointerId);
  updateJoystick(localX, localY);
});

canvas.addEventListener("pointermove", (event) => {
  if (event.pointerId !== input.pointerId) return;
  event.preventDefault();
  const rect = canvas.getBoundingClientRect();
  updateJoystick(event.clientX - rect.left, event.clientY - rect.top);
});

canvas.addEventListener("pointerup", (event) => {
  if (event.pointerId === input.pointerId) resetJoystick();
});

canvas.addEventListener("pointercancel", resetJoystick);

window.addEventListener("keydown", (event) => {
  input.keys.add(event.code);
  if (event.code === "Escape" || event.code === "KeyP") togglePause();
});

window.addEventListener("keyup", (event) => input.keys.delete(event.code));
window.addEventListener("resize", resize);
window.addEventListener("blur", () => {
  input.keys.clear();
  if (state === "playing") togglePause();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && state === "playing") togglePause();
});

document.querySelector("#start-button").addEventListener("click", startGame);
document.querySelector("#restart-button").addEventListener("click", startGame);
document.querySelector("#pause-button").addEventListener("click", () => togglePause());
document.querySelector("#resume-button").addEventListener("click", () => togglePause(true));
document.querySelector("#quit-button").addEventListener("click", endGame);

resize();
requestAnimationFrame(frame);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
