/* 敌人：沿路径移动的魂系单位（elite = 精英词缀怪） */
class Enemy {
  constructor(type, hpMul) {
    const d = CONFIG.enemies[type];
    this.type = type; this.def = d;
    const ruleMul = R.rules ? R.rules.enemyHpMul : 1;
    this.maxHp = Math.round(d.hp * hpMul * ruleMul);
    this.hp = this.maxHp;
    this.s = 0; this.alive = true; this.leaked = false;
    this.stun = 0; this.slowT = 0; this.slowF = 1; this.flash = 0;
    this.x = 0; this.y = 0; this.angle = 0;
    this.wobble = RNG.next() * Math.PI * 2;
    this.elite = false; this.affix = null;      // 精英词缀：split/shield/heal/swift
    this.shield = 0; this.shieldMax = 0; this.shieldT = 0;
    this.healT = 0; this.mini = false;          // mini = 分裂出的小分身
    this.rewardMul = 1; this.expMul = 1;
    this.pos();
  }

  /* 升级为精英（forceAffix 指定词缀，否则随机） */
  makeElite(forceAffix) {
    const cfg = CONFIG.elite;
    const ids = Object.keys(cfg.affixes);
    this.affix = forceAffix || ids[RNG.int(ids.length)];
    this.elite = true;
    this.rewardMul = cfg.rewardMul;
    this.expMul = cfg.expMul;
    this.maxHp = Math.round(this.maxHp * cfg.hpMul);
    this.hp = this.maxHp;
    if (this.affix === 'shield') {
      this.shieldMax = Math.round(this.maxHp * 0.5);
      this.shield = this.shieldMax;
      this.shieldT = 5;
    }
    if (this.affix === 'heal') this.healT = 1.5;
    return this;
  }

  get speedPx() {
    const swift = this.affix === 'swift' ? 1.6 : 1;
    const bless = R.blessWave && R.blessWave.slow ? CONFIG.peachSink.bless.slow.spdMul : 1;
    return this.def.speed * Grid.tile * Talents.enemySpeedMul() * swift * bless * (R.rules ? R.rules.enemySpdMul : 1);
  }

  pos() {
    const p = Grid.posAt(this.s);
    this.x = p.x; this.y = p.y; this.angle = p.angle;
  }

