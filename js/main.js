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
    Grid.resetTowers();
    R.state = 'battle';
    Panels.hide();
    RackUI.hideSel();
    RackUI.dealStartChars();
    HUD.refresh();
    HUD.toast('点击架子上的字放到棋盘；两个相同的字叠放可升级');
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
};

/* ---------- 尺寸适配 ---------- */
const view = { k: 1, ox: 0, oy: 0 };

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const vw = window.innerWidth, vh = window.innerHeight;
  const scale = Math.min(vw / CONFIG.logicalW, vh / CONFIG.logicalH);
  const cssW = Math.round(CONFIG.logicalW * scale), cssH = Math.round(CONFIG.logicalH * scale);
  const stage = document.getElementById('stage');
  stage.style.width = cssW + 'px';
  stage.style.height = cssH + 'px';
  stage.style.transform = '';

  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);

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
  Director.update(dt);
  for (const e of R.enemies) e.update(dt);
  for (const t of R.towers) t.update(dt, R.enemies);
  for (const p of R.projectiles) p.update(dt);
  R.projectiles = R.projectiles.filter(p => !p.dead);
  R.enemies = R.enemies.filter(e => e.alive);
  FX.update(dt);
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
  drawDropHints();

  for (const t of R.towers) t.draw(ctx);
  for (const e of R.enemies) e.draw(ctx, now);
  for (const p of R.projectiles) p.draw(ctx);
  FX.draw(ctx);

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

  // 奈何桥（木板铺在桥行上）
  for (let c = 0; c < Grid.cols; c++) {
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
  ctx.moveTo(Grid.ox, ry0); ctx.lineTo(Grid.ox + tile * Grid.cols, ry0);
  ctx.moveTo(Grid.ox, ry1); ctx.lineTo(Grid.ox + tile * Grid.cols, ry1);
  ctx.stroke();
  for (let c = 0; c <= Grid.cols; c += 1) {
    const x = Grid.ox + c * tile;
    ctx.beginPath(); ctx.moveTo(x, ry0 - 2); ctx.lineTo(x, ry1 + 2); ctx.stroke();
  }

  // 鬼门关（路径起点）
  const gate = Grid.center(0, 0);
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

/* 放置/合成预览染色 + 选中信息 */
function drawDropHints() {
  const tile = Grid.tile;
  const h = R.hover;

  // 预览：拖拽中或已点选架子字 → 显示落点可行性
  const preview = Input.activeDrag() || (R.armedSlot >= 0 && R.rack[R.armedSlot]);
  if (preview && h) {
    const t = Grid.tiles[h.r][h.c];
    const occupied = !!t.tower;
    let ok;
    if (occupied) ok = true;                                   // 有单位必可（合成/换位）
    else ok = Grid.placeable(h.c, h.r) && R.towers.length < CONFIG.towerCap;
    const p = Grid.center(h.c, h.r);
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = ok ? '#7fe08a' : '#c05a5a';
    roundRect(ctx, p.x - tile * 0.42, p.y - tile * 0.42, tile * 0.84, tile * 0.84, 9);
    ctx.fill();
    ctx.restore();
  }

  // 悬停已有塔 → 显示射程
  if (h && !R.selected) {
    const t = Grid.tiles[h.r][h.c].tower;
    if (t) drawRangeCircle(t, 0.3);
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
      HUD.toast('这里不能摆放');
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
canvas.addEventListener('pointerleave', () => { R.hover = null; });
canvas.addEventListener('contextmenu', e => {
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
  HUD.refresh();
});

Bus.on('leak', e => {
  R.hearts = Math.max(0, R.hearts - e.def.dmg);
  const base = Grid.center(CONFIG.base.col, CONFIG.base.row);
  FX.ring(base.x, base.y, Grid.tile * 0.5, '#ff6b81');
  FX.float('-' + e.def.dmg + ' 心', base.x, base.y - Grid.tile * 0.8, '#ff6b81', 19);
  SFX.play('leak');
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
  if (n >= CONFIG.waveCount) Game.gameOver(true);
});

/* 铲子：把单位铲回架子（架满则铲除） */
Bus.on('shovelAt', cell => {
  const t = Grid.tiles[cell.r][cell.c].tower;
  if (!t) { HUD.toast('这里没有单位'); return; }
  if (R.shovelLeft <= 0) { R.tool = null; RackUI.refresh(); return; }
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

/* ---------- 启动 ---------- */
Save.load();
RNG.seed((Math.random() * 1e9) | 0);
Grid.init();
HUD.init();
RackUI.init();
Panels.init();
resize();
Game.toMenu();
requestAnimationFrame(frame);

/* ---------- 调试/自动化验收 API ---------- */
window.GAME = {
  R, CONFIG, Grid, Director, Bus, Merge, RackUI,
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
