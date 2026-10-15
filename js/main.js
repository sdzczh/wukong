/* 主入口：画布、渲染、输入（拖拽/点选）、主循环、状态流转 */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const Game = {
  /* ---------- 运行控制 ---------- */
  toMenu() {
    resetRun();
    R.state = 'menu';
    Panels.showMenu();
    HUD.refresh();
  },
  startRun() {
    resetRun();
    Director.reset();
    rollRoute();                // 每局随机路线
    Grid.buildTiles();          // 重建棋盘：新路线 + 随机开放格 + 恢复「封」字锁定
    Grid.buildPath();           // 路径像素随新路线重算
    R.state = 'battle';
    Panels.hide();
    RackUI.hideSel();
    RackUI.dealStartChars();
    HUD.refresh();
    HUD.toast('点击架子上的字放到棋盘；铲子可开垦「封」字地块或把单位铲回架子');
  },
  pause() {
    if (R.state !== 'battle') return;
    R.state = 'paused';
    Panels.showPause();
  },
  resume() {
    if (R.state !== 'paused') return;
    R.state = 'battle';
    Panels.hide();
  },
  gameOver(win) {
    if (R.state === 'over') return;
    R.state = 'over';
    R.crystalsEarned += R.wave * 10 + R.kills;
    const s = Save.data;
    s.crystals += R.crystalsEarned;
    s.totalKills += R.kills;
    s.bestWave = Math.max(s.bestWave, R.wave);
    Save.write();
    SFX.play(win ? 'win' : 'lose');
    setTimeout(() => Panels.showSettle(win), 900);
  },

  /* 灵宝掉落（自动拾取） */
  applyDrop(e) {
    const D = CONFIG.drops;
    let kind;
    if (R.hearts >= CONFIG.base.hearts) kind = RNG.next() < 0.5 ? 'peach' : 'might';
    else {
      const r = RNG.next();
      kind = r < 0.45 ? 'peach' : r < 0.8 ? 'might' : 'heart';
    }
    if (kind === 'peach') {
      R.peaches += D.mightPeach;
      FX.float(`灵宝·桃袋 +${D.mightPeach}桃`, e.x, e.y - Grid.tile * 0.3, '#ffd867', 16);
    } else if (kind === 'might') {
      R.mightT = D.mightDur;
      FX.float('灵宝·兵符 全体攻击+20%', e.x, e.y - Grid.tile * 0.3, '#ffb84c', 16);
    } else {
      R.hearts = Math.min(R.heartsMax, R.hearts + 1);
      FX.float('灵宝·轮回符 +1心', e.x, e.y - Grid.tile * 0.3, '#ff8fa0', 16);
    }
    SFX.play('coin');
  },
};

/* ---------- 尺寸适配（整体等比缩放，手机/桌面通用） ---------- */
const view = { k: 1, ox: 0, oy: 0 };

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const vw = window.innerWidth, vh = window.innerHeight;
  const k = Math.min(vw / CONFIG.logicalW, vh / CONFIG.logicalH);
  const stage = document.getElementById('stage');
  // 舞台保持 720×1280 逻辑像素，整体 transform 缩放：
  // DOM HUD 与 canvas 一起缩放，输入换算走 getBoundingClientRect（变换后矩形），天然一致。
  stage.style.transform = 'scale(' + k + ')';

  // 背缓冲密度：显示所需密度为 k*dpr，取 min(dpr, k*dpr) 并夹到 [1, 2]，兼顾清晰与性能
  const density = Math.min(2, Math.max(1, Math.min(dpr, k * dpr)));
  canvas.width = Math.round(CONFIG.logicalW * density);
  canvas.height = Math.round(CONFIG.logicalH * density);

  view.k = canvas.width / CONFIG.logicalW;
  view.ox = 0; view.oy = 0;
  Grid.layout();
  buildScenery();
}

