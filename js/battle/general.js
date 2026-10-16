/* 神将：带经验/等级的传说单位（继承 Tower 的攻击行为）+ 自动技能 */
class General extends Tower {
  constructor(key, col, row) {
    super(key, col, row);
    this.exp = 0;
    this.skillT = 3;      // 开局 3s 后可用技能
    this.spinT = 0; this.spinTick = 0;   // 悟空旋棍
    this.zoneT = 0; this.zoneTick = 0;   // 李靖宝塔
  }

  /* 升级所需经验：随等级线性增长（8/12/16/20…），压住无尽里的指数成长 */
  get expNeed() { return 8 + (this.level - 1) * 4; }

  /* 专属装备等级（局外装备库合成升级，唤醒时自动随身） */
  get sigLv() { return Gear.sigLvOf(this.key); }

  /* 击杀经验：满升级线升 1 级，最高 maxLevel。
     加成：羁绊（取经之路）× 每周规则 × 波间词条「悟道」 */
  gainExp(n) {
    if (this.level >= this.maxLevel) return;
    const mul = (1 + Bonds.bonus().exp) * (R.rules ? R.rules.expMul : 1)
      * (1 + R.mods.exp * CONFIG.waveMods.steps.exp);
    this.exp += n * mul;
    while (this.level < this.maxLevel) {
      const need = this.expNeed;
      if (this.exp < need) break;
      this.exp -= need;
      this.level++;
      Merge.recordGeneral(this.key, this.level);   // 图鉴实战最高等级
      this.skillT = Math.min(this.skillT, 2);   // 升级奖励：技能快转 2s
      FX.ring(this.x, this.y, Grid.tile * 0.9, CONFIG.rarityColors[this.def.rarity] || '#e8933c');
      FX.float('Lv' + this.level, this.x, this.y - Grid.tile * 0.7, '#ffd867', 17);
      SFX.play('levelup');
      Bus.emit('generalLevelUp', this);
    }
  }

  get skillReady() { return this.skillT <= 0; }

  update(dt, enemies) {
    // 技能冷却
    if (this.skillT > 0) this.skillT -= dt;

    // 悟空：旋棍持续伤害
    if (this.spinT > 0) {
      this.spinT -= dt; this.spinTick -= dt;
      if (this.spinTick <= 0) {
        this.spinTick = 0.4;
        for (const e of R.enemies) {
          if (!e.alive) continue;
          if (Math.hypot(e.x - this.x, e.y - this.y) <= Grid.tile * 1.8) {
            e.applyStun(0.3);
            e.takeDamage(Math.round(this.atk * 0.6), this);
          }
        }
        const a = (performance.now() / 180) % (Math.PI * 2);
        FX.arc(this.x, this.y, Grid.tile * 1.5, a, a + Math.PI * 1.2, '#c98a2e');
      }
    }

    // 李靖：宝塔领域
    if (this.zoneT > 0) {
      this.zoneT -= dt; this.zoneTick -= dt;
      if (this.zoneTick <= 0) {
        this.zoneTick = 0.5;
        for (const e of R.enemies) {
          if (!e.alive) continue;
          if (Math.hypot(e.x - this.x, e.y - this.y) <= this.rangePx) {
            e.applySlow(0.7, 0.6);
            e.takeDamage(Math.max(1, Math.round(this.atk * 0.3) - (e.def.armor || 0)), this);
          }
        }
        FX.ring(this.x, this.y, this.rangePx, '#8a9a6a');
      }
    }

    // 自动施法：就绪且（范围内有敌 / 全屏类有任意敌）
    if (this.skillT <= 0 && this._readyToCast(enemies)) {
      Skills.cast(this);
    }

    super.update(dt, enemies);
  }

  _readyToCast(enemies) {
    if (this.key === 'yudi' || this.key === 'wangmu') return enemies.some(e => e.alive);
    if (this.key === 'yanwang') return enemies.some(e => e.alive && !e.deathMark);
    return enemies.some(e => e.alive && this.inRange(e));
  }

  draw(ctx) {
    super.draw(ctx);
    // 技能就绪标记：金色光点
    if (this.skillT <= 0) {
      const tile = Grid.tile;
      const bx = this.x - tile * 0.38, by = this.y - tile * 0.38;
      const pulse = 0.8 + Math.sin(performance.now() / 200) * 0.2;
      ctx.save();
      ctx.fillStyle = '#ffd867';
      ctx.shadowColor = '#ffd867'; ctx.shadowBlur = 8 * pulse;
      ctx.beginPath(); ctx.arc(bx, by, tile * 0.1 * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
}
