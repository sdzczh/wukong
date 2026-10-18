/* 无尽挂机（托管）：只在无尽征战开放。备战期自动选牌/召唤/合成/摆位/佩戴/选词条，
   缺心买瑶池回心、棋盘格耗尽开垦/补铲、按塔类型设索敌，并提前叫波换取蟠桃；
   交战期只推进时间。任意手动操作（点棋盘/架子/按钮/按键）立即暂停托管。
   页面切后台时 rAF 停摆，用 1 秒间隔驱动固定步长继续推；关页后时间不流逝，
   由 RunSave 落盘挂机标记，「继续上局」恢复后按离线时长 headless 快进追进度。
   挂机局不上全服风云榜、不覆盖上局阵容快照。 */
'use strict';

const AutoBot = {

  /* ---------- 生命周期 ---------- */
  boot() {
    // 托管思考节拍：备战期动作 + 词条抉择
    setInterval(() => this.think(), 400);
    // 后台驱动：页面隐藏时补 tick（仅托管局；iOS 后台冻结则交给快照恢复）
    setInterval(() => this.drive(), 1000);
    // 手动操作即暂停托管：捕获阶段先于游戏处理器；「挂」按钮自身除外
    const stage = document.getElementById('stage');
    if (stage) {
      stage.addEventListener('pointerdown', e => {
        if (!R.idle || R.state !== 'battle') return;
        if (e.target && e.target.closest && e.target.closest('#btn-idle')) return;
        this.pause('检测到手动操作 · 挂机已暂停');
      }, true);
    }
    window.addEventListener('keydown', () => {
      if (R.idle && R.state === 'battle') this.pause('检测到手动操作 · 挂机已暂停');
    });
    // 回前台：重置后台时间基准，重新申请屏幕常亮
    document.addEventListener('visibilitychange', () => {
      this._bgLast = null;
      if (!document.hidden && R.idle && R.state === 'battle') this._reqLock();
    });
  },

  /* ---------- 开关 ---------- */
  toggle() {
    if (R.state !== 'battle' || !R.endless || R.pvp) { HUD.toast('无尽征战开启后才可挂机'); return; }
    if (R.idle) this.pause('挂机已结束');
    else this.activate();
  },

  activate() {
    if (!R.endless || R.pvp || R.state !== 'battle') return;
    R.idle = true;
    if (!R.idleMs) R.idleMs = 0;
    this._mute(true);
    this._reqLock();
    HUD.refresh();
    HUD.toast('挂机托管开始 · 静音，任意手动操作即暂停');
  },

  pause(msg) {
    if (!R.idle) return;
    R.idle = false;
    this._mute(false);
    this._relLock();
    this._bgLast = null;
    HUD.refresh();
    if (msg) HUD.toast(msg);
    if (typeof RunSave !== 'undefined' && R.state === 'battle' && !Director.cur) RunSave.checkpoint();
  },

  /* 残局恢复续挂（RunSave.apply 末尾调用）：静音 + 常亮，不再重复提示 */
  reactivate() {
    if (!R.idle) return;
    this._mute(true);
    this._reqLock();
    HUD.refresh();
  },

  /* 终局：解除静音/常亮（R.idle、R.idleMs 保留给结算页展示，resetRun 再清） */
  onGameOver() {
    this._mute(false);
    this._relLock();
  },

  /* ---------- 思考节拍（备战期） ---------- */
  think() {
    if (!R.idle || R.state !== 'battle') return;
    if (R.modOffer) { this.pickMod(); return; }
    if (Director.cur) return;                         // 交战中不动作
    if (R.draft && R.draft.length) this.pickDraft();  // 上轮遗留选牌先处理
    this.handleGear();
    this.handleModes();
    this.handleBless(false);   // 缺心续命：优先买瑶池回心
    this.handleSummon();
    this.handleShovel();       // 可放格耗尽：开垦/补铲扩地
    this.handlePlacements();
    this.housekeeping();
    this.handleBless(true);    // 富余经济：疾风/定身抬本波战力
    // 收尾：把剩余备战秒数换成蟠桃，立即开下一波
    if (!Director.cur && !R.modOffer && Director.intermission > 0.4) {
      const bonus = Director.callNow();
      if (bonus > 0) R.peaches += bonus;
      HUD.refresh();
    }
  },

  /* ---------- 后台驱动 ---------- */
  drive() {
    if (!R.idle || R.state !== 'battle' || !document.hidden) { this._bgLast = null; return; }
    const now = performance.now();
    if (this._bgLast == null) { this._bgLast = now; return; }
    let dt = (now - this._bgLast) / 1000;
    this._bgLast = now;
    if (dt <= 0) return;
    if (dt > 30) dt = 30;          // 长时间冻结交给快照恢复，单次最多追 30 秒
    if (window.GAME && GAME.step) {
      GAME.step(dt * (R.timeScale || 1));
      R.idleMs = (R.idleMs || 0) + dt * 1000;   // 挂机时长按真实时间累计
    }
  },

  /* ---------- 词条三选一 ---------- */
  modPriority() {
    const p = ['lheart', 'latk', 'lrate', 'lgold', 'lslow',
               'atk', 'rate', 'heart', 'exp', 'cd', 'peach', 'interest', 'aura', 'sell', 'shovel'];
    if (R.hearts <= Math.max(2, Math.floor(R.heartsMax * 0.35))) {
      p.splice(p.indexOf('heart'), 1);
      p.unshift('heart');           // 缺心时续命最优先
    }
    return p;
  },

  pickMod() {
    if (!R.modOffer) return;
    const prio = this.modPriority();
    let best = 0, bestScore = -1;
    R.modOffer.forEach((id, i) => {
      const k = prio.indexOf(id);
      const s = k >= 0 ? (prio.length - k) : 0;
      if (s > bestScore) { bestScore = s; best = i; }
    });
    WaveMods.pick(best);
  },

  /* ---------- 选牌 ---------- */
  /* 单卡价值：能立刻凑对唤醒神将 > 同字同级可升级 > 高级字卡占位 */
  cardScore(d) {
    const ch = d.ch, lv = d.lv || 1;
    const isGod = !CONFIG.charToTower[ch];
    if (isGod) {
      const ph = Merge.pairHintOf(ch);
      if (ph && this.hasCharOnBoard(ph.with)) return 100;   // 场上有另一半：立刻凑对
      if (ph && this.hasCharInRack(ph.with)) return 95;     // 架上有另一半
      if (ph && R.draft && R.draft.some(x => x.ch === ph.with)) return 90;   // 本轮一起拿下
      return 40;                                            // 孤神将字：握着等配对
    }
    if (this.mergeableNow(ch, lv)) return 70 + lv * 5;
    if (R.towers.length >= CONFIG.towerCap) return 0;       // 场满且不能合成：不拿
    return 15 + (lv - 1) * 12;
  },

  hasCharOnBoard(ch) {
    for (const t of R.towers) if (t.def.char === ch) return true;   // 普通字 / 灵字
    return false;
  },
  hasCharInRack(ch) {
    for (const it of R.rack) if (it && Merge.itemChar(it) === ch) return true;
    return false;
  },
  mergeableNow(ch, lv) {
    for (const t of R.towers) {
      if (t.def.char === ch && !t.isGeneral && t.level === lv && t.level < t.maxLevel) return true;
    }
    for (const it of R.rack) {
      if (it && Merge.itemChar(it) === ch && Merge.itemLevel(it) === lv) return true;
    }
    return false;
  },

  /* 按价值从高到低逐张点选（pickDraft 会 splice，每轮重找最优） */
  pickDraft() {
    if (!R.draft || !R.draft.length) return;
    let guard = 0;
    while (R.draft && R.draft.length && guard++ < 8) {
      if (R.rack.findIndex(x => !x) < 0) break;
      let best = -1, bestScore = -1;
      R.draft.forEach((d, i) => {
        const s = this.cardScore(d);
        if (s > bestScore) { bestScore = s; best = i; }
      });
      if (best < 0 || bestScore < 15) break;   // 剩下的都不值得占架位
      RackUI.pickDraft(best);
    }
  },

  /* ---------- 召唤 ---------- */
  handleSummon() {
    let guard = 0;
    while (guard++ < 8) {
      if (R.rack.every(x => x)) break;              // 架满
      const cost = RackUI.summonCost();
      if (R.peaches < cost) break;                  // 没钱
      RackUI.doSummon();
      if (!R.draft || !R.draft.length) break;
      this.pickDraft();
    }
  },

  /* ---------- 摆位 / 合成 ---------- */
  handlePlacements() {
    let guard = 0;
    while (guard++ < 12) {
      let acted = false;
      for (let i = 0; i < R.rack.length; i++) {
        const item = R.rack[i];
        if (!item) continue;
        // 1) 场上合成目标（升级 / 凑对唤醒 / 神将升星）
        const t = Input.findMergeTarget(i);
        if (t) { Input.dropRack(i, t.col, t.row, false); acted = true; break; }
        // 2) 架内合成
        const j = Input.findRackMergeTarget(i);
        if (j >= 0) {
          if (Merge.mergeRack(i, j)) { RackUI.refresh(); acted = true; break; }
        }
        // 3) 空位摆放
        if (R.towers.length < CONFIG.towerCap) {
          const ch = Merge.itemChar(item);
          const isGod = !CONFIG.charToTower[ch];
          // 孤神将字：架子还有空位就先握着等配对；架满才落成灵字塔
          if (isGod && item.type === 'char' && R.rack.some(x => !x)) continue;
          const cell = this.bestCell(item);
          if (cell) { Input.dropRack(i, cell.c, cell.r, false); acted = true; break; }
        }
      }
      if (!acted) break;
    }
    RackUI.refresh();
    HUD.refresh();
  },

  /* 路径格缓存（一局内路径不变，按 runId 失效） */
  _pathCells() {
    if (this._pcRun !== R.runId || !this._pc) {
      const p = [];
      for (let r = 0; r < Grid.rows; r++) for (let c = 0; c < Grid.cols; c++) {
        if (Grid.tiles[r][c].type === 'path') p.push({ c, r });
      }
      this._pc = p;
      this._pcRun = R.runId;
    }
    return this._pc;
  },

  /* 最佳空格：战鼓挑覆盖友塔最多的；其余挑离路径最近（超出射程的远格垫底） */
  bestCell(item) {
    const key = item.type === 'unit' ? item.unit.key : CONFIG.charToTower[item.ch];
    const def = key ? CONFIG.towers[key] : null;
    const isAura = def && def.kind === 'aura';
    const range = (def && def.range) || 3;
    const path = this._pathCells();
    let best = null, bestScore = -1e9;
    for (let r = 0; r < Grid.rows; r++) {
      for (let c = 0; c < Grid.cols; c++) {
        if (!Grid.placeable(c, r) || Grid.tiles[r][c].tower) continue;
        let d = Infinity;
        for (const p of path) {
          const dd = Math.hypot(p.c - c, p.r - r);
          if (dd < d) d = dd;
        }
        let score;
        if (isAura) {
          let cnt = 0;
          for (const t of R.towers) {
            if (Math.hypot(t.col - c, t.row - r) <= range) cnt++;
          }
          score = cnt * 10 - d;
        } else {
          score = d <= Math.max(1.6, range - 0.2) ? -d * 10 : -100 - d * 10;
        }
        if (score > bestScore) { bestScore = score; best = { c, r }; }
      }
    }
    return best;
  },

  /* ---------- 场满架满清理：卖最弱杂塔腾位，保持召唤-合成引擎转动 ---------- */
  housekeeping() {
    if (R.towers.length < CONFIG.towerCap) return;
    if (!R.rack.every(x => x)) return;             // 还有空位：不清理
    for (let i = 0; i < R.rack.length; i++) {
      if (R.rack[i] && (Input.findMergeTarget(i) || Input.findRackMergeTarget(i) >= 0)) return;   // 有合成潜力
    }
    const junk = this.worstBoardTower();
    if (!junk) return;
    R.peaches += Merge.sellValue(junk);
    FX.float('挂机清理 · ' + junk.def.name, junk.x, junk.y - Grid.tile * 0.4, '#d9cdb4', 14);
    Merge.removeUnit(junk);
    SFX.play('sell');
    RackUI.refresh();
    HUD.refresh();
  },

  /* 最弱杂塔：普通字 < 灵字 < 战鼓 < 带装备 < 神将；同级比攻击 */
  worstBoardTower() {
    let worst = null, score = Infinity;
    for (const t of R.towers) {
      let s = t.level * 100 + (t.atk || 0);
      if (String(t.key).indexOf('ling:') === 0) s -= 50;
      if (t.def.kind === 'aura') s += 150;
      if (t.gear) s += 300;
      if (t.isGeneral) s += 1000 + (t.star || 0) * 200;
      if (s < score) { score = s; worst = t; }
    }
    return worst;
  },

  /* ---------- 装备：合成 / 升级 / 佩戴 ---------- */
  handleGear() {
    if (typeof Gear === 'undefined' || !R.equips) return;
    const fams = Object.keys(CONFIG.gear.families);
    for (const fam of fams) {
      let guard = 0;
      while (Gear.canForge(fam) && guard++ < 4) Gear.forge(fam);
      for (let lv = 1; lv < CONFIG.gear.maxLv; lv++) {
        guard = 0;
        while (Gear.mergeInv(fam, lv) && guard++ < 4) {}
      }
    }
    // 佩戴：从尾往前（equipTo 会 splice 库存）
    for (let i = R.equips.length - 1; i >= 0; i--) {
      const it = R.equips[i];
      if (!it) continue;
      const t = this.bestTowerForGear(it);
      if (t) Gear.equipTo(t, i);
    }
    if (typeof GearUI !== 'undefined') GearUI.refresh();
  },

  /* 装备给谁：未佩戴的塔里挑综合输出最高的；冷却/灵犀只有神将有用 */
  bestTowerForGear(it) {
    const f = CONFIG.gear.families[it.fam];
    let best = null, bestScore = -1;
    for (const t of R.towers) {
      if (t.gear) continue;
      if (Gear.canEquip(t, it)) continue;
      if ((f.stat === 'cdMul') && !t.isGeneral) continue;
      let s = (t.atk || 0) * (t.def.rate || 1);
      if (t.isGeneral) s *= 1.4;
      if (s > bestScore) { bestScore = s; best = t; }
    }
    return best;
  },

  /* ---------- 瑶池祝福 ----------
     缺心（≤35% 上限）时回心必买（先于召唤花钱）；富余时（rich=true，
     摆位收尾后）留 30 桃运营底仓再买疾风/定身抬本波战力。 */
  handleBless(rich) {
    if (typeof BlessUI === 'undefined' || !BlessUI.canShow()) return;
    if (!rich) {
      if (R.hearts <= Math.max(2, Math.floor(R.heartsMax * 0.35))
          && !R.blessWave.heart && R.peaches >= BlessUI.cost('heart')) {
        BlessUI.buy('heart');
      }
      return;
    }
    for (const id of ['rate', 'slow']) {
      const c = BlessUI.cost(id);
      if (!R.blessWave[id] && R.peaches >= c + 30) BlessUI.buy(id);
    }
  },

  /* ---------- 铲子扩地 ----------
     可放格（开放且无塔）耗尽时：有铲开垦离路径最近的封地；没铲但
     富余（≥补铲价 + 40 底仓）先花桃补铲再开垦。 */
  handleShovel() {
    let empty = 0;
    const locked = [];
    for (let r = 0; r < Grid.rows; r++) {
      for (let c = 0; c < Grid.cols; c++) {
        const t = Grid.tiles[r][c];
        if (!(t.type === 'purple' || t.type === 'white')) continue;
        if (t.locked) locked.push({ c, r });
        else if (!t.tower) empty++;
      }
    }
    if (empty > 0 || locked.length === 0) return;
    if (R.shovelLeft <= 0) {
      if (typeof RackUI === 'undefined' || R.peaches < RackUI.shovelBuyCost() + 40) return;
      RackUI.buyShovel();
      if (R.shovelLeft <= 0) return;
    }
    const path = this._pathCells();
    let best = locked[0], bd = Infinity;
    for (const k of locked) {
      let d = Infinity;
      for (const p of path) {
        const dd = Math.hypot(p.c - k.c, p.r - k.r);
        if (dd < d) d = dd;
      }
      if (d < bd) { bd = d; best = k; }
    }
    Bus.emit('shovelAt', best);
  },

  /* ---------- 索敌模式（每塔只设一次，玩家手动改过的不碰） ----------
     减速塔盯「最先」拖住队首；近战（基准射程 ≤2 格）盯「最近」保输出
     覆盖；其余盯「最强」集火精英。光环塔不攻击不设。
     用 def.range 判近战（rangeFloor 会整体抬高实际射程）。 */
  handleModes() {
    for (const t of R.towers) {
      if (t._botMode || t._userMode || t.def.kind === 'aura') continue;
      if (t.def.slowHit) t.mode = 'first';
      else if ((t.def.range || 3) <= 2.0) t.mode = 'near';
      else t.mode = 'strong';
      t._botMode = true;
    }
  },

  /* ---------- 离线快进 ----------
     关页期间时间不流逝；「继续上局」恢复后按离线时长 headless 追进
     （封顶 2 小时模拟量、总算力 ~6 秒，120ms 分片让页面保持可响应、
     可随时手动暂停）。推进波数由 _ffDone 汇总提示。 */
  fastForward(offlineSec) {
    if (!R.idle || R.state !== 'battle') return 0;
    this._ffLeft = Math.min(Math.max(0, offlineSec), 7200);
    this._ffWave0 = R.wave;
    this._ffT0 = performance.now();
    this._ffSlice();
    return this._ffLeft;
  },
  _ffSlice() {
    if (this._ffLeft === undefined) return;
    if (!R.idle || R.state !== 'battle' || this._ffLeft <= 0) { this._ffDone(); return; }
    const t0 = performance.now();
    while (this._ffLeft > 0 && performance.now() - t0 < 120 && R.state === 'battle') {
      if (!Director.cur && !R.modOffer) this.think();   // 备战期运营照常执行
      GAME.step(0.5);
      this._ffLeft -= 0.5;
      R.idleMs = (R.idleMs || 0) + 500;
    }
    if (performance.now() - this._ffT0 > 6000) { this._ffDone(); return; }
    setTimeout(() => this._ffSlice(), 0);
  },
  _ffDone() {
    if (this._ffLeft === undefined) return;
    const adv = R.wave - this._ffWave0;
    this._ffLeft = undefined;
    if (R.state === 'battle' && adv > 0) HUD.toast(`离线快进完成 · 推进 ${adv} 波`);
  },

  /* ---------- 静音 / 屏幕常亮 ---------- */
  _mute(on) {
    if (typeof SFX === 'undefined') return;
    SFX.mute = !!on;
    SFX.refreshBgm();
  },

  _reqLock() {
    try {
      if (navigator.wakeLock && !this._lock) {
        navigator.wakeLock.request('screen').then(l => {
          this._lock = l;
          l.addEventListener('release', () => { this._lock = null; });
        }).catch(() => {});
      }
    } catch (e) {}
  },
  _relLock() {
    try { if (this._lock) { this._lock.release(); this._lock = null; } } catch (e) {}
  },

  /* 挂机时长展示（结算页） */
  fmtMs(ms) {
    const s = Math.round(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h} 时 ${m} 分`;
    if (m > 0) return `${m} 分 ${s % 60} 秒`;
    return `${s} 秒`;
  },
};