  update(dt) {
    if (!this.alive) return;
    if (this.flash > 0) this.flash -= dt;
    // 精英：治疗光环（护盾重生成在受击破盾后计时）
    if (this.elite) {
      if (this.shieldMax > 0 && this.shield < this.shieldMax) {
        this.shieldT -= dt;
        if (this.shieldT <= 0) {
          this.shield = this.shieldMax; this.shieldT = 5;
          FX.ring(this.x, this.y, Grid.tile * 0.6, '#6fa8e8');
        }
      }
      if (this.affix === 'heal') {
        this.healT -= dt;
        if (this.healT <= 0) {
          this.healT = 1.5;
          const r = Grid.tile * 1.8;
          const amt = Math.max(2, Math.round(this.maxHp * 0.03));
          for (const o of R.enemies) {
            if (!o.alive || o === this) continue;
            if (Math.hypot(o.x - this.x, o.y - this.y) > r) continue;
            if (o.hp >= o.maxHp) continue;
            o.hp = Math.min(o.maxHp, o.hp + amt);
            FX.float('+' + amt, o.x, o.y - Grid.tile * 0.5, '#6fc08a', 13);
          }
          FX.ring(this.x, this.y, r, '#6fc08a', { life: 0.5, width: 2 });
        }
      }
    }
    // 生死簿：3 秒后斩杀
    if (this.deathMark) {
      this.deathMark.t -= dt;
      if (this.deathMark.t <= 0) {
        const src = this.deathMark.src;
        this.deathMark = null;
        // 按真实剩余量斩杀（含护甲与护盾）：伤害统计与飘字不被 99999 虚高
        this.takeDamage(this.hp + (this.def.armor || 0) + (this.shield || 0), src);
        return;
      }
    }
    if (this.stun > 0) { this.stun -= dt; return; }
    if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) this.slowF = 1; }
    this.s += this.speedPx * this.slowF * dt;
    if (this.s >= Grid.totalLen) { this.leak(); return; }
    this.pos();
  }

  leak() {
    this.alive = false; this.leaked = true;
    Bus.emit('leak', this);
  }

  takeDamage(dmg, src) {
    if (!this.alive) return;
    let eff = Math.max(1, dmg - (this.def.armor || 0));
    // 伤害统计：按实际输出计（含被护盾吸收部分）
    const out = eff;
    if (src && src.tid) {
      const st = R.dmgStats[src.tid] || (R.dmgStats[src.tid] = {
        name: '', dmg: 0,
        color: src.isGeneral ? (CONFIG.rarityColors[src.def.rarity] || '#e8933c')
                             : (Tower.colors[src.key] || '#7a6fd0'),
      });
      st.name = src.def.name + (src.level > 1 ? ' Lv' + src.level : '');
      st.dmg += out;
    }
    // 精英护盾先于生命值吸收（破盾后开始 5 秒重生成计时）
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, eff);
      this.shield -= absorbed; eff -= absorbed;
      this.shieldT = 5;
      if (absorbed > 0) FX.float('盾' + absorbed, this.x + Grid.tile * 0.3, this.y - Grid.tile * 0.6, '#8fc4ff', 13);
      if (eff <= 0) { this.flash = 0.12; if (src) this.lastHitBy = src; return; }
    }
    this.hp -= eff; this.flash = 0.12;
    if (src) this.lastHitBy = src;   // 记录伤害归属（神将吃经验）
    FX.float(String(eff), this.x, this.y - Grid.tile * 0.5, '#ffe9a8', 15);
    if (this.hp <= 0) {
      this.alive = false;
      if (this.elite && this.affix === 'split') this._split();
      Bus.emit('enemyKilled', this);
    }
  }

  /* 分裂词缀：死亡时原地迸出 2 只小分身 */
  _split() {
    for (let i = 0; i < 2; i++) {
      const m = new Enemy(this.type, 1);
      m.maxHp = Math.max(1, Math.round(this.maxHp * 0.28));
      m.hp = m.maxHp;
      m.mini = true;
      m.rewardMul = 0;
      m.s = Math.max(0, this.s - Grid.tile * 0.35 + i * Grid.tile * 0.35);
      m.pos();
      R.enemies.push(m);
    }
    FX.burst(this.x, this.y, '#e8b64c');
  }

  applyStun(t) { this.stun = Math.max(this.stun, t); }
  applySlow(factor, t) { this.slowF = Math.min(this.slowF, factor); this.slowT = Math.max(this.slowT, t); }

  draw(ctx, now) {
    const tile = Grid.tile;
    const size = tile * this.def.size * (this.mini ? 0.7 : 1);
    const bob = Math.sin(now * 4.5 + this.wobble) * tile * 0.04;

    // 影
    ctx.save();
    ctx.fillStyle = '#00000055';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + size * 0.42, size * 0.42, size * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();

    // 精英：旋转虚线环
    if (this.elite && this.affix) {
      ctx.strokeStyle = CONFIG.elite.affixes[this.affix].color;
      ctx.lineWidth = 3;
      ctx.setLineDash([7, 5]);
      ctx.lineDashOffset = -now * 34;
      ctx.beginPath();
      ctx.arc(this.x, this.y + bob * 0.5, size * 0.78, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 字
    ctx.font = `900 ${Math.round(size)}px "Ma Shan Zheng","Kaiti SC","STKaiti","KaiTi",serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4; ctx.strokeStyle = '#12101ccc';
    ctx.strokeText(this.def.char, this.x, this.y + bob);
    ctx.fillStyle = this.flash > 0 ? '#ffffff' : this.def.color;
    ctx.fillText(this.def.char, this.x, this.y + bob);

    // 精英：词缀角标
    if (this.elite && this.affix) {
      const a = CONFIG.elite.affixes[this.affix];
      const bx = this.x - size * 0.6, by = this.y - size * 0.52;
      ctx.fillStyle = a.color;
      ctx.beginPath(); ctx.arc(bx, by, size * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#12101c'; ctx.lineWidth = 2; ctx.stroke();
      ctx.font = `900 ${Math.round(size * 0.3)}px "Ma Shan Zheng","Kaiti SC","STKaiti","KaiTi",serif`;
      ctx.fillStyle = '#1a1626';
      ctx.fillText(a.char, bx, by + 1);
    }

    // 状态标记
    if (this.deathMark) {
      ctx.font = `900 ${Math.round(size * 0.42)}px "Ma Shan Zheng","Kaiti SC","STKaiti",serif`;
      ctx.fillStyle = '#3a3a48';
      ctx.fillText('簿', this.x, this.y - size * 0.66);
    }
    if (this.stun > 0) {
      ctx.font = `900 ${Math.round(size * 0.4)}px sans-serif`;
      ctx.fillStyle = '#ffd867';
      const sx = this.x + Math.sin(now * 8) * size * 0.2;
      ctx.fillText('✦', sx, this.y - size * 0.62);
    } else if (this.slowF < 1) {
      ctx.font = `900 ${Math.round(size * 0.34)}px sans-serif`;
      ctx.fillStyle = '#7fc4ff';
      ctx.fillText('❄', this.x + size * 0.42, this.y - size * 0.5);
    }

    // 血条（精英常显；带护盾时下方追加蓝色盾条）
    if (this.hp < this.maxHp || this.shield > 0 || this.elite) {
      const w = size * 1.05, h = 5;
      const bx = this.x - w / 2, by = this.y - size * 0.68;
      ctx.fillStyle = '#000000aa';
      ctx.fillRect(bx - 1, by - 1, w + 2, h + 2);
      const ratio = Math.max(0, this.hp / this.maxHp);
      ctx.fillStyle = ratio > 0.5 ? '#6fe06f' : ratio > 0.25 ? '#ffb84c' : '#ff5f6b';
      ctx.fillRect(bx, by, w * ratio, h);
      if (this.shieldMax > 0) {
        const sr = Math.max(0, this.shield / this.shieldMax);
        ctx.fillStyle = '#000000aa';
        ctx.fillRect(bx - 1, by + h, w + 2, 4);
        ctx.fillStyle = '#6fa8e8';
        ctx.fillRect(bx, by + h + 1, w * sr, 2.5);
      }
    }
    ctx.restore();
  }
}
