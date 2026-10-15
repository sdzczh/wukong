/* 波次导演：刷怪、过波、胜负 */
const Director = {
  waves: [], cur: null, spawnIdx: 0, timer: 0, intermission: 0,

  reset() {
    this.waves = buildWaves();
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
      if (R.wave >= CONFIG.waveCount && !R.endless) return;   // 已通关（由 waveClear 触发结算）
      this.intermission -= dt;
      if (this.intermission <= 0) this.startWave(R.wave + 1);
      return;
    }

    this.timer += dt;
    while (this.spawnIdx < this.cur.spawns.length && this.cur.spawns[this.spawnIdx].t <= this.timer) {
      const sp = this.cur.spawns[this.spawnIdx++];
      R.enemies.push(new Enemy(sp.type, this.cur.hpMul));
    }
    if (this.spawnIdx >= this.cur.spawns.length && R.enemies.every(e => !e.alive)) {
      this.cur = null;
      this.intermission = CONFIG.waveIntermission;
      Bus.emit('waveClear', R.wave);
    }
  },
};
