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
    GearUI.open = false;        // 装备栏复位（如中途弃赛回菜单）
    GearUI.refresh();
    WaveMods.render();          // 收起波间三选一（如中途弃选回菜单）
  },
  startRun(seedKey, kind) {
    kind = kind || 'normal';
    // 每日轮回/每周异变传种子（同图同卡池）；普通局恢复随机种子
    RNG.seed(seedKey || ((Date.now() >>> 0) || 1));
    resetRun();
    R.runKind = kind;
    R.daily = kind === 'daily' ? (seedKey || null) : null;
    if (kind === 'weekly') Weekly.apply();   // 本周 3 条全局规则并入 R.rules
    Director.reset();
    rollRoute();                // 每局随机路线
    Grid.buildTiles();          // 重建棋盘：新路线 + 随机开放格 + 恢复「封」字锁定
    calibrateRangeFloor();      // 按最远离径开放格校准当局射程地板
    Grid.buildPath();           // 路径像素随新路线重算
    R.state = 'battle';
    Panels.hide();
    RackUI.hideSel();
    RackUI.discardDraft();
    RackUI.dealStartChars();
    HUD.refresh();
    GearUI.open = false;        // 装备栏默认收起，顶栏「装」按钮开合
    GearUI.refresh();
    WaveMods.render();          // 复位波间三选一（隐藏上一局残留）
    HUD.toast(kind === 'weekly'
      ? '每周异变：' + R.weekly.map(p => p.name).join(' · ')
      : R.daily ? '每日轮回：今日全场同图，比谁走得更远'
      : '点击架子上的字放到棋盘；铲子可开垦「封」字地块或把单位铲回架子');
  },

  /* 每日轮回：按日期种子开局（固定路线与抽卡序列） */
  startDaily() {
    const d = new Date();
    this.startRun(d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(), 'daily');
  },

  /* 每周异变：按 ISO 周种子开局 + 3 条全局规则，结算计每周最佳 */
  startWeekly() {
    this.startRun(Weekly.seedKey(), 'weekly');
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
    R.lastWin = win;
    if (RackUI.draftBar) RackUI.discardDraft();
    R.crystalsEarned += R.wave * 10 + R.kills;
    const s = Save.data;
    s.crystals += R.crystalsEarned;
    s.totalKills += R.kills;
    s.bestWave = Math.max(s.bestWave, R.wave);
    if (R.daily) {
      // 每日轮回：只记录当日的最佳波次
      if (!s.daily || s.daily.key !== R.daily) s.daily = { key: R.daily, best: 0 };
      s.daily.best = Math.max(s.daily.best, R.wave);
    }
    if (R.runKind === 'weekly') {
      const wk = Weekly.key();
      if (!s.weekly || s.weekly.key !== wk) s.weekly = { key: wk, best: 0 };
      s.weekly.best = Math.max(s.weekly.best, R.wave);
    }
    Save.write();
    SFX.play(win ? 'win' : 'lose');
    setTimeout(() => Panels.showSettle(win), 900);
  },

  /* 通关第 10 波后：暂停并询问是否进入无尽征战 */
  offerEndless() {
    if (R.state !== 'battle') return;
    R.state = 'paused';
    Panels.showEndlessOffer();
  },
  enterEndless() {
    R.endless = true;
    this.resume();
    HUD.toast(`无尽征战开始！每 ${CONFIG.endless.shovelEvery} 波奖励 1 把铲子`);
    HUD.refresh();
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
  // 视口扣除安全区内边距（刘海/Home 条），舞台在安全区内居中
  const cs = getComputedStyle(document.body);
  const safeX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const safeY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const vw = window.innerWidth - safeX, vh = window.innerHeight - safeY;
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
  // 波间倒计时每秒刷新（无尽模式同样适用）
  if (!Director.cur && R.wave > 0 && (R.wave < CONFIG.waveCount || R.endless)) {
    const sec = Math.ceil(Director.intermission);
    if (sec !== tick._lastSec) { tick._lastSec = sec; HUD.refresh(); }
  }
}

