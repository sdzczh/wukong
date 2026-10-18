/* 断点续战：把进行中的一局在每个备战期快照到 localStorage（独立 key，
   不进存档码/云同步）。刷新或重开页面后主菜单出现「继续上局」，
   恢复回本波备战期（同种子重放棋盘/起始字，再覆写快照状态）。
   结算或主动回主菜单即清除；只在本机、只在备战期（Director.cur 为空）落盘。 */
'use strict';

const RunSave = {
  KEY: 'wukong_run_v1',
  VERSION: 1,
  STALE_MS: 12 * 3600 * 1000,   // 超过 12 小时的残局视为过期（跨周/隔夜的每周局不再捡）
  _hintShown: false,
  resuming: false,               // 恢复进行中：抑制重复提示类副作用（专属随身 toast 等）

  /* ---------- 读取 ---------- */
  read() {
    let o = null;
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) o = JSON.parse(raw);
    } catch (e) { o = null; }
    if (!o || o.v !== this.VERSION || !Array.isArray(o.towers) || !Array.isArray(o.rack)
        || typeof o.hearts !== 'number' || typeof o.peaches !== 'number') {
      if (o) this.clear();
      return null;
    }
    if (!o.t || Date.now() - o.t > this.STALE_MS) { this.clear(); return null; }   // 过期残局
    return o;
  },

  /* 主菜单角标信息：null = 无可继续的局 */
  info() {
    const o = this.read();
    if (!o) return null;
    const kind = o.runKind === 'daily' ? '每日轮回'
      : o.runKind === 'weekly' ? '每周异变'
      : o.runKind === 'pvp' ? `讨伐「${o.pvpName || '?'}」`
      : o.endless ? '无尽征战' : '常规局';
    return { kind, wave: o.wave || 0, peaches: o.peaches | 0, hearts: o.hearts | 0,
             heartsMax: o.heartsMax || 10, towers: o.towers.length, idle: !!o.idle };
  },

  /* ---------- 快照（仅备战期：无在场敌军波，恢复语义 = 回本波备战） ---------- */
  checkpoint() {
    if (!R || R.state !== 'battle' || typeof Director === 'undefined' || Director.cur) return false;
    const openCells = [];
    for (let r = 0; r < Grid.rows; r++) for (let c = 0; c < Grid.cols; c++) {
      const t = Grid.tiles[r][c];
      if ((t.type === 'purple' || t.type === 'white') && !t.locked) openCells.push(c + ',' + r);
    }
    const snap = {
      v: this.VERSION, t: Date.now(),
      rng: RNG.state(),
      runId: R.runId || 0, runSeed: R.runSeed || 0, runKind: R.runKind || 'normal',
      daily: R.daily || null, endless: !!R.endless, wave: R.wave || 0,
      intermission: Director.intermission,
      hearts: R.hearts, heartsMax: R.heartsMax, peaches: R.peaches,
      kills: R.kills || 0, crystalsEarned: R.crystalsEarned || 0, codexBonus: R.codexBonus || 0,
      summonsDone: R.summonsDone || 0, pityMiss: R.pityMiss || 0,
      shovelLeft: R.shovelLeft || 0, shovelBuys: R.shovelBuys || 0,
      blessBuys: R.blessBuys, blessWave: R.blessWave || {},
      blessTaught: !!R.blessTaught, shovelTaught: !!R.shovelTaught,
      mightT: R.mightT || 0, battleTime: R.battleTime || 0,
      rangeFloor: R.rangeFloor || 0,
      idle: !!R.idle, idleMs: R.idleMs || 0,   // 挂机托管态：恢复后自动续挂
      masteryCounted: R.masteryCounted ? [...R.masteryCounted] : [],
      mods: R.mods, modOffer: R.modOffer || null,
      parts: R.parts, equips: R.equips, sigRun: R.sigRun || 0,
      rules: R.rules, weekly: R.weekly || null,
      dmgStats: R.dmgStats || {},
      pvp: R.pvp || null, pvpName: R.pvp ? R.pvp.name : '',
      openCells,
      towers: R.towers.map(u => this.serUnit(u)),
      rack: (R.rack || []).map(it => {
        if (!it) return null;
        if (it.type === 'unit') return { type: 'unit', unit: this.serUnit(it.unit) };
        return { type: 'char', ch: it.ch, lv: it.lv || 1 };
      }),
    };
    try { localStorage.setItem(this.KEY, JSON.stringify(snap)); return true; }
    catch (e) { return false; }   // 存储写满等异常：静默放弃，不影响玩法
  },

  serUnit(u) {
    return {
      key: u.key, col: u.col, row: u.row, level: u.level || 1,
      star: u.star || 0, exp: u.exp || 0, adv: u.adv || null,
      mode: u.mode || 'first', gear: u.gear || null, tid: u.tid,
    };
  },

  clear() { try { localStorage.removeItem(this.KEY); } catch (e) {} },

  /* ---------- 恢复 ---------- */
  resume() {
    const o = this.read();
    if (!o) { HUD.toast('没有可继续的一局'); return false; }
    this.resuming = true;
    try {
      Game.startRun(o.runSeed || undefined, o.runKind || 'normal', o.pvp || null, { resume: true });
      this.apply(o);
      this.resuming = false;
      this.checkpoint();   // 恢复态立刻落盘，再刷一次也在同一进度
      const next = (R.wave || 0) + 1;
      HUD.toast(R.pvp
        ? `已恢复讨伐 · 第 ${next}/${R.pvpCount} 阵备战`
        : `已恢复上局 · 第 ${next} 波备战${R.idle ? '（挂机继续）' : ''}`);
      return true;
    } catch (e) {
      this.resuming = false;
      this.clear();
      try { Game.toMenu(); } catch (e2) {}
      HUD.toast('上局存档已失效，已返回主菜单');
      return false;
    }
  },

  /* 把快照覆写回刚重放好的新局（startRun 已按同种子重建棋盘/波次/起始字） */
  apply(o) {
    R.runId = o.runId || R.runId;
    R.heartsMax = o.heartsMax || R.heartsMax;
    R.hearts = o.hearts;
    R.peaches = o.peaches;
    R.wave = o.wave || 0;
    R.kills = o.kills || 0;
    R.crystalsEarned = o.crystalsEarned || 0;
    R.codexBonus = o.codexBonus || 0;
    R.summonsDone = o.summonsDone || 0;
    R.pityMiss = o.pityMiss || 0;
    R.shovelLeft = o.shovelLeft || 0;
    R.shovelBuys = o.shovelBuys || 0;
    R.blessBuys = o.blessBuys || { heart: 0, rate: 0, slow: 0 };
    R.blessWave = o.blessWave || {};   // 备战期买过的祝福（钱已扣，效果必须跟着回来）
    R.blessTaught = !!o.blessTaught;
    R.shovelTaught = !!o.shovelTaught;
    R.mightT = o.mightT || 0;
    R.battleTime = o.battleTime || 0;
    R.rangeFloor = o.rangeFloor || 0;
    R.idle = !!o.idle;                 // 挂机态跟着残局走（apply 末尾续挂）
    R.idleMs = o.idleMs || 0;
    R.mods = Object.assign(newMods(), o.mods || {});
    R.modOffer = o.modOffer || null;
    R.parts = Object.assign({ feng: 0, ji: 0, yuan: 0, ling: 0 }, o.parts || {});
    R.equips = Array.isArray(o.equips) ? o.equips.map(g => ({ fam: g.fam, lv: g.lv || 1 })) : [];
    R.sigRun = o.sigRun || 0;
    R.rules = Object.assign(newRules(), o.rules || {});
    R.weekly = o.weekly || null;
    R.endless = !!o.endless;
    R.daily = (o.runKind === 'daily') ? (o.daily || R.daily) : null;
    R.masteryCounted = new Set(o.masteryCounted || []);   // 先恢复：防重建单位重复计熟练度
    R.selected = null; R.armedSlot = -1; R.drag = null; R.tool = null; R.gearArm = -1;

    // 棋盘开放格：按快照精确还原（初始随机开放 + 本局开垦）
    const open = new Set(o.openCells || []);
    for (let r = 0; r < Grid.rows; r++) for (let c = 0; c < Grid.cols; c++) {
      const t = Grid.tiles[r][c];
      if (t.type === 'purple' || t.type === 'white') t.locked = !open.has(c + ',' + r);
    }
    if (typeof invalidateStatic === 'function') invalidateStatic();

    // 场上单位（重建后按快照对齐等级/星/经验/进阶/索敌/装备），tid 重映射伤害统计
    const tidMap = {};
    for (const s of o.towers) {
      const u = this.restoreTower(s);
      if (u && s.tid) tidMap[s.tid] = u.tid;
    }
    const stats = {};
    for (const k in (o.dmgStats || {})) {
      if (tidMap[k]) stats[tidMap[k]] = o.dmgStats[k];
    }
    R.dmgStats = stats;

    // 召唤架
    R.rack = [];
    for (let i = 0; i < CONFIG.summon.rackSize; i++) {
      const it = (o.rack || [])[i];
      if (it && it.type === 'unit') {
        const u = this.makeRackUnitByKey(it.unit.key);
        if (u) { this.applyUnitFields(u, it.unit); R.rack.push({ type: 'unit', unit: u }); continue; }
      }
      R.rack.push(it && it.type === 'char' ? { type: 'char', ch: it.ch, lv: it.lv || 1 } : null);
    }

    // 随机流接续 + 导演回到本波备战期
    RNG.setState(o.rng);
    Director.cur = null;
    Director.spawnIdx = 0;
    Director.timer = 0;
    Director.intermission = (typeof o.intermission === 'number') ? o.intermission : CONFIG.waveIntermission;

    Bonds.invalidate();
    R.state = 'battle';
    Panels.hide();
    HUD.refresh();
    RackUI.discardDraft();
    RackUI.refresh();
    GearUI.open = false;
    GearUI.refresh();
    DpsUI.close();
    WaveMods.render();          // 待选词条（波间三选一）随快照重开

    // 通关待抉择：重弹「无尽征战 / 功成身退」二选一
    if (!R.pvp && !R.endless && !R.modOffer && R.wave >= CONFIG.waveCount) {
      Game.offerEndless();
    }
    // 末阵已破、终局计时未走完就刷新：补一次终局结算（否则导演会卡住不再出怪）
    if (R.pvp && R.wave >= R.pvpCount) {
      setTimeout(() => { if (R.state === 'battle') Game.gameOver(true); }, 600);
    }
    // 挂机残局：恢复后自动续挂（静音 + 屏幕常亮 + 托管节拍）；
    // 关页超过 30 秒的按离线时长快进追进度（分片执行，可手动暂停）
    if (R.idle && typeof AutoBot !== 'undefined') {
      AutoBot.reactivate();
      const off = Math.max(0, (Date.now() - (o.t || Date.now())) / 1000);
      if (off > 30) AutoBot.fastForward(off);
    }
  },

  restoreTower(s) {
    if (!s || !s.key || !Grid.inBounds(s.col, s.row)) return null;
    let key = s.key;
    if (key.indexOf('ling:') === 0) key = Merge.lingKey(key.slice(5));
    if (!CONFIG.towers[key] || !Grid.placeable(s.col, s.row)) return null;
    const u = Merge.makeUnit(key, s.col, s.row);
    this.applyUnitFields(u, s);
    return u;
  },

  makeRackUnitByKey(key) {
    let k = key;
    if (k && k.indexOf('ling:') === 0) k = Merge.lingKey(k.slice(5));
    if (!k || !CONFIG.towers[k]) return null;
    return Merge.makeRackUnit(k);
  },

  applyUnitFields(u, s) {
    u.level = s.level || 1;
    if (u.isGeneral) { u.star = s.star || 0; u.exp = s.exp || 0; }
    else if (s.adv) u.adv = s.adv;
    u.mode = s.mode || 'first';
    if (s.gear && s.gear.fam) u.gear = { fam: s.gear.fam, lv: s.gear.lv || 1 };
  },

  /* ---------- 生命周期 ---------- */
  boot() {
    // 备战期自动落盘（覆盖备战期内的召唤/摆子/开垦/购物），战斗中不动
    setInterval(() => {
      if (R && R.state === 'battle' && !Director.cur) this.checkpoint();
    }, 2000);
    // 切后台/关页前兜底（手机 Safari 切后台可能直接被杀）
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && R && R.state === 'battle' && !Director.cur) this.checkpoint();
    });
    window.addEventListener('beforeunload', () => {
      if (R && R.state === 'battle' && !Director.cur) this.checkpoint();
    });
  },
};