/* ---------- 静态景观（山脊等，预生成） ---------- */
const scenery = { ridges: [], mist: [] };
function buildScenery() {
  scenery.ridges = [];
  const layers = [
    { y: 210, amp: 60, color: '#2c2242', alpha: 0.9, seed: 7 },
    { y: 260, amp: 46, color: '#1e1730', alpha: 1, seed: 23 },
  ];
  for (const L of layers) {
    RNG.seed(L.seed);
    const pts = [];
    for (let x = -40; x <= CONFIG.logicalW + 40; x += 60) {
      pts.push({ x, y: L.y - RNG.next() * L.amp });
    }
    scenery.ridges.push({ pts, color: L.color, alpha: L.alpha, base: L.y + 80 });
  }
  RNG.seed((Date.now() / 60000) | 0);
  scenery.mist = [];
  for (let i = 0; i < 5; i++) {
    scenery.mist.push({
      x: RNG.next() * CONFIG.logicalW, y: 120 + RNG.next() * 200,
      r: 60 + RNG.next() * 90, v: 4 + RNG.next() * 8,
    });
  }
}

/* ---------- 主循环（固定步长） ---------- */
const STEP = 1 / 60;
let last = performance.now(), acc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  acc += dt * R.timeScale;
  while (acc >= STEP) { tick(STEP); acc -= STEP; }
  render(now / 1000);
}

function tick(dt) {
  if (R.state !== 'battle') return;
  if (R.mightT > 0) R.mightT -= dt;
  Director.update(dt);
  for (const e of R.enemies) e.update(dt);
  for (const t of R.towers) t.update(dt, R.enemies);
  for (const p of R.projectiles) p.update(dt);
  R.projectiles = R.projectiles.filter(p => !p.dead);
  R.enemies = R.enemies.filter(e => e.alive);
  FX.update(dt);
  // 波间倒计时每秒刷新
  if (!Director.cur && R.wave > 0 && R.wave < CONFIG.waveCount) {
    const sec = Math.ceil(Director.intermission);
    if (sec !== tick._lastSec) { tick._lastSec = sec; HUD.refresh(); }
  }
}

/* ---------- 渲染 ---------- */
function render(now) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(view.k, 0, 0, view.k, view.ox, view.oy);

  drawBackground(now);
  drawRiver(now);
  drawTiles();
  drawBridgeAndDecor(now);

  for (const t of R.towers) t.draw(ctx);
  for (const e of R.enemies) e.draw(ctx, now);
  for (const p of R.projectiles) p.draw(ctx);
  FX.draw(ctx);
  drawDropHints();

  drawVignette();
}

function drawBackground(now) {
  const g = ctx.createLinearGradient(0, 0, 0, CONFIG.logicalH);
  g.addColorStop(0, '#342a4e');
  g.addColorStop(0.45, '#241b36');
  g.addColorStop(1, '#17111f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CONFIG.logicalW, CONFIG.logicalH);

  for (const ridge of scenery.ridges) {
    ctx.save();
    ctx.globalAlpha = ridge.alpha;
    ctx.fillStyle = ridge.color;
    ctx.beginPath();
    ctx.moveTo(-40, ridge.base);
    for (const p of ridge.pts) ctx.lineTo(p.x, p.y);
    ctx.lineTo(CONFIG.logicalW + 40, ridge.base);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  for (const m of scenery.mist) {
    m.x += m.v * 0.016;
    if (m.x - m.r > CONFIG.logicalW) m.x = -m.r;
    const rg = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r);
    rg.addColorStop(0, '#8d7fb833');
    rg.addColorStop(1, '#8d7fb800');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill();
  }
}

function drawRiver(now) {
  const tile = Grid.tile;
  const y0 = Grid.oy + 5 * tile, h = 3 * tile;
  const x0 = Grid.ox - 8, w = tile * Grid.cols + 16;

  ctx.save();
  const g = ctx.createLinearGradient(0, y0, 0, y0 + h);
  g.addColorStop(0, '#ff9040');
  g.addColorStop(0.5, '#f0601e');
  g.addColorStop(1, '#c23a12');
  ctx.fillStyle = g;
  ctx.fillRect(x0, y0, w, h);

  // 流动高光
  for (let i = 0; i < 4; i++) {
    const yy = y0 + (i + 0.5) * h / 4 + Math.sin(now * 1.6 + i * 1.7) * 6;
    const xx = x0 + ((now * 40 + i * 197) % (w + 240)) - 120;
    const rg = ctx.createRadialGradient(xx, yy, 0, xx, yy, 90);
    rg.addColorStop(0, '#ffd98a55');
    rg.addColorStop(1, '#ffd98a00');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(xx, yy, 90, 0, Math.PI * 2); ctx.fill();
  }
  // 气泡
  for (let i = 0; i < 10; i++) {
    const px = x0 + ((i * 173 + Math.floor(now * 2) * 61) % w);
    const py = y0 + ((i * 97 + Math.floor(now * 3) * 43) % h);
    ctx.fillStyle = '#ffd98a66';
    ctx.beginPath(); ctx.arc(px, py, 2.5 + (i % 3), 0, Math.PI * 2); ctx.fill();
  }
  // 河岸
  ctx.fillStyle = '#3a3344';
  ctx.fillRect(x0, y0 - 4, w, 5);
  ctx.fillRect(x0, y0 + h - 1, w, 5);
  ctx.restore();
}

function drawTiles() {
  const tile = Grid.tile;
  for (let r = 0; r < Grid.rows; r++) {
    for (let c = 0; c < Grid.cols; c++) {
      const t = Grid.tiles[r][c];
      const x = Grid.ox + c * tile, y = Grid.oy + r * tile;
      if (t.type === 'river') continue;
      if (t.type === 'path') {
        ctx.fillStyle = ((c + r) % 2 === 0) ? '#463e55' : '#403850';
        ctx.fillRect(x, y, tile, tile);
        continue;
      }
      // 锁定地块：暗色石板 + 「封」字
      if (t.locked) {
        ctx.fillStyle = '#332c42';
        roundRect(ctx, x + 2, y + 2, tile - 4, tile - 4, 7);
        ctx.fill();
        ctx.fillStyle = '#3d3550';
        roundRect(ctx, x + 5, y + 5, tile - 10, tile - 10, 6);
        ctx.fill();
        ctx.fillStyle = '#5a5074';
        ctx.font = `900 ${Math.round(tile * 0.4)}px "Ma Shan Zheng", "Kaiti SC", "STKaiti", "KaiTi", serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('封', x + tile / 2, y + tile / 2 + 2);
        continue;
      }
      // 紫砖 / 白石
      const isWhite = t.type === 'white';
      ctx.fillStyle = isWhite ? '#e7dfcf' : '#7e6f9e';
      roundRect(ctx, x + 2, y + 2, tile - 4, tile - 4, 7);
      ctx.fill();
      ctx.fillStyle = isWhite ? '#cfc6b2' : '#6d5e8c';
      roundRect(ctx, x + 2, y + tile * 0.55, tile - 4, tile * 0.43 - 2, 7);
      ctx.fill();
      ctx.fillStyle = isWhite ? '#fffdf6' : '#8f80b0';
      roundRect(ctx, x + 4, y + 3, tile - 8, tile * 0.2, 6);
      ctx.fill();
    }
  }
}

function drawBridgeAndDecor(now) {
  const tile = Grid.tile;
  const row = CONFIG.board.bridgeRow;
  const c0 = CONFIG.pathCells[0][0], c1 = CONFIG.pathCells[2][0];   // 桥两端（入口列 / 出口列）

  // 奈何桥（木板只铺在入口列与出口列之间）
  for (let c = c0; c <= c1; c++) {
    const x = Grid.ox + c * tile, y = Grid.oy + row * tile;
    ctx.fillStyle = (c % 2 === 0) ? '#7a5236' : '#6d4830';
    ctx.fillRect(x, y + 3, tile, tile - 6);
    ctx.strokeStyle = '#4a3020'; ctx.lineWidth = 2;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i * tile / 4, y + 4);
      ctx.lineTo(x + i * tile / 4, y + tile - 4);
      ctx.stroke();
    }
  }
  // 桥栏
  ctx.strokeStyle = '#5a3d28'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  const ry0 = Grid.oy + row * tile + 2, ry1 = ry0 + tile - 4;
  ctx.beginPath();
  ctx.moveTo(Grid.ox + c0 * tile, ry0); ctx.lineTo(Grid.ox + (c1 + 1) * tile, ry0);
  ctx.moveTo(Grid.ox + c0 * tile, ry1); ctx.lineTo(Grid.ox + (c1 + 1) * tile, ry1);
  ctx.stroke();
  for (let c = c0; c <= c1 + 1; c += 1) {
    const x = Grid.ox + c * tile;
    ctx.beginPath(); ctx.moveTo(x, ry0 - 2); ctx.lineTo(x, ry1 + 2); ctx.stroke();
  }

  // 鬼门关（路径起点，随入口列移动）
  const gate = Grid.center(CONFIG.pathCells[0][0], CONFIG.pathCells[0][1]);
  ctx.save();
  ctx.translate(gate.x, gate.y);
  const pulse = 0.5 + Math.sin(now * 2) * 0.12;
  const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, tile * 0.85);
  glow.addColorStop(0, `rgba(190,80,90,${pulse * 0.55})`);
  glow.addColorStop(1, 'rgba(190,80,90,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(0, 0, tile * 0.85, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#33263a';
  ctx.strokeStyle = '#8d3a46'; ctx.lineWidth = 3;
  roundRect(ctx, -tile * 0.38, -tile * 0.2, tile * 0.76, tile * 0.62, 6);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#8d3a46';
  ctx.beginPath();
  ctx.moveTo(-tile * 0.5, -tile * 0.2); ctx.lineTo(0, -tile * 0.52); ctx.lineTo(tile * 0.5, -tile * 0.2);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#e8b64c';
  ctx.font = `900 ${Math.round(tile * 0.22)}px "Ma Shan Zheng","Kaiti SC","STKaiti",serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('关', 0, tile * 0.1);
  ctx.restore();

  // 轮回殿（基地）
  const base = Grid.center(CONFIG.base.col, CONFIG.base.row);
  ctx.save();
  ctx.translate(base.x, base.y);
  ctx.fillStyle = '#e8ddc8';
  ctx.strokeStyle = '#8d7a5c'; ctx.lineWidth = 2.5;
  roundRect(ctx, -tile * 0.34, -tile * 0.1, tile * 0.68, tile * 0.5, 5);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#7a2f3a';
  ctx.beginPath();
  ctx.moveTo(-tile * 0.46, -tile * 0.1); ctx.lineTo(0, -tile * 0.46); ctx.lineTo(tile * 0.46, -tile * 0.1);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#3a2a3a';
  ctx.fillRect(-tile * 0.09, tile * 0.12, tile * 0.18, tile * 0.28);
  ctx.fillStyle = '#e8b64c';
  ctx.font = `900 ${Math.round(tile * 0.2)}px "Ma Shan Zheng","Kaiti SC","STKaiti",serif`;
  ctx.textAlign = 'center';
  ctx.fillText('轮回殿', 0, -tile * 0.58);
  ctx.restore();
}

/* 当前持握（拖拽中 / 已点选架子字）的来源/字/等级，无则 null */
function heldItem() {
  const dragging = Input.activeDrag() && R.drag;
  if (dragging && R.drag.src.type === 'board') {
    const u = R.drag.src.unit;
    return { src: 'board', ch: u.def.char, lv: u.level };
  }
  const slot = dragging ? R.drag.src.slot : R.armedSlot;
  if (slot >= 0) {
    const it = R.rack[slot];
    if (!it) return null;
    return it.type === 'char'
      ? { src: 'rack', ch: it.ch, lv: 1 }
      : { src: 'rack', ch: it.unit.def.char, lv: it.unit.level };
  }
  return null;
}

/* 放置/合成预览染色 + 选中信息 */
function drawDropHints() {
  const tile = Grid.tile;
  const h = R.hover;

  // 预览：按真实判定结果显示落点——绿=放置/合成升级，黄=换位，红=不可
  const held = heldItem();
  if (held && h) {
    const t = Grid.tiles[h.r][h.c].tower;
    let state;
    if (!t) {
      state = (Grid.placeable(h.c, h.r) && R.towers.length < CONFIG.towerCap) ? 'ok' : 'fail';
    } else {
      const v = Merge.judge(held.ch, held.lv, t);
      if (v === 'level' || v === 'general-level' || v === 'pair') state = 'ok';
      // 换位只对棋盘↔拖拽有效；架子字落到不可合成的塔上视为不可
      else state = (v === 'swap' && held.src === 'board') ? 'swap' : 'fail';
    }
    const p = Grid.center(h.c, h.r);
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = state === 'ok' ? '#7fe08a' : state === 'swap' ? '#e8c05a' : '#c05a5a';
    roundRect(ctx, p.x - tile * 0.42, p.y - tile * 0.42, tile * 0.84, tile * 0.84, 9);
    ctx.fill();
    // 格角小标：合=可合成 换=换位 ×=不可
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = '#1d1628';
    ctx.font = `900 ${Math.round(tile * 0.3)}px "PingFang SC", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(state === 'ok' ? '合' : state === 'swap' ? '换' : '×',
                 p.x + tile * 0.25, p.y + tile * 0.25);
    ctx.restore();
  }

  // 悬停已有塔 → 显示射程
  if (h && !R.selected) {
    const t = Grid.tiles[h.r][h.c].tower;
    if (t) drawRangeCircle(t, 0.3);
  }
  // 铲子悬停：标记可作用目标（锁定地块 / 已有单位）
  if (R.tool === 'shovel' && h) {
    const t = Grid.tiles[h.r][h.c];
    if (t.locked || t.tower) {
      const p = Grid.center(h.c, h.r);
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = '#ffd867'; ctx.lineWidth = 3;
      ctx.setLineDash([6, 5]);
      roundRect(ctx, p.x - tile * 0.44, p.y - tile * 0.44, tile * 0.88, tile * 0.88, 9);
      ctx.stroke();
      ctx.restore();
    }
  }

  if (R.selected) drawSelectedInfo();
}

function drawSelectedInfo() {
  const t = R.selected;
  if (!t || !R.towers.includes(t)) return;
  drawRangeCircle(t, 0.6);
}

function drawRangeCircle(t, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = '#e8b64c';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.beginPath(); ctx.arc(t.x, t.y, t.rangePx, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function drawVignette() {
  const g = ctx.createRadialGradient(
    CONFIG.logicalW / 2, CONFIG.logicalH / 2, CONFIG.logicalH * 0.36,
    CONFIG.logicalW / 2, CONFIG.logicalH / 2, CONFIG.logicalH * 0.75);
  g.addColorStop(0, '#00000000');
  g.addColorStop(1, '#00000066');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CONFIG.logicalW, CONFIG.logicalH);
}

/* ---------- 输入：点选 + 拖拽（架子↔棋盘） ---------- */
function toLogical(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left) * (CONFIG.logicalW / rect.width),
    y: (clientY - rect.top) * (CONFIG.logicalH / rect.height),
  };
}

const Input = {
  gesture: null,   // {src:{type:'rack',slot}|{type:'board',unit}, x0, y0, dragging}

  activeDrag() { return this.gesture && this.gesture.dragging; },

  /* 架子按下（RackUI 槽位 pointerdown 调这里） */
  slotDown(slot, e) {
    SFX.ensure();
    if (R.state !== 'battle') return;
    const item = R.rack[slot];
    if (!item) return;
    e.preventDefault();
    this.gesture = { src: { type: 'rack', slot }, x0: e.clientX, y0: e.clientY, dragging: false };
  },

  /* 画布按下 */
  canvasDown(e) {
    SFX.ensure();
    if (R.state !== 'battle') return;
    const p = toLogical(e.clientX, e.clientY);
    const cell = Grid.cellAt(p.x, p.y);

    // 铲子工具
    if (R.tool === 'shovel') {
      if (cell) Bus.emit('shovelAt', cell);
      return;
    }

    // 已点选架子字 → 放置
    if (R.armedSlot >= 0) {
      if (!cell) return;
      this.dropRack(R.armedSlot, cell.c, cell.r, true);
      return;
    }

    if (!cell) { RackUI.hideSel(); return; }
    const t = Grid.tiles[cell.r][cell.c].tower;
    if (t) {
      this.gesture = { src: { type: 'board', unit: t }, x0: e.clientX, y0: e.clientY, dragging: false };
    } else {
      RackUI.hideSel();
    }
  },

  move(e) {
    // 悬停（始终更新，给预览染色用）
    const p = toLogical(e.clientX, e.clientY);
    const cell = Grid.cellAt(p.x, p.y);
    R.hover = cell ? { c: cell.c, r: cell.r } : null;

    const g = this.gesture;
    if (!g) return;
    if (!g.dragging) {
      if (Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < 10) return;
      g.dragging = true;
      R.drag = { src: g.src };
      const label = g.src.type === 'rack' ? RackUI.itemLabel(R.rack[g.src.slot]) : g.src.unit.def.char;
      const isGod = g.src.type === 'rack' ? RackUI.itemIsGod(R.rack[g.src.slot]) : g.src.unit.isGeneral;
      RackUI.showGhost(label, isGod);
    }
    RackUI.moveGhost(e.clientX, e.clientY);
  },

  up(e) {
    const g = this.gesture;
    this.gesture = null;
    R.drag = null;
    RackUI.hideGhost();
    if (!g) return;
    if (R.state !== 'battle') return;

    if (!g.dragging) {
      // 点选：架子→arm；棋盘单位→选中
      if (g.src.type === 'rack') {
        R.armedSlot = R.armedSlot === g.src.slot ? -1 : g.src.slot;
        RackUI.hideSel();
        SFX.play('click');
      } else {
        RackUI.showSel(g.src.unit);
        SFX.play('click');
      }
      RackUI.refresh();
      return;
    }

    // 拖拽落下：先查架子槽，再查棋盘
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const slotEl = el && el.closest ? el.closest('.slot') : null;
    if (slotEl && this.rackElContains(slotEl)) {
      const j = Number(slotEl.dataset.slot);
      if (g.src.type === 'rack') {
        // 架内交换
        const i = g.src.slot;
        if (i !== j) { const tmp = R.rack[i]; R.rack[i] = R.rack[j]; R.rack[j] = tmp; SFX.play('place'); }
      } else {
        this.dropBoardOnRack(g.src.unit, j);
      }
      RackUI.refresh();
      return;
    }
    const p = toLogical(e.clientX, e.clientY);
    const cell = Grid.cellAt(p.x, p.y);
    if (!cell) return;
    if (g.src.type === 'rack') this.dropRack(g.src.slot, cell.c, cell.r, false);
    else this.dropBoard(g.src.unit, cell.c, cell.r);
  },

  rackElContains(el) { return RackUI.rackEl && RackUI.rackEl.contains(el); },

  /* 架子字落棋盘（armed=true 时点选路径，失败保留 armed） */
  dropRack(slot, c, r, armed) {
    const item = R.rack[slot];
    if (!item) { R.armedSlot = -1; RackUI.refresh(); return; }
    let res;
    if (item.type === 'unit') {
      res = Merge.placeOnto({ board: item.unit }, c, r);
      if (res.action !== 'fail') R.rack[slot] = null;
    } else {
      res = Merge.placeOnto({ ch: item.ch, slot }, c, r);
      if (res.action !== 'fail' && res.action !== 'swap') R.rack[slot] = null;
      // swap：placeOnto 已把棋盘单位换回架子
    }
    if (res.action === 'fail') {
      HUD.toast(res.reason === 'merge-level' ? '需要两个同字同级的单位才能合成，可拖到空格摆放' : '这里不能摆放');
      if (armed) return;   // 点选模式保留 armed，等待下一次点格
    } else {
      R.armedSlot = -1;
      if (res.unit) RackUI.showSel(res.unit);
    }
    RackUI.refresh();
    HUD.refresh();
  },

  /* 棋盘单位落到另一格 */
  dropBoard(unit, c, r) {
    if (unit.col === c && unit.row === r) { RackUI.showSel(unit); return; }
    const res = Merge.placeOnto({ board: unit }, c, r);
    if (res.action === 'fail') HUD.toast('这里不能摆放');
    else if (res.unit) RackUI.showSel(res.unit);
    RackUI.refresh();
    HUD.refresh();
  },

  /* 棋盘单位拖回架子 */
  dropBoardOnRack(unit, slotIdx) {
    const item = R.rack[slotIdx];
    if (!item) {
      Merge.removeUnit(unit);
      R.rack[slotIdx] = { type: 'unit', unit };
      SFX.play('place');
      return;
    }
    if (item.type === 'char') {
      // 字上棋盘（占该单位格），单位回架
      const c = unit.col, r = unit.row;
      Merge.removeUnit(unit);
      Merge.makeUnit(Merge.towerKeyOfChar(item.ch), c, r);
      R.rack[slotIdx] = { type: 'unit', unit };
      SFX.play('place');
    }
    // 架上已是单位：不处理（无空间交换意义）
  },
};

RackUI.rackElContains = el => RackUI.rackEl && RackUI.rackEl.contains(el);

canvas.addEventListener('pointerdown', e => Input.canvasDown(e));
window.addEventListener('pointermove', e => Input.move(e));
window.addEventListener('pointerup', e => Input.up(e));
// 移动端：系统手势（下拉通知/来电打断）触发 pointercancel，按抬起处理，避免手势悬死
window.addEventListener('pointercancel', e => Input.up(e));
canvas.addEventListener('pointerleave', () => { R.hover = null; });
document.getElementById('stage').addEventListener('contextmenu', e => {
  e.preventDefault();
  R.tool = null; R.armedSlot = -1;
  RackUI.hideSel();
  RackUI.refresh();
});
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (R.armedSlot >= 0 || R.tool) { R.armedSlot = -1; R.tool = null; RackUI.refresh(); }
    else if (R.state === 'battle') Game.pause();
    else if (R.state === 'paused') Game.resume();
  }
  if (e.key === 'p') {
    if (R.state === 'battle') Game.pause();
    else if (R.state === 'paused') Game.resume();
  }
});
window.addEventListener('resize', resize);

/* ---------- 事件绑定 ---------- */
Bus.on('togglePause', () => { R.state === 'battle' ? Game.pause() : Game.resume(); });

Bus.on('enemyKilled', e => {
  R.peaches += e.def.reward;
  R.kills += 1;
  SFX.play('die');
  if (R.kills % 3 === 0) SFX.play('coin');
  FX.float('+' + e.def.reward + ' 桃', e.x, e.y - Grid.tile * 0.2, '#ffd867', 15);
  const src = e.lastHitBy;
  if (src && src.isGeneral) src.gainExp(1);
  if (src && src.key === 'wukong') { Save.data.wukongKills++; Save.write(); }
  const dropChance = e.type === 'boss' ? CONFIG.drops.bossChance : CONFIG.drops.chance;
  if (RNG.next() < dropChance) Game.applyDrop(e);
  HUD.refresh();
});

Bus.on('leak', e => {
  R.hearts = Math.max(0, R.hearts - e.def.dmg);
  const base = Grid.center(CONFIG.base.col, CONFIG.base.row);
  FX.ring(base.x, base.y, Grid.tile * 0.5, '#ff6b81');
  FX.float('-' + e.def.dmg + ' 心', base.x, base.y - Grid.tile * 0.8, '#ff6b81', 19);
  SFX.play('leak');
  if (R.hearts > 0 && R.hearts <= 3) SFX.play('danger');
  HUD.refresh();
  if (R.hearts <= 0) Game.gameOver(false);
});

Bus.on('waveStart', n => {
  const sub = n % 5 === 0 ? '鬼将亲至，小心应对！' : (n === 1 ? '黄泉为路，幽冥作甲，众魂出击！' : '跨过奈何，忘却轮回，杀！');
  HUD.showBanner('第 ' + n + ' 波', sub);
  SFX.play('horn');
  HUD.refresh();
});

Bus.on('waveClear', n => {
  const reward = CONFIG.economy.waveRewardBase + n;
  R.peaches += reward;
  HUD.refresh();
  HUD.toast(`第 ${n} 波已肃清，过波奖励 +${reward} 桃`);
  SFX.play('waveclear');
  if (n >= CONFIG.waveCount) Game.gameOver(true);
});

/* 铲子：开垦「封」字地块；点单位则铲回架子（架满则铲除） */
Bus.on('shovelAt', cell => {
  const tile = Grid.tiles[cell.r][cell.c];
  if (R.shovelLeft <= 0) { R.tool = null; RackUI.refresh(); return; }

  // 开垦新地块
  if (tile.locked) {
    tile.locked = false;
    R.shovelLeft--;
    R.tool = null;
    const p = Grid.center(cell.c, cell.r);
    FX.ring(p.x, p.y, Grid.tile * 0.55, '#d9cdb4');
    FX.float('开垦', p.x, p.y - Grid.tile * 0.3, '#d9cdb4', 16);
    SFX.play('place');
    HUD.toast('开垦新地块');
    RackUI.refresh();
    HUD.refresh();
    return;
  }

  const t = tile.tower;
  if (!t) { HUD.toast('点「封」字地块开垦，或点单位铲回架子'); return; }
  const slot = R.rack.findIndex(x => !x);
  Merge.removeUnit(t);
  if (slot >= 0) {
    R.rack[slot] = { type: 'unit', unit: t };
    HUD.toast('已铲回架子');
  } else {
    HUD.toast('架子已满，单位已铲除');
  }
  R.shovelLeft--;
  R.tool = null;
  SFX.play('place');
  FX.float('铲', t.x, t.y - Grid.tile * 0.3, '#d9cdb4', 16);
  RackUI.refresh();
  HUD.refresh();
});

/* ---------- 每局随机路线 ---------- */
/* 入口列 ∈ {0,1,2}、桥行 ∈ 冥河行、出口列 ∈ {6,7,8}，27 种走法；
   同步改写 CONFIG.pathCells / bridgeRow / base.col，下游全部自动跟随 */
function rollRoute() {
  const river = CONFIG.board.riverRows;
  const bridgeRow = river[RNG.int(river.length)];
  const entryCol = RNG.int(3);            // 0..2
  const exitCol = 6 + RNG.int(3);         // 6..8
  CONFIG.board.bridgeRow = bridgeRow;
  CONFIG.base.col = exitCol;
  CONFIG.pathCells = [[entryCol, 0], [entryCol, bridgeRow], [exitCol, bridgeRow], [exitCol, CONFIG.board.rows - 1]];
}

/* ---------- 启动 ---------- */
Save.load();
RNG.seed((Math.random() * 1e9) | 0);
Grid.init();
HUD.init();
RackUI.init();
Panels.init();
resize();
// 首次启动先录名号，之后回主菜单
if (User.has()) Game.toMenu();
else Panels.showNameEntry(() => Game.toMenu());
// 预加载展示字体（canvas 逐帧重绘，就绪后自然生效）
document.fonts.load('64px "Ma Shan Zheng"').catch(() => {});
requestAnimationFrame(frame);

/* ---------- 调试/自动化验收 API ---------- */
window.GAME = {
  R, CONFIG, Grid, Director, Bus, Merge, RackUI, User, Input,
  startRun: () => Game.startRun(),
  place: (c, r, key) => {
    if (!Grid.placeable(c, r) || R.towers.length >= CONFIG.towerCap) return false;
    Merge.makeUnit(key, c, r);
    return true;
  },
  give: ch => {
    const slot = R.rack.findIndex(x => !x);
    if (slot < 0) return -1;
    R.rack[slot] = { type: 'char', ch };
    RackUI.refresh();
    return slot;
  },
  summon: () => RackUI.doSummon(),
  dropRack: (slot, c, r) => Input.dropRack(slot, c, r, false),
  dropBoard: (c0, r0, c1, r1) => {
    const t = Grid.tiles[r0][c0].tower;
    if (!t) return null;
    Input.dropBoard(t, c1, r1);
    return Grid.tiles[r1] && Grid.tiles[r1][c1].tower;
  },
  sell: () => RackUI.sellSelected(),
  shovel: (c, r) => Bus.emit('shovelAt', { c, r }),
  cast: key => {
    const g = R.towers.find(t => t.isGeneral && t.key === key);
    if (g) { Skills.cast(g); return true; }
    return false;
  },
  drop: () => Game.applyDrop({ x: Grid.center(4, 3).x, y: Grid.center(4, 3).y }),
  buy: (b, i) => Talents.buy(b, i),
  setCrystals: n => { Save.data.crystals = n; Save.write(); },
  setWukongKills: n => { Save.data.wukongKills = n; Save.write(); },
  killAll: () => R.enemies.forEach(e => e.takeDamage(999999)),
  setTimeScale: x => { R.timeScale = x; },
  step: seconds => { const n = Math.round(seconds / STEP); for (let i = 0; i < n; i++) tick(STEP); },
  render: () => render(performance.now() / 1000),
  snapshot: () => ({
    state: R.state, wave: R.wave, hearts: R.hearts, peaches: R.peaches,
    kills: R.kills, enemies: R.enemies.filter(e => e.alive).length,
    towers: R.towers.length, rack: R.rack.map(x => x ? (x.type === 'char' ? x.ch : x.unit.def.char + ':' + x.unit.level) : null),
    pityMiss: R.pityMiss, shovelLeft: R.shovelLeft, crystalsEarned: R.crystalsEarned,
    save: { ...Save.data },
  }),
};