/* ---------- 渲染 ---------- */
function render(now) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // 屏震：整体画面在逻辑坐标上随机偏移
  const sh = FX.shakeOffset();
  ctx.setTransform(view.k, 0, 0, view.k, view.ox + sh.x * view.k, view.oy + sh.y * view.k);

  drawBackground(now);
  drawTiles();
  drawDecor(now);

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

function drawTiles() {
  const tile = Grid.tile;
  for (let r = 0; r < Grid.rows; r++) {
    for (let c = 0; c < Grid.cols; c++) {
      const t = Grid.tiles[r][c];
      const x = Grid.ox + c * tile, y = Grid.oy + r * tile;
      if (t.type === 'path') {
        // 黄泉路：满格连续路面（刻意与圆角砖的独立圆角砖区分形状语言），微色差防呆板
        ctx.fillStyle = ((c + r) % 2 === 0) ? '#b29460' : '#ab8d5a';
        ctx.fillRect(x, y, tile, tile);
        // 车道虚线：朝每个路径邻格方向画一段，全图连通成引导线
        const T = Grid.tiles;
        const up = T[r - 1] && T[r - 1][c].type === 'path';
        const dn = T[r + 1] && T[r + 1][c].type === 'path';
        const lf = T[r][c - 1] && T[r][c - 1].type === 'path';
        const rt = T[r][c + 1] && T[r][c + 1].type === 'path';
        const cx = x + tile / 2, cy = y + tile / 2;
        const dw = tile * 0.09, dl = tile * 0.3, dOff = tile * 0.1;
        ctx.fillStyle = '#e8d5a5';
        if (up) { roundRect(ctx, cx - dw / 2, cy - dOff - dl, dw, dl, dw / 2); ctx.fill(); }
        if (dn) { roundRect(ctx, cx - dw / 2, cy + dOff, dw, dl, dw / 2); ctx.fill(); }
        if (lf) { roundRect(ctx, cx - dOff - dl, cy - dw / 2, dl, dw, dw / 2); ctx.fill(); }
        if (rt) { roundRect(ctx, cx + dOff, cy - dw / 2, dl, dw, dw / 2); ctx.fill(); }
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

/* 场景点缀：鬼门关（路径起点）与轮回殿（基地），均随随机路线移动 */
function drawDecor(now) {
  const tile = Grid.tile;

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
      ? { src: 'rack', ch: it.ch, lv: it.lv || 1 }
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
    this.hideItemPanel();
    this.gesture = { src: { type: 'rack', slot }, x0: e.clientX, y0: e.clientY, dragging: false };
    // 长按 550ms 无拖动 → 打开字卡面板（出售/献祭）
    clearTimeout(this._lpTimer);
    this._lpTimer = setTimeout(() => {
      if (this.gesture && !this.gesture.dragging && this.gesture.src.type === 'rack') {
        this.gesture = null;
        SFX.play('click');
        RackUI.showItemPanel(slot);
      }
    }, 550);
  },

  /* 画布按下 */
  canvasDown(e) {
    SFX.ensure();
    if (R.state !== 'battle') return;
    this.hideItemPanel();
    Panels.hideUnlock();
    const p = toLogical(e.clientX, e.clientY);
    const cell = Grid.cellAt(p.x, p.y);

    // 铲子工具
    if (R.tool === 'shovel') {
      this._lastTap = null;
      if (cell) Bus.emit('shovelAt', cell);
      return;
    }

    // 佩戴装备：点塔戴上，点空地取消
    if (R.gearArm >= 0) {
      this._lastTap = null;
      const idx = R.gearArm;
      R.gearArm = -1;
      if (cell) {
        const t = Grid.tiles[cell.r][cell.c].tower;
        if (t) {
          const err = Gear.equipTo(t, idx);
          if (err) { HUD.toast(err); SFX.play('click'); }
        }
      }
      GearUI.refresh();
      RackUI.refresh();
      return;
    }

    // 已点选架子字 → 放置
    if (R.armedSlot >= 0) {
      this._lastTap = null;
      if (!cell) return;
      this.dropRack(R.armedSlot, cell.c, cell.r, true);
      return;
    }

    if (!cell) { this._lastTap = null; RackUI.hideSel(); return; }
    const tile = Grid.tiles[cell.r][cell.c];

    /* 双击「封」字地块 → 弹开垦确认（消耗 1 把铲子） */
    if (tile.locked) {
      if (R.draft && R.draft.length) { this._lastTap = null; return; }
      const now = performance.now();
      const lt = this._lastTap;
      const dbl = lt && lt.c === cell.c && lt.r === cell.r && now - lt.t < 400;
      this._lastTap = dbl ? null : { t: now, c: cell.c, r: cell.r };
      if (R.shovelLeft <= 0) {
        HUD.toast('铲子已用完（无尽征战每 5 波补给 1 把）');
        RackUI.hideSel();
        return;
      }
      if (dbl) { Panels.showUnlock(cell); SFX.play('click'); }
      else {
        HUD.toast(`双击开垦「封」字地块（铲子剩 ${R.shovelLeft} 把）`);
        RackUI.hideSel();
      }
      return;
    }
    this._lastTap = null;

    const t = tile.tower;
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
      clearTimeout(this._lpTimer);
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
    clearTimeout(this._lpTimer);
    RackUI.hideGhost();
    if (!g) return;
    if (R.state !== 'battle') return;

    if (!g.dragging) {
      // 点选：架子→arm；棋盘单位→选中
      if (g.src.type === 'rack') {
        const now = performance.now();
        const lt = this._lastSlotTap;
        const dbl = lt && lt.slot === g.src.slot && now - lt.t < 400;
        this._lastSlotTap = dbl ? null : { t: now, slot: g.src.slot };
        if (dbl && this.autoMerge(g.src.slot)) return;   // 双击卡：自动合成场上同字同级/配对目标
        R.armedSlot = R.armedSlot === g.src.slot ? -1 : g.src.slot;
        // 首次 arm 且场上有可合成目标 → 教一次双击
        if (R.armedSlot === g.src.slot && !this._mergeTipShown && this.findMergeTarget(g.src.slot)) {
          this._mergeTipShown = true;
          HUD.toast('双击卡片，可自动合成场上的同字同级单位（神将字则自动凑对）');
        }
        RackUI.hideSel();
        SFX.play('click');
      } else {
        RackUI.showSel(g.src.unit);
        SFX.play('click');
      }
      RackUI.refresh();
      return;
    }
    this._lastSlotTap = null;   // 拖拽不参与双击判定

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

  hideItemPanel() { clearTimeout(this._lpTimer); RackUI.hideItemPanel(); },

  /* 架子字落棋盘（armed=true 时点选路径，失败保留 armed） */
  dropRack(slot, c, r, armed) {
    const item = R.rack[slot];
    if (!item) { R.armedSlot = -1; RackUI.refresh(); return; }
    let res;
    if (item.type === 'unit') {
      res = Merge.placeOnto({ board: item.unit }, c, r);
      if (res.action !== 'fail') R.rack[slot] = null;
    } else {
      res = Merge.placeOnto({ ch: item.ch, slot, lv: item.lv || 1 }, c, r);
      if (res.action !== 'fail' && res.action !== 'swap') R.rack[slot] = null;
      // swap：placeOnto 已把棋盘单位换回架子
    }
    if (res.action === 'fail') {
      HUD.toast(res.reason === 'merge-level' ? '需要两个同字同级的单位才能合成，可拖到空格摆放' : '这里不能摆放');
      if (armed) return;   // 点选模式保留 armed，等待下一次点格
    } else {
      R.armedSlot = -1;    // 放置成功不弹详情，避免遮挡（点塔仍可查看）
    }
    RackUI.refresh();
    HUD.refresh();
  },

  /* 场上可合成的目标（双击合成 / 提示用）：同字同级、同级同名神将、神将字配对 */
  findMergeTarget(slot) {
    const item = R.rack[slot];
    if (!item) return null;
    const aChar = item.type === 'unit' ? item.unit.def.char : item.ch;
    const aLevel = item.type === 'unit' ? item.unit.level : (item.lv || 1);
    for (const t of R.towers) {
      const v = Merge.judge(aChar, aLevel, t);
      if (v === 'level' || v === 'general-level' || v === 'pair') return t;
    }
    return null;
  },

  /* 双击架子卡：有目标走正常落子链路立即合成；没有则提示原因 */
  autoMerge(slot) {
    const item = R.rack[slot];
    if (!item) return false;
    const t = this.findMergeTarget(slot);
    if (t) { this.dropRack(slot, t.col, t.row, false); return true; }
    const aChar = item.type === 'unit' ? item.unit.def.char : item.ch;
    const isLing = item.type === 'unit'
      ? String(item.unit.key).startsWith('ling:')
      : !CONFIG.charToTower[aChar];
    if (item.type === 'unit' && item.unit.isGeneral) {
      HUD.toast('场上没有同级同名神将可升级');
    } else if (isLing) {
      const ph = Merge.pairHintOf(aChar);
      HUD.toast(ph ? `场上没有「${ph.with}」字塔可凑对唤醒神将` : '场上没有可配对的目标');
    } else {
      HUD.toast(`场上没有同字同级的${aChar}单位可升级`);
    }
    return false;
  },

  /* 棋盘单位落到另一格 */
  dropBoard(unit, c, r) {
    if (unit.col === c && unit.row === r) { RackUI.showSel(unit); return; }
    const res = Merge.placeOnto({ board: unit }, c, r);
    if (res.action === 'fail') HUD.toast('这里不能摆放');
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
  R.tool = null; R.armedSlot = -1; R.gearArm = -1;
  RackUI.hideSel();
  GearUI.refresh();
  RackUI.refresh();
});
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (R.armedSlot >= 0 || R.tool || R.gearArm >= 0) { R.armedSlot = -1; R.tool = null; R.gearArm = -1; RackUI.refresh(); GearUI.refresh(); }
    else if (R.state === 'battle') Game.pause();
    else if (R.state === 'paused') Game.resume();
  }
  if (e.key === 'p') {
    if (R.state === 'battle') Game.pause();
    else if (R.state === 'paused') Game.resume();
  }
});
window.addEventListener('resize', resize);

/* ---------- iOS Safari：彻底封锁双击/捏合缩放 ----------
   viewport 的 user-scalable=no 在部分 iOS 版本被忽略，纯 CSS touch-action 也偶有漏网，
   这里再补两道保险：
   1) 捏合缩放：拦截 Safari 专有 gesture 事件；
   2) 双击缩放：两次 touchend 相隔 <320ms 即拦截（输入控件与按钮除外，
      避免吞掉连点召唤等快速点击的 click）。
   游戏内自己的「双击开垦」判定走 pointerdown，不受此处影响。 */
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(ev, e => e.preventDefault(), { passive: false });
}
let _lastTouchEnd = 0;
document.addEventListener('touchend', e => {
  const t = e.target;
  if (t && t.closest && t.closest('input, textarea, button, .btn, .draft-card, .mod-card, .bless-chip')) return;
  const now = Date.now();
  if (now - _lastTouchEnd <= 320) e.preventDefault();
  _lastTouchEnd = now;
}, { passive: false });

