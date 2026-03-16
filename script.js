/* ================================================================
   WATER DROP COLLECTOR — game.js

   RULES:
   • Water drops (blue 💧) fall from the top.
   • Click/tap water drop  → +10 pts, collected++
   • Miss a water drop     → lives−−
   • Click/tap pollutant   → score−15, lives−−
   • Lives reach 0         → Game Over (no timer)
   • Beat high score       → confetti!
   • Speed ramps every 5 collected drops.
================================================================ */

const Game = (() => {

  /* ── Constants ── */
  const MAX_LIVES       = 3;
  const WATER_PTS       = 10;
  const POLL_PTS        = 15;
  const WATER_CHANCE    = 0.72;
  const BASE_FALL_MS    = 3000;
  const BASE_SPAWN_MS   = 1200;
  const SPEED_STEP      = 5;
  const SPEED_INC       = 0.15;
  const MAX_SPEED       = 2.8;
  const DROP_PX         = 48;
  const LS_KEY          = 'wdc_hs';

  /* ── State ── */
  let S = freshState();

  function freshState() {
    return {
      score:     0,
      lives:     MAX_LIVES,
      collected: 0,
      missed:    0,
      speed:     1.0,
      running:   false,
      hs:        Number(localStorage.getItem(LS_KEY) || 0),
      drops:     [],
      spawnTid:  null,
      rafId:     null,
      prefix:    'd',
      ended:     false,
    };
  }

  /* ── DOM shortcuts ── */
  const $  = id => document.getElementById(id);
  const ga = p  => $(`${p}-area`);

  /* ── Sync all display elements ── */
  function syncUI() {
    ['d','m'].forEach(p => {
      const sc = $(`${p}-score`);      if (sc) sc.textContent = S.score.toLocaleString();
      const hs = $(`${p}-highscore`);  if (hs) hs.textContent = S.hs.toLocaleString();
      const co = $(`${p}-collected`);  if (co) co.textContent = S.collected;
      const mi = $(`${p}-missed`);     if (mi) mi.textContent = S.missed;
      const sp = $(`${p}-speed`);      if (sp) sp.textContent = S.speed.toFixed(1) + '×';
      const lv = $(`${p}-lives`);
      if (lv) lv.textContent = (p === 'd') ? '❤️'.repeat(Math.max(0, S.lives)) : String(Math.max(0, S.lives));
    });
  }

  /* ── Feedback messages ── */
  let fbTid = null;
  function feedback(msg, bad) {
    clearTimeout(fbTid);
    const p = S.prefix;
    if (p === 'd') {
      const el = $('d-feedback');
      el.textContent = msg;
      el.className = 'feedback-pill show' + (bad ? ' bad' : '');
      fbTid = setTimeout(() => { el.className = 'feedback-pill'; }, 950);
    } else {
      const el = $('m-feedback');
      el.textContent = msg;
      el.className = 'm-feedback' + (bad ? ' bad' : '');
      fbTid = setTimeout(() => { el.className = 'm-feedback hidden'; }, 950);
    }
  }

  /* ── Floating score pop ── */
  function scorePop(areaEl, x, y, txt, pos) {
    const d = document.createElement('div');
    d.className = 'score-pop ' + (pos ? 'pos' : 'neg');
    d.textContent = txt;
    d.style.left = (x - 14) + 'px';
    d.style.top  = (y - 12) + 'px';
    areaEl.appendChild(d);
    setTimeout(() => d.remove(), 720);
  }

  /* ── Border flash ── */
  function flash(good) {
    const a = ga(S.prefix);
    if (!a) return;
    const cls = good ? 'flash-good' : 'flash-bad';
    a.classList.remove('flash-good','flash-bad');
    void a.offsetWidth;
    a.classList.add(cls);
    setTimeout(() => a.classList.remove(cls), 380);
  }

  /* ── Spawn one drop ── */
  function spawnDrop() {
    if (!S.running) return;
    const a     = ga(S.prefix);
    if (!a) return;
    const W     = a.clientWidth;
    const H     = a.clientHeight;
    const water = Math.random() < WATER_CHANCE;
    const dur   = BASE_FALL_MS / S.speed + (Math.random() * 400 - 200);
    const x     = Math.max(4, Math.random() * (W - DROP_PX - 4));

    const el = document.createElement('div');
    el.className   = 'drop ' + (water ? 'water' : 'pollutant');
    el.textContent = water ? '💧' : '☠️';
    el.style.left  = x + 'px';
    el.style.top   = (-DROP_PX) + 'px';

    // Use let so the closure captures the correct dropObj reference
    let dropObj;
    el.addEventListener('pointerdown', e => {
      e.stopPropagation();
      onDropClick(dropObj, el, a);
    });

    a.appendChild(el);

    dropObj = {
      el, x,
      startTime: performance.now(),
      duration:  dur,
      areaH:     H,
      isWater:   water,
      done:      false,
    };

    S.drops.push(dropObj);
  }

  /* ── Handle drop click/tap ── */
  function onDropClick(obj, el, areaEl) {
    if (!obj || obj.done || !S.running) return;
    obj.done = true;

    const rect = el.getBoundingClientRect();
    const ar   = areaEl.getBoundingClientRect();
    const px   = rect.left - ar.left + DROP_PX / 2;
    const py   = rect.top  - ar.top;

    el.remove();

    if (obj.isWater) {
      S.score     += WATER_PTS;
      S.collected += 1;
      feedback('Great catch! +10', false);
      scorePop(areaEl, px, py, '+10', true);
      flash(true);
      updateSpeed();
    } else {
      S.score  = Math.max(0, S.score - POLL_PTS);
      S.lives -= 1;
      feedback('Pollutant! −15 pts, −1 ❤️', true);
      scorePop(areaEl, px, py, '−15', false);
      flash(false);
    }
    syncUI();
    if (S.lives <= 0) endGame();
  }

  /* ── rAF loop: move drops, detect misses ── */
  function tick(now) {
    if (!S.running) return;

    S.drops = S.drops.filter(d => {
      if (d.done) return false;
      const a = ga(S.prefix);
      if (!a) return false;

      const progress = (now - d.startTime) / d.duration;
      const newTop   = -DROP_PX + (d.areaH + DROP_PX * 2) * progress;

      if (newTop > d.areaH) {
        d.done = true;
        d.el.remove();
        if (d.isWater) {
          S.missed += 1;
          S.lives  -= 1;
          feedback('Missed! −1 ❤️', true);
          flash(false);
          syncUI();
          if (S.lives <= 0) { endGame(); return false; }
        }
        return false;
      }

      d.el.style.top = newTop + 'px';
      return true;
    });

    S.rafId = requestAnimationFrame(tick);
  }

  /* ── Speed ramp ── */
  function updateSpeed() {
    S.speed = Math.min(MAX_SPEED, 1.0 + Math.floor(S.collected / SPEED_STEP) * SPEED_INC);
  }

  /* ── Spawn scheduler ── */
  function scheduleSpawn() {
    if (!S.running) return;
    const delay = BASE_SPAWN_MS / S.speed * (0.75 + Math.random() * 0.5);
    S.spawnTid = setTimeout(() => {
      if (!S.running) return;
      spawnDrop();
      scheduleSpawn();
    }, delay);
  }

  /* ── Wipe all drops from DOM ── */
  function clearDrops() {
    ['d','m'].forEach(p => {
      const a = ga(p);
      if (a) a.querySelectorAll('.drop,.score-pop').forEach(n => n.remove());
    });
    S.drops = [];
  }

  /* ── Build overlay HTML ── */
  function showOverlay(p, title, sub, btnLabel, action) {
    const ov = $(`${p}-overlay`);
    if (!ov) return;
    ov.innerHTML = `
      <div class="ov-box">
        <div class="ov-icon">💧</div>
        <div class="ov-title">${title}</div>
        <div class="ov-sub">${sub}</div>
        <button class="ov-btn" onclick="${action}">▶&nbsp;${btnLabel}</button>
      </div>`;
    ov.classList.add('active');
  }

  /* ── End game (called once via ended guard) ── */
  function endGame() {
    if (S.ended) return;
    S.ended   = true;
    S.running = false;
    clearTimeout(S.spawnTid);
    cancelAnimationFrame(S.rafId);
    clearTimeout(fbTid);
    clearDrops();

    // Update high score at end, fire confetti only if beaten
    const beatHigh = S.score > S.hs;
    if (beatHigh) {
      S.hs = S.score;
      localStorage.setItem(LS_KEY, S.hs);
    }
    syncUI();

    if (beatHigh) launchConfetti();

    const sub = `Final Score: <strong>${S.score.toLocaleString()}</strong><br>
                 Collected: ${S.collected} &nbsp;|&nbsp; Missed: ${S.missed}`;
    ['d','m'].forEach(p => showOverlay(p, beatHigh ? '🏆 New High Score!' : '💀 Game Over!', sub, 'Play Again', `Game.start('${p}')`));
  }

  /* ─────────────────────────────────────
     PUBLIC API
  ───────────────────────────────────── */
  function start(prefix) {
    // Tear down any running game first
    if (S.running) {
      clearTimeout(S.spawnTid);
      cancelAnimationFrame(S.rafId);
      clearTimeout(fbTid);
      clearDrops();
    }

    S = {
      ...freshState(),
      hs:     S.hs,   // keep high score across rounds
      prefix: prefix,
      running: true,
    };

    // Hide overlays
    ['d','m'].forEach(p => { const ov = $(`${p}-overlay`); if (ov) ov.classList.remove('active'); });

    // Clear feedback
    $('d-feedback') && ($('d-feedback').className = 'feedback-pill');
    $('m-feedback') && ($('m-feedback').className = 'm-feedback hidden');

    syncUI();
    scheduleSpawn();
    S.rafId = requestAnimationFrame(tick);
  }

  function reset(prefix) {
    clearTimeout(S.spawnTid);
    cancelAnimationFrame(S.rafId);
    clearTimeout(fbTid);
    clearDrops();

    S = { ...freshState(), hs: S.hs, prefix };

    $('d-feedback') && ($('d-feedback').className = 'feedback-pill');
    $('m-feedback') && ($('m-feedback').className = 'm-feedback hidden');

    syncUI();
    ['d','m'].forEach(p => showOverlay(
      p,
      'Water Drop Collector',
      'Click water drops to score.<br>Miss one or click a pollutant → lose a life.<br>Lose all 3 lives → Game Over.',
      'Start Game',
      `Game.start('${p}')`
    ));
  }

  return { start, reset };
})();


