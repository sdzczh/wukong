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
    R.ghosts = this.buildGhosts(kind, seedKey || null);   // 上局阵容占位建议
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
      : R.ghosts ? '金框虚线为上局阵容占位建议，照位摆字即可复刻布防'
      : '点击架子上的字放到棋盘；铲子可开垦「封」字地块或把单位铲回架子');
    TutUI.maybeStart();   // 新手三步引导（仅未完成时弹）
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

  /* 上局阵容 → 本局占位建议：同种子（每日/每周）直接复刻原位，异图按「环距匹配 + 近入口优先」重排 */
  buildGhosts(kind, seed) {
    const lu = Save.data.lastLineup;
    if (!lu || !lu.items || !lu.items.length) return null;
    const items = [...lu.items].sort((a, b) => b.dmg - a.dmg);   // 高伤塔优先占近路位
    if (lu.kind === kind && seed && lu.seed === seed) {
      return items.map(it => ({ c: it.col, r: it.row, ch: it.ch, god: it.god, lv: it.lv, star: it.star || 0 }));
    }
    const cands = [];
    for (let r = 0; r < Grid.rows; r++) for (let c = 0; c < Grid.cols; c++) {
      if (!Grid.placeable(c, r)) continue;
      let ring = 99;
      for (let rr = 0; rr < Grid.rows; rr++) for (let cc = 0; cc < Grid.cols; cc++) {
        if (Grid.tiles[rr][cc].type !== 'path') continue;
        ring = Math.min(ring, Math.max(Math.abs(cc - c), Math.abs(rr - r)));
      }
      const e0 = Grid.pathPx[0], p = Grid.center(c, r);
      cands.push({ c, r, ring, ent: Math.hypot(p.x - e0.x, p.y - e0.y) });
    }
    cands.sort((a, b) => a.ring - b.ring || a.ent - b.ent);
    const used = new Set(), out = [];
    for (const it of items) {
      let best = null, bestScore = 1e9;
      for (const cd of cands) {
        if (used.has(cd.c + ',' + cd.r)) continue;
        const score = Math.abs(cd.ring - it.ring) * 1000 + cd.ent + (cd.ring > it.ring ? 500 : 0);
        if (score < bestScore) { bestScore = score; best = cd; }
      }
      if (!best) break;
      used.add(best.c + ',' + best.r);
      out.push({ c: best.c, r: best.r, ch: it.ch, god: it.god, lv: it.lv, star: it.star || 0 });
    }
    return out.length ? out : null;
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
      s.dailyDone = (s.dailyDone || 0) + 1;
    }
    if (R.runKind === 'weekly') {
      const wk = Weekly.key();
      if (!s.weekly || s.weekly.key !== wk) s.weekly = { key: wk, best: 0 };
      s.weekly.best = Math.max(s.weekly.best, R.wave);
      s.weeklyDone = (s.weeklyDone || 0) + 1;
    }
    // 上局阵容快照：字/等级/索敌/离路环距/伤害（下局开局给占位建议；每日/每周同种子可直接复刻位）
    const pathSet = new Set();
    for (let r = 0; r < Grid.rows; r++) for (let c = 0; c < Grid.cols; c++) {
      if (Grid.tiles[r][c].type === 'path') pathSet.add(c + ',' + r);
    }
    const lineup = {
      kind: R.runKind, seed: R.daily || (R.runKind === 'weekly' ? Weekly.seedKey() : null), ts: Date.now(),
      items: R.towers.map(u => {
        let ring = 99;
        for (const p of pathSet) {
          const [pc, pr] = p.split(',').map(Number);
          ring = Math.min(ring, Math.max(Math.abs(pc - u.col), Math.abs(pr - u.row)));
        }
        return { ch: u.def.char, god: !!u.isGeneral, lv: u.level, star: u.star || 0, mode: u.mode || 'first', ring,
                 col: u.col, row: u.row,
                 dmg: (R.dmgStats[u.tid] || { dmg: 0 }).dmg };
      }),
    };
    if (lineup.items.length) s.lastLineup = lineup;
    Ach.check();   // 成就结算：波次/击杀/收集等持久数据齐了再判（解锁即写档）
    Save.write();
    if (typeof RankUI !== 'undefined') RankUI.submitRun();   // 全服风云榜：每局结算自动上传（失败不影响单机）
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
  if (acc > STEP * 12) acc = STEP * 12;   // 高倍速下设备跟不上时不螺旋死亡，宁可慢放
  while (acc >= STEP) { tick(STEP); acc -= STEP; }
  render(now / 1000);
}

function tick(dt) {
  if (R.state !== 'battle') return;
  if (Director.cur) R.battleTime += dt;   // 交战计时（DPS 面板分母）
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
/* ---------- 离屏静态层：远景（渐变+山脊）、棋盘砖路、点缀建筑三幅预渲染 ----------
   只有换图（buildTiles）、开垦、改尺寸才重画；平时每帧只是三次整幅 1:1 贴图，
   棋盘底图成本从逐格数百次绘制降为三次 blit。三层是为保原层次：
   流雾夹在远景与砖路之间、鬼门关心跳光晕夹在砖路与建筑之间，均按原样保留。 */
let bgCv = null, tilesCv = null, decorCv = null;
let bgG = null, tilesG = null, decorG = null;
let staticDirty = true, staticBuilds = 0;
function invalidateStatic() { staticDirty = true; }
function buildStaticLayer() {
  if (!bgCv) {
    bgCv = document.createElement('canvas'); bgG = bgCv.getContext('2d');
    tilesCv = document.createElement('canvas'); tilesG = tilesCv.getContext('2d');
    decorCv = document.createElement('canvas'); decorG = decorCv.getContext('2d');
  }
  for (const cv of [bgCv, tilesCv, decorCv]) { cv.width = canvas.width; cv.height = canvas.height; }
  for (const [g, fn] of [[bgG, drawBackgroundStatic], [tilesG, drawTiles], [decorG, drawDecorStatic]]) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.setTransform(view.k, 0, 0, view.k, view.ox, view.oy);
    fn(g);
  }
  staticDirty = false;
  staticBuilds++;
}

function render(now) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // 屏震：整体画面在逻辑坐标上随机偏移（静态层贴图同样随震偏移，观感与旧管线一致）
  const sh = FX.shakeOffset();
  if (staticDirty || !bgCv || bgCv.width !== canvas.width || bgCv.height !== canvas.height) buildStaticLayer();
  const shx = sh.x * view.k, shy = sh.y * view.k;
  ctx.setTransform(1, 0, 0, 1, shx, shy);
  ctx.drawImage(bgCv, 0, 0);
  ctx.setTransform(view.k, 0, 0, view.k, view.ox + shx, view.oy + shy);

  drawMist();

  ctx.setTransform(1, 0, 0, 1, shx, shy);
  ctx.drawImage(tilesCv, 0, 0);
  ctx.setTransform(view.k, 0, 0, view.k, view.ox + shx, view.oy + shy);

  drawGateGlow(now);

  ctx.setTransform(1, 0, 0, 1, shx, shy);
  ctx.drawImage(decorCv, 0, 0);
  ctx.setTransform(view.k, 0, 0, view.k, view.ox + shx, view.oy + shy);

  drawGhosts();

  for (const t of R.towers) t.draw(ctx);
  drawMergeGlow(now);
  for (const e of R.enemies) e.draw(ctx, now);
  for (const p of R.projectiles) p.draw(ctx);
  FX.draw(ctx);
  drawDropHints();

  drawVignette();
}

/* 上局阵容占位建议：金框虚线 + 字样（首波备战期显示，落子/开波即隐） */
function drawGhosts() {
  if (!R.ghosts || !R.ghosts.length || R.state !== 'battle' || R.wave !== 0) return;
  ctx.save();
  ctx.font = '900 ' + Math.round(Grid.tile * 0.46) + 'px "Ma Shan Zheng","Kaiti SC","STKaiti","KaiTi",serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const g of R.ghosts) {
    if (Grid.tiles[g.r] && Grid.tiles[g.r][g.c] && Grid.tiles[g.r][g.c].tower) continue;   // 已落子让位
    const p = Grid.center(g.c, g.r);
    const open = Grid.placeable(g.c, g.r);
    ctx.globalAlpha = open ? 0.55 : 0.16;
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = '#ffd867';
    ctx.lineWidth = 2;
    roundRect(ctx, p.x - Grid.tile * 0.4, p.y - Grid.tile * 0.4, Grid.tile * 0.8, Grid.tile * 0.8, 10);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = g.god ? '#9a86e8' : '#ffd867';
    ctx.fillText(g.ch, p.x, p.y + 1);
  }
  ctx.restore();
}

/* 场上可两两合成的单位：金圈脉动 + 「合」角标（与架子卡高亮同一套语言） */function drawMergeGlow(now) {
  if (!R.towers.length) return;
  const flags = Input.boardMergeFlags();
  if (!flags.size) return;
  if (!Input._glowTipShown && R.state === 'battle') {
    Input._glowTipShown = true;
    HUD.toast('金圈「合」标记的单位可合成：拖到另一个同字同级单位上叠放');
  }
  const tile = Grid.tile, half = tile * 0.42;
  const pulse = 0.5 + 0.5 * Math.sin(now * 5);
  for (const u of flags) {
    ctx.save();
    ctx.strokeStyle = `rgba(255,216,103,${(0.45 + 0.55 * pulse).toFixed(3)})`;
    ctx.lineWidth = 4;
    ctx.shadowColor = 'rgba(255,216,103,0.85)';
    ctx.shadowBlur = 8 + 10 * pulse;
    roundRect(ctx, u.x - half - 4, u.y - half - 4, (half + 4) * 2, (half + 4) * 2, 12);
    ctx.stroke();
    ctx.restore();
    // 「合」角标挂左上（等级角标在右上，不撞位）
    const bx = u.x - half + 4, by = u.y - half + 4;
    ctx.fillStyle = '#e8b64c';
    ctx.beginPath(); ctx.arc(bx, by, tile * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#f3ead6'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#5a3a10';
    ctx.font = `900 ${Math.round(tile * 0.19)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('合', bx, by + 1);
  }
}

function drawBackgroundStatic(g) {
  const grad = g.createLinearGradient(0, 0, 0, CONFIG.logicalH);
  grad.addColorStop(0, '#342a4e');
  grad.addColorStop(0.45, '#241b36');
  grad.addColorStop(1, '#17111f');
  g.fillStyle = grad;
  g.fillRect(0, 0, CONFIG.logicalW, CONFIG.logicalH);

  for (const ridge of scenery.ridges) {
    g.save();
    g.globalAlpha = ridge.alpha;
    g.fillStyle = ridge.color;
    g.beginPath();
    g.moveTo(-40, ridge.base);
    for (const p of ridge.pts) g.lineTo(p.x, p.y);
    g.lineTo(CONFIG.logicalW + 40, ridge.base);
    g.closePath();
    g.fill();
    g.restore();
  }
}

/* 流雾：唯一会动的背景元素，留在主画布、画在远景与砖路之间 */
function drawMist() {
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

function drawTiles(g = ctx) {
  const tile = Grid.tile;
  for (let r = 0; r < Grid.rows; r++) {
    for (let c = 0; c < Grid.cols; c++) {
      const t = Grid.tiles[r][c];
      const x = Grid.ox + c * tile, y = Grid.oy + r * tile;
      if (t.type === 'path') {
        // 黄泉路：满格连续路面（刻意与圆角砖的独立圆角砖区分形状语言），微色差防呆板
        g.fillStyle = ((c + r) % 2 === 0) ? '#b29460' : '#ab8d5a';
        g.fillRect(x, y, tile, tile);
        // 车道虚线：朝每个路径邻格方向画一段，全图连通成引导线
        const T = Grid.tiles;
        const up = T[r - 1] && T[r - 1][c].type === 'path';
        const dn = T[r + 1] && T[r + 1][c].type === 'path';
        const lf = T[r][c - 1] && T[r][c - 1].type === 'path';
        const rt = T[r][c + 1] && T[r][c + 1].type === 'path';
        const cx = x + tile / 2, cy = y + tile / 2;
        const dw = tile * 0.09, dl = tile * 0.3, dOff = tile * 0.1;
        g.fillStyle = '#e8d5a5';
        if (up) { roundRect(g, cx - dw / 2, cy - dOff - dl, dw, dl, dw / 2); g.fill(); }
        if (dn) { roundRect(g, cx - dw / 2, cy + dOff, dw, dl, dw / 2); g.fill(); }
        if (lf) { roundRect(g, cx - dOff - dl, cy - dw / 2, dl, dw, dw / 2); g.fill(); }
        if (rt) { roundRect(g, cx + dOff, cy - dw / 2, dl, dw, dw / 2); g.fill(); }
        continue;
      }
      // 锁定地块：暗色石板 + 「封」字
      if (t.locked) {
        g.fillStyle = '#332c42';
        roundRect(g, x + 2, y + 2, tile - 4, tile - 4, 7);
        g.fill();
        g.fillStyle = '#3d3550';
        roundRect(g, x + 5, y + 5, tile - 10, tile - 10, 6);
        g.fill();
        g.fillStyle = '#5a5074';
        g.font = `900 ${Math.round(tile * 0.4)}px "Ma Shan Zheng", "Kaiti SC", "STKaiti", "KaiTi", serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('封', x + tile / 2, y + tile / 2 + 2);
        continue;
      }
      // 紫砖 / 白石
      const isWhite = t.type === 'white';
      g.fillStyle = isWhite ? '#e7dfcf' : '#7e6f9e';
      roundRect(g, x + 2, y + 2, tile - 4, tile - 4, 7);
      g.fill();
      g.fillStyle = isWhite ? '#cfc6b2' : '#6d5e8c';
      roundRect(g, x + 2, y + tile * 0.55, tile - 4, tile * 0.43 - 2, 7);
      g.fill();
      g.fillStyle = isWhite ? '#fffdf6' : '#8f80b0';
      roundRect(g, x + 4, y + 3, tile - 8, tile * 0.2, 6);
      g.fill();
    }
  }
}

/* 鬼门关心跳光晕：脉动红光，画在砖路之上、建筑之下（与旧管线层次一致） */
function drawGateGlow(now) {
  const tile = Grid.tile;
  const gate = Grid.center(CONFIG.pathCells[0][0], CONFIG.pathCells[0][1]);
  ctx.save();
  ctx.translate(gate.x, gate.y);
  const pulse = 0.5 + Math.sin(now * 2) * 0.12;
  const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, tile * 0.85);
  glow.addColorStop(0, `rgba(190,80,90,${pulse * 0.55})`);
  glow.addColorStop(1, 'rgba(190,80,90,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(0, 0, tile * 0.85, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/* 棋盘之上的静态建筑：鬼门关门楼 + 轮回殿，随随机路线移动 */
function drawDecorStatic(g) {
  const tile = Grid.tile;

  // 鬼门关门楼（路径起点，随入口列移动）
  const gate = Grid.center(CONFIG.pathCells[0][0], CONFIG.pathCells[0][1]);
  g.save();
  g.translate(gate.x, gate.y);
  g.fillStyle = '#33263a';
  g.strokeStyle = '#8d3a46'; g.lineWidth = 3;
  roundRect(g, -tile * 0.38, -tile * 0.2, tile * 0.76, tile * 0.62, 6);
  g.fill(); g.stroke();
  g.fillStyle = '#8d3a46';
  g.beginPath();
  g.moveTo(-tile * 0.5, -tile * 0.2); g.lineTo(0, -tile * 0.52); g.lineTo(tile * 0.5, -tile * 0.2);
  g.closePath(); g.fill();
  g.fillStyle = '#e8b64c';
  g.font = `900 ${Math.round(tile * 0.22)}px "Ma Shan Zheng","Kaiti SC","STKaiti",serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('关', 0, tile * 0.1);
  g.restore();

  // 轮回殿（基地）
  const base = Grid.center(CONFIG.base.col, CONFIG.base.row);
  g.save();
  g.translate(base.x, base.y);
  g.fillStyle = '#e8ddc8';
  g.strokeStyle = '#8d7a5c'; g.lineWidth = 2.5;
  roundRect(g, -tile * 0.34, -tile * 0.1, tile * 0.68, tile * 0.5, 5);
  g.fill(); g.stroke();
  g.fillStyle = '#7a2f3a';
  g.beginPath();
  g.moveTo(-tile * 0.46, -tile * 0.1); g.lineTo(0, -tile * 0.46); g.lineTo(tile * 0.46, -tile * 0.1);
  g.closePath(); g.fill();
  g.fillStyle = '#3a2a3a';
  g.fillRect(-tile * 0.09, tile * 0.12, tile * 0.18, tile * 0.28);
  g.fillStyle = '#e8b64c';
  g.font = `900 ${Math.round(tile * 0.2)}px "Ma Shan Zheng","Kaiti SC","STKaiti",serif`;
  g.textAlign = 'center';
  g.fillText('轮回殿', 0, -tile * 0.58);
  g.restore();
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
      if (v === 'level' || v === 'general-level' || v === 'general-star' || v === 'pair') state = 'ok';
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
    this.updateRackDropHint(e);
  },

  up(e) {
    const g = this.gesture;
    this.gesture = null;
    R.drag = null;
    clearTimeout(this._lpTimer);
    RackUI.hideGhost();
    this.clearRackDropHint();
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
        // 首次 arm 且场上/架上有可合成目标 → 教一次双击
        if (R.armedSlot === g.src.slot && !this._mergeTipShown &&
            (this.findMergeTarget(g.src.slot) || this.findRackMergeTarget(g.src.slot) >= 0)) {
          this._mergeTipShown = true;
          HUD.toast('双击卡片：与场上/架上同字同级合成升级，神将字自动凑对');
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
        const i = g.src.slot;
        if (i !== j) {
          const res = Merge.mergeRack(i, j);   // 架内可合成（同字同级升级 / 神将字凑对）→ 直接合成
          if (res) {
            RackUI.refresh();
            HUD.toast(res.text);
            HUD.refresh();          // HUD.refresh 内部会重刷架子（重写 className），弹跳动画须排在其后
            RackUI.flashSlot(j);
            return;   // 已重渲染，跳过末尾统一 refresh
          }
          // 不可合成 → 架内交换
          const tmp = R.rack[i]; R.rack[i] = R.rack[j]; R.rack[j] = tmp; SFX.play('place');
        }
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

  /* 拖拽架子卡悬停在可合成的架上目标 → 目标槽亮绿框预兆 */
  updateRackDropHint(e) {
    let el = null;
    if (this.activeDrag() && R.drag && R.drag.src.type === 'rack') {
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const s = under && under.closest ? under.closest('.slot') : null;
      if (s && this.rackElContains(s)) {
        const j = Number(s.dataset.slot);
        if (j !== R.drag.src.slot && Merge.judgeRack(R.rack[R.drag.src.slot], R.rack[j])) el = s;
      }
    }
    if (this._hintEl && this._hintEl !== el) this._hintEl.classList.remove('drop-merge');
    if (el) el.classList.add('drop-merge');
    this._hintEl = el;
  },
  clearRackDropHint() {
    if (this._hintEl) { this._hintEl.classList.remove('drop-merge'); this._hintEl = null; }
  },

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
      if (v === 'level' || v === 'general-level' || v === 'general-star' || v === 'pair') return t;
    }
    return null;
  },

  /* 棋盘单位两两可合成集合（棋盘↔棋盘、棋盘↔架子卡均算）：
     渲染每帧调用一次——先建计数表，再 O(1) 逐塔判定 */
  boardMergeFlags() {
    const bCnt = new Map(), rCnt = new Map(), gCnt = new Map();
    const bChars = new Set(), rChars = new Set();
    const bump = (m, ch, lv) => { const k = ch + '|' + lv; m.set(k, (m.get(k) || 0) + 1); };
    for (const t of R.towers) {
      bump(bCnt, t.def.char, t.level); bChars.add(t.def.char);
      if (t.isGeneral) gCnt.set(t.def.char, (gCnt.get(t.def.char) || 0) + 1);   // 同名神将（任意等级）计数
    }
    for (const it of R.rack) {
      if (!it) continue;
      if (it.type === 'unit') {
        bump(rCnt, it.unit.def.char, it.unit.level); rChars.add(it.unit.def.char);
        if (it.unit.isGeneral) gCnt.set(it.unit.def.char, (gCnt.get(it.unit.def.char) || 0) + 1);
      } else { bump(rCnt, it.ch, it.lv || 1); rChars.add(it.ch); }
    }
    const out = new Set();
    for (const t of R.towers) {
      const ch = t.def.char;
      // 神将：未满星且有第二张同名（棋盘或架子，任意等级）→ 可升星
      if (t.isGeneral) {
        if ((t.star || 0) < CONFIG.generalStars.max && (gCnt.get(ch) || 0) >= 2) { out.add(t); continue; }
      } else if (t.level < t.maxLevel &&
          ((bCnt.get(ch + '|' + t.level) || 0) >= 2 || (rCnt.get(ch + '|' + t.level) || 0) >= 1)) {
        out.add(t);
        continue;
      }
      // 神将字塔：配对的另一半字在场（棋盘或架子）→ 可凑对唤醒神将
      if (!t.isGeneral && !CONFIG.charToTower[ch]) {
        const ph = Merge.pairHintOf(ch);
        if (ph && (bChars.has(ph.with) || rChars.has(ph.with))) out.add(t);
      }
    }
    return out;
  },

  /* 双击架子卡：有目标走正常落子链路立即合成（场上优先）；没有则找架上配对，再没有则提示原因 */
  autoMerge(slot) {
    const item = R.rack[slot];
    if (!item) return false;
    const t = this.findMergeTarget(slot);
    if (t) {
      if (R.armedSlot === slot) R.armedSlot = -1;   // 卡已被合成消耗，清除持握
      this.dropRack(slot, t.col, t.row, false);
      return true;
    }
    const j = this.findRackMergeTarget(slot);
    if (j >= 0) {
      const res = Merge.mergeRack(slot, j);
      if (res) {
        if (R.armedSlot === slot) R.armedSlot = -1;
        RackUI.refresh();
        HUD.toast(res.text);
        HUD.refresh();          // HUD.refresh 内部会重刷架子（重写 className），弹跳动画须排在其后
        RackUI.flashSlot(j);
        return true;
      }
    }
    const aChar = item.type === 'unit' ? item.unit.def.char : item.ch;
    const isLing = item.type === 'unit'
      ? String(item.unit.key).startsWith('ling:')
      : !CONFIG.charToTower[aChar];
    if (item.type === 'unit' && item.unit.isGeneral) {
      HUD.toast((item.unit.star || 0) < CONFIG.generalStars.max
        ? '场上和架上都没有第二张同名神将可升星'
        : '已满星，场上也没有同级同名神将可升级');
    } else if (isLing) {
      const ph = Merge.pairHintOf(aChar);
      HUD.toast(ph ? `场上没有「${ph.with}」字塔，架上也没有「${ph.with}」字可凑对` : '场上和架上都没有可配对的目标');
    } else {
      HUD.toast(`场上和架上都没有同字同级的${aChar}单位可升级`);
    }
    return false;
  },

  /* 架上可合成的目标槽（同字同级升级 / 神将字凑对，规则同棋盘） */
  findRackMergeTarget(slot) {
    for (let j = 0; j < R.rack.length; j++) {
      if (j === slot) continue;
      if (Merge.judgeRack(R.rack[slot], R.rack[j])) return j;
    }
    return -1;
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
  if (src && src.isGeneral && src.starMaxed && src.key === 'yanwang' && RNG.next() < 0.2) {
    src.skillT = 0;   // 满星阎王·索命：击杀 20% 概率刷新技能
    FX.float('索命·技已刷新', src.x, src.y - Grid.tile * 0.9, '#c0c0e0', 14);
  }
  if (src && src.key === 'wukong') { Save.data.wukongKills++; Save.write(); }
  if (e.type === 'boss') { Save.data.bossKills = (Save.data.bossKills || 0) + 1; Save.write(); }
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
  // 满星王母·福泽：每波开始 +2 桃
  for (const g of R.towers) {
    if (g.isGeneral && g.starMaxed && g.key === 'wangmu') {
      R.peaches += 2;
      FX.float('福泽 +2 桃', g.x, g.y - Grid.tile * 0.9, '#f0a8cc', 15);
    }
  }
  const boss = n % 5 === 0;
  const bp = boss ? CONFIG.bossPool[(Math.ceil(n / 5) - 1) % CONFIG.bossPool.length] : null;
  const sub = R.endless
    ? (boss ? `无尽征战，${bp.name}亲至！` : '无尽征战，敌势无穷！')
    : (boss ? `${bp.name}亲至，小心应对！` : (n === 1 ? '黄泉为路，幽冥作甲，众魂出击！' : '魂行黄泉，忘却轮回，杀！'));
  HUD.showBanner('第 ' + n + ' 波', sub, boss);
  SFX.play(boss ? 'alarm' : 'horn');
  HUD.refresh();
});

Bus.on('waveClear', n => {
  R.blessWave = {};   // 瑶池祝福过波失效（价格递增保留）
  const reward = CONFIG.economy.waveRewardBase + n
    + (R.mods.lgold || 0) * CONFIG.waveMods.legendSteps.lgold;   // 传说·点石成桃
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
    invalidateStatic();   // 砖路在离屏静态层，开垦后重画
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
DpsUI.init();
TutUI.init();
RackUI.init();
GearUI.init();
Panels.init();
WaveMods.init();
BlessUI.init();
resize();
// 首次启动先录名号，之后回主菜单
if (User.has()) Game.toMenu();
else Panels.showNameEntry(() => Game.toMenu());
// 预加载展示字体（canvas 逐帧重绘，就绪后自然生效）；静态层的「封/关/轮回殿」字样需就绪后重画一次
document.fonts.load('64px "Ma Shan Zheng"').then(invalidateStatic, invalidateStatic);
if (document.fonts.ready && document.fonts.ready.then) document.fonts.ready.then(invalidateStatic);
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
  spawnBoss: kind => {   // 指定鬼将池种类直造 boss（验收用）
    const e = new Enemy('boss', 1, kind || CONFIG.bossPool[0].id);
    e.s = Grid.totalLen * 0.15;
    e.pos();
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
  dps: () => DpsUI.rows(),
  staticInfo: () => ({ builds: staticBuilds, dirty: staticDirty, w: bgCv && bgCv.width, h: bgCv && bgCv.height }),
  ghosts: () => R.ghosts,
  lineup: () => Save.data.lastLineup,
  masteryState: () => Save.data.mastery,
  masterySet: (key, n) => { Save.data.mastery[key] = n; Save.write(); },
  tutState: () => TutUI.step,
  tutFinish: () => TutUI.finish(),
  achState: () => ({ n: Object.keys(Save.data.ach || {}).length, title: Ach.titleText(), fresh: Ach.fresh.map(a => a.name) }),
  achUnlockAll: () => { ACHS.forEach(a => { if (!Save.data.ach[a.id]) Save.data.ach[a.id] = Date.now(); }); Save.write(); Ach.check(); },
  achClear: () => { Save.data.ach = {}; Save.data.title = ''; Ach.fresh.length = 0; Save.write(); },
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