/* ---------- 事件绑定 ---------- */
Bus.on('togglePause', () => { R.state === 'battle' ? Game.pause() : Game.resume(); });

Bus.on('enemyKilled', e => {
  // 击杀收益：精英 ×奖励倍率，每周「丰收」×桃倍率，波间「聚宝」+固定值
  const peachMul = (e.rewardMul || 1) * (R.rules ? R.rules.peachAwardMul : 1);
  const reward = Math.max(1, Math.round(e.def.reward * peachMul + R.mods.peach * CONFIG.waveMods.steps.peach));
  R.peaches += reward;
  R.kills += 1;
  SFX.play('die');
  if (R.kills % 3 === 0) SFX.play('coin');
  FX.float('+' + reward + ' 桃', e.x, e.y - Grid.tile * 0.2, '#ffd867', 15);
  const src = e.lastHitBy;
  if (src && src.isGeneral) src.gainExp((e.def.exp || 1) * (e.expMul || 1));
  if (src && src.key === 'wukong') { Save.data.wukongKills++; Save.write(); }
  let dropChance = e.type === 'boss' ? CONFIG.drops.bossChance : CONFIG.drops.chance;
  // 无尽征战掉率衰减：第 10 波后每波 ×0.85，掉落运气不再是续命主力
  if (R.endless && R.wave > CONFIG.waveCount) {
    dropChance *= Math.pow(CONFIG.drops.endlessDecay, R.wave - CONFIG.waveCount);
  }
  if (RNG.next() < dropChance) Game.applyDrop(e);
  Gear.onKill(e);   // 装备部件 / boss 专属碎片
  HUD.refresh();
});

Bus.on('leak', e => {
  R.hearts = Math.max(0, R.hearts - e.def.dmg);
  const base = Grid.center(CONFIG.base.col, CONFIG.base.row);
  FX.ring(base.x, base.y, Grid.tile * 0.5, '#ff6b81');
  FX.float('-' + e.def.dmg + ' 心', base.x, base.y - Grid.tile * 0.8, '#ff6b81', 19);
  FX.shake(9, 0.5);          // 扣心屏震
  HUD.flashDamage();         // 屏幕边缘红闪
  SFX.play('leak');
  if (R.hearts > 0 && R.hearts <= 3) SFX.play('danger');
  HUD.refresh();
  if (R.hearts <= 0) Game.gameOver(false);
});

Bus.on('waveStart', n => {
  const boss = n % 5 === 0;
  const sub = R.endless
    ? (boss ? '无尽征战，鬼将亲至！' : '无尽征战，敌势无穷！')
    : (boss ? '鬼将亲至，小心应对！' : (n === 1 ? '黄泉为路，幽冥作甲，众魂出击！' : '魂行黄泉，忘却轮回，杀！'));
  HUD.showBanner('第 ' + n + ' 波', sub, boss);
  SFX.play(boss ? 'alarm' : 'horn');
  HUD.refresh();
});