/* ================================================================
   CONFETTI ENGINE
   Fires on new high score. Uses charity: water brand colours.
================================================================ */
(function () {
  const canvas = document.getElementById('confettiCanvas');
  const ctx    = canvas.getContext('2d');
  const COLORS = ['#FFC907','#2E9DF7','#8BC34A','#4FC3F7','#E91C23','#FFFFFF'];

  let particles = [];
  let raf       = null;

  function resize() { canvas.width = innerWidth; canvas.height = innerHeight; }
  window.addEventListener('resize', resize);
  resize();

  function Particle() {
    this.x     = Math.random() * canvas.width;
    this.y     = -12;
    this.r     = 5 + Math.random() * 7;
    this.color = COLORS[Math.floor(Math.random() * COLORS.length)];
    this.vx    = (Math.random() - 0.5) * 4;
    this.vy    = 2.5 + Math.random() * 3.5;
    this.spin  = (Math.random() - 0.5) * 0.28;
    this.angle = Math.random() * Math.PI * 2;
    this.rect  = Math.random() < 0.5;
  }

  function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.07; p.angle += p.spin;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      if (p.rect) { ctx.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r); }
      else { ctx.beginPath(); ctx.arc(0,0,p.r,0,Math.PI*2); ctx.fill(); }
      ctx.restore();
    });
    particles = particles.filter(p => p.y < canvas.height + 24);
    raf = particles.length ? requestAnimationFrame(loop) : (ctx.clearRect(0,0,canvas.width,canvas.height), null);
  }

  window.launchConfetti = function () {
    for (let i = 0; i < 180; i++) particles.push(new Particle());
    if (!raf) raf = requestAnimationFrame(loop);
  };
})();