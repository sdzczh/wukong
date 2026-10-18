/* 波次导演：刷怪、过波、胜负 */
const Director = {
  waves: [], cur: null, spawnIdx: 0, timer: 0, intermission: 0,

  reset() {
    this.waves = R.pvp ? (R.pvpWaves || []) : buildWaves();   // 讨伐：镇守镜像阵替代常规波次
    this.cur = null; this.spawnIdx = 0; this.timer = 0; this.intermission = 0;
  },

  startWave(n) {
    this.cur = this.waves[n - 1] || buildEndlessWave(n);
    this.spawnIdx = 0; this.timer = 0;
    R.wave = n;
    Bus.emit('waveStart', n);
  },

  update(dt) {
    if (R.state !== 'battle') return;

    if (!this.cur) {
      if (R.wave === 0) { this.startWave(1); return; }
      if (R.pvp && R.wave >= R.pvpCount) return;              // 讨伐末阵已破，等结算不再出新阵
      if (R.wave >= CONFIG.waveCount && !R.endless) return;   // 已通关（由 waveClear 触发结算）
      if (R.modOffer) return;                                 // 波间词条待选：暂停开下一波
      if (R.eventOffer) return;                               // 无尽事件待选：暂停开下一波
      this.intermission -= dt;
      if (this.intermission <= 0) this.startWave(R.wave + 1);
      return;
    }

    this.timer += dt;
    while (this.spawnIdx < this.cur.spawns.length && this.cur.spawns[this.spawnIdx].t <= this.timer) {
      const sp = this.cur.spawns[this.spawnIdx++];
      const e = new Enemy(sp.type, this.cur.hpMul, sp.bossKind);
      // 无尽事件对敌修正（血月 HP 提升 / 魂潮减速），仅本波
      const eb = R.eventBuff;
      if (eb && eb.wave === R.wave) {
        if (eb.hpMul) { e.maxHp = Math.round(e.maxHp * eb.hpMul); e.hp = e.maxHp; }
        if (eb.slow) e.evSlow = 1 - eb.slow;
      }
      // 精英词缀：中后期普通怪概率升级
      if (sp.type !== 'boss' && this.cur.n >= CONFIG.elite.fromWave && RNG.next() < CONFIG.elite.chance) {
        e.makeElite();
        FX.ring(e.x, e.y, Grid.tile * 0.9, CONFIG.elite.affixes[e.affix].color);
      }
      // boss 入场：冲击波 + 屏震 + 种类点名
      if (sp.type === 'boss') {
        FX.ring(e.x, e.y, Grid.tile * 2.4, '#d64545', { life: 0.6, width: 5, grow: 90 });
        FX.spark(e.x, e.y, '#d64545', 14);
        FX.shake(7, 0.4);
        if (e.bossDef) {
          FX.float(e.bossDef.name, e.x, e.y - Grid.tile * 1.1, e.bossDef.color, 20);
          HUD.toast(`${e.bossDef.name}：${e.bossDef.desc}`);
        }
      }
      R.enemies.push(e);
    }
    if (this.spawnIdx >= this.cur.spawns.length && R.enemies.every(e => !e.alive)) {
      this.cur = null;
      this.intermission = CONFIG.waveIntermission;
      Bus.emit('waveClear', R.wave);
    }
  },

  /* 提前叫波：备战期立即开下一波，返回按剩余秒数的桃奖励（不可叫时返回 0） */
  callNow() {
    if (R.state !== 'battle' || this.cur) return 0;
    if (R.modOffer || R.eventOffer) return 0;
    if (R.pvp && R.wave >= R.pvpCount) return 0;
    if (R.wave >= CONFIG.waveCount && !R.endless) return 0;
    const bonus = Math.round(Math.max(0, this.intermission) * CONFIG.callWave.perSec);
    this.intermission = 0;
    this.startWave(R.wave + 1);
    return bonus;
  },
};