Bus.on('waveClear', n => {
  R.blessWave = {};   // 瑶池祝福过波失效（价格递增保留）
  const reward = CONFIG.economy.waveRewardBase + n;
  R.peaches += reward;
  // 息钱：持桃生息（每 10 桃 +1，单波上限；每周「聚财」翻倍、词条「钱庄」抬上限）
  const cap = CONFIG.economy.interestCap + R.mods.interest * CONFIG.waveMods.steps.interest;
  const interest = Math.min(cap, Math.floor(R.peaches / CONFIG.economy.interestEvery * (R.rules ? R.rules.interestMul : 1)));
  if (interest > 0) R.peaches += interest;
  // 神将保底经验仅限前十波（无尽里靠击杀强度吃饭，配合随级递增的经验线）
  if (!R.endless) for (const t of R.towers) if (t.isGeneral) t.gainExp(1);
  HUD.refresh();
  SFX.play('waveclear');
  HUD.toast(`第 ${n} 波已肃清，过波奖励 +${reward} 桃${interest ? `，息钱 +${interest} 桃` : ''}`);
  if (n >= CONFIG.waveMods.every && n % CONFIG.waveMods.every === 0) WaveMods.offer();   // 命运三选一
  if (n < CONFIG.waveCount) return;
  if (R.endless) {
    // 无尽补给：每 shovelEvery 波产出 1 把铲子
    if (n % CONFIG.endless.shovelEvery === 0) {
      R.shovelLeft++;
      setTimeout(() => { HUD.toast(`无尽补给：铲子 +1（现有 ${R.shovelLeft}）`); SFX.play('coin'); }, 1600);
      HUD.refresh();
    }
  } else {
    Game.offerEndless();
  }
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
    if (t.gear) { R.equips.push(t.gear); GearUI.refresh(); }   // 架满铲除，装备回库
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
/* 入口列 ∈ {0,1,2}、横穿行 ∈ {5,6,7}、出口列 ∈ {6,7,8}，27 种走法；
   同步改写 CONFIG.pathCells / crossRow / base.col，下游全部自动跟随 */
function rollRoute() {
  const crossRow = 5 + RNG.int(3);        // 横穿行（原冥河三行，保留路线变化）
  const entryCol = RNG.int(3);            // 0..2
  const exitCol = 6 + RNG.int(3);         // 6..8
  CONFIG.board.crossRow = crossRow;
  CONFIG.base.col = exitCol;
  CONFIG.pathCells = [[entryCol, 0], [entryCol, crossRow], [exitCol, crossRow], [exitCol, CONFIG.board.rows - 1]];
}

/* ---------- 射程校准 ----------
   随机开放格里，距路径 ≤2.85 格的「近路径格」最远距离记为 worst（远池格
   可达 6 格以外，若托底会把所有攻击单位变成全图狙手，故不参与）。
   地板 = worst + 0.15 余量（封顶 3.0）：余量保证敌人路过最近点时
   会在射程内停留 1 格以上的窗口，而不是擦着边界永远打不中。
   战鼓光环（kind:'aura'）不参与。 */
function calibrateRangeFloor() {
  const T = Grid.tiles;
  const pathCells = [];
  for (let r = 0; r < Grid.rows; r++) {
    for (let c = 0; c < Grid.cols; c++) {
      if (T[r][c].type === 'path') pathCells.push({ c, r });
    }
  }
  let worst = 0;
  for (let r = 0; r < Grid.rows; r++) {
    for (let c = 0; c < Grid.cols; c++) {
      const t = T[r][c];
      if (t.locked || (t.type !== 'white' && t.type !== 'purple')) continue;
      let best = Infinity;
      for (const p of pathCells) {
        const d = Math.hypot(p.c - c, p.r - r);
        if (d < best) best = d;
      }
      if (best <= 2.85 && best > worst) worst = best;
    }
  }
  R.rangeFloor = Math.min(3.0, Math.ceil((worst + 0.15) * 10) / 10);
}

/* ---------- 启动 ---------- */
Save.load();
RNG.seed((Math.random() * 1e9) | 0);
Grid.init();
HUD.init();
RackUI.init();
GearUI.init();
Panels.init();
WaveMods.init();
BlessUI.init();
resize();
// 首次启动先录名号，之后回主菜单
if (User.has()) Game.toMenu();
else Panels.showNameEntry(() => Game.toMenu());
// 预加载展示字体（canvas 逐帧重绘，就绪后自然生效）
document.fonts.load('64px "Ma Shan Zheng"').catch(() => {});
requestAnimationFrame(frame);

/* ---------- 调试/自动化验收 API ---------- */
window.GAME = {
  R, CONFIG, Grid, Director, Bus, Merge, RackUI, User, Input, FX, SFX, Bonds, Weekly, WaveMods, Skills,
  startRun: () => Game.startRun(),
  startDaily: () => Game.startDaily(),
  startWeekly: () => Game.startWeekly(),
  offerEndless: () => Game.offerEndless(),
  enterEndless: () => Game.enterEndless(),
  place: (c, r, key) => {
    if (!Grid.placeable(c, r) || R.towers.length >= CONFIG.towerCap) return false;
    Merge.makeUnit(key, c, r);
    return true;
  },
  give: (ch, lv) => {
    const slot = R.rack.findIndex(x => !x);
    if (slot < 0) return -1;
    R.rack[slot] = { type: 'char', ch, lv: lv || 1 };
    RackUI.refresh();
    return slot;
  },
  summon: () => RackUI.doSummon(),
  draft: () => R.draft,
  pick: i => RackUI.pickDraft(i),
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
  giveParts: (fam, n) => { R.parts[fam] = (R.parts[fam] || 0) + (n || 1); GearUI.refresh(); },
  giveEquip: (fam, lv) => { R.equips.push({ fam, lv: lv || 1 }); GearUI.refresh(); },
  gearToggle: () => { GearUI.open = !GearUI.open; GearUI.refresh(); return GearUI.open; },
  gearOpen: () => GearUI.open,
  giveShard: (key, n) => {
    Save.data.shards = Save.data.shards || {};
    Save.data.shards[key] = (Save.data.shards[key] || 0) + (n || 1);
    Save.write();
  },
  gearArm: i => { R.gearArm = i; GearUI.refresh(); },
  forgeSig: k => Gear.forgeSig(k),
  upgradeSig: k => Gear.upgradeSig(k),
  bossKill: () => {   // 模拟一次 boss 击杀的专属碎片掉落
    const e = { x: Grid.center(4, 3).x, y: Grid.center(4, 3).y, type: 'boss' };
    Gear.dropSigShard(e);
  },
  killAll: () => R.enemies.forEach(e => e.takeDamage(999999)),
  setTimeScale: x => { R.timeScale = x; },
  step: seconds => { const n = Math.round(seconds / STEP); for (let i = 0; i < n; i++) tick(STEP); },
  render: () => render(performance.now() / 1000),
  /* --- M7 十项优化调试入口 --- */
  callWave: () => {
    const b = Director.callNow();
    if (b > 0) { R.peaches += b; HUD.refresh(); }
    return b;
  },
  pickMod: i => WaveMods.pick(i),
  modOffer: () => R.modOffer,
  buyShovel: () => RackUI.buyShovel(),
  buyBless: id => BlessUI.buy(id),
  blessWave: () => ({ ...R.blessWave }),
  blessCost: id => BlessUI.cost(id),
  applyMod: id => { WaveMods.apply(id); return { ...R.mods }; },
  bonds: () => Bonds.bonus(),
  weeklyInfo: () => ({ key: Weekly.key(), picks: Weekly.picksFor(Weekly.key()).map(p => p.id) }),
  spawnElite: (affix, type) => {
    const e = new Enemy(type || 'ghost', 1);
    e.s = Grid.totalLen * 0.25;
    e.pos();
    e.makeElite(affix || undefined);
    R.enemies.push(e);
    return e;
  },
  setMods: m => Object.assign(R.mods, m),
  exportSave: () => Save.exportCode(),
  importSave: code => Save.importCode(code),
  setTowerMode: (c, r, mode) => {
    const t = Grid.tiles[r] && Grid.tiles[r][c] && Grid.tiles[r][c].tower;
    if (!t) return false;
    t.mode = mode;
    return t.mode;
  },
  dmgStats: () => JSON.parse(JSON.stringify(R.dmgStats)),
  snapshot: () => ({
    state: R.state, wave: R.wave, hearts: R.hearts, peaches: R.peaches,
    kills: R.kills, enemies: R.enemies.filter(e => e.alive).length,
    towers: R.towers.length, rack: R.rack.map(x => x ? (x.type === 'char' ? x.ch : x.unit.def.char + ':' + x.unit.level) : null),
    pityMiss: R.pityMiss, shovelLeft: R.shovelLeft, crystalsEarned: R.crystalsEarned,
    runKind: R.runKind, mods: { ...R.mods }, modOffer: R.modOffer,
    bonds: Bonds.bonus().active.map(a => a.name + a.count),
    save: { ...Save.data },
  }),
};
