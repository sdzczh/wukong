/* 神将：带经验/等级的传说单位（继承 Tower 的攻击行为）+ 自动技能 */
class General extends Tower {
  constructor(key, col, row) {
    super(key, col, row);
    this.exp = 0;
    this.star = 0;        // 升星（同名神将合并 +1，满星解锁 star3 被动）
    this.skillT = 3;      // 开局 3s 后可用技能
    this.spinT = 0; this.spinTick = 0;   // 悟空旋棍
    this.zoneT = 0; this.zoneTick = 0;   // 李靖宝塔
  }

  /* 星级加成：每星攻击 +8%、技能效果 +15% */
  get starMul() { return 1 + this.star * CONFIG.generalStars.skillStep; }
  get starMaxed() { return this.star >= CONFIG.generalStars.max; }

  /* 升星（合并同名神将时调用） */
  starUp() {
    this.star = Math.min(CONFIG.generalStars.max, this.star + 1);
    Merge.recordStar(this.key, this.star);
    const rc = CONFIG.rarityColors[this.def.rarity] || '#ffd867';
    FX.ring(this.x, this.y, Grid.tile * 1.1, rc);
    FX.float('★' + this.star, this.x, this.y - Grid.tile * 0.9, '#ffd867', 19);
    if (this.starMaxed) {
      FX.float('满星 · ' + this.def.star3.name, this.x, this.y - Grid.tile * 1.4, '#ffdfa0', 16);
      HUD.toast(`${this.def.name} 满星！解锁被动「${this.def.star3.name}」：${this.def.star3.desc}`);
    } else {
      HUD.toast(`${this.def.name} 升星 ★${this.star}（攻击+8% · 技能+15%）`);
    }
    SFX.play('levelup');
    Bus.emit('generalStarUp', this);
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
            e.takeDamage(Math.round(this.atk * 0.6 * this.starMul), this);
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
            e.takeDamage(Math.max(1, Math.round(this.atk * 0.3 * this.starMul) - (e.armor || 0)), this);
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
    // 星标：字牌下缘金星（满星金晕）
    if (this.star > 0) {
      const tile = Grid.tile;
      const y = this.y + tile * 0.52;
      ctx.save();
      ctx.font = `900 ${Math.round(tile * 0.2)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (this.starMaxed) { ctx.shadowColor = '#ffd867'; ctx.shadowBlur = 7; }
      ctx.fillStyle = '#ffd867';
      ctx.fillText('★'.repeat(this.star), this.x, y);
      ctx.restore();
    }
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

/* ---------- 满星被动查询（star3）：塔攻击链路按需调用 ----------
   督战/连环：周围 2 格友塔增益；天威：全体增益；天目：自身射程+破隐 */
function genPassiveAtkMul(t) {
  let m = 1 + (t.star || 0) * CONFIG.generalStars.atkStep;   // 自身每星攻击 +8%
  for (const g of R.towers) {
    if (!g.isGeneral || !g.starMaxed) continue;
    if (g.key === 'yudi') m += 0.10;   // 天威：全体攻击 +10%
    else if (g.key === 'wuneng' && g !== t &&
             Math.hypot(g.x - t.x, g.y - t.y) <= Grid.tile * 2) m += 0.15;   // 督战
  }
  return m;
}
function genPassiveRateMul(t) {
  for (const g of R.towers) {
    if (g !== t && g.isGeneral && g.starMaxed && g.key === 'muzha' &&
        Math.hypot(g.x - t.x, g.y - t.y) <= Grid.tile * 2) return 1.2;   // 连环
  }
  return 1;
}
function genRangeBonus(t) {
  return (t.isGeneral && t.starMaxed && t.key === 'yangjian') ? 1.5 : 0;   // 天目：+1.5 格（rangePx 内统一 ×Grid.tile）
}
function genSeesStealth(t) {
  return !!(t.isGeneral && t.starMaxed && t.key === 'yangjian');   // 天目：可攻击遁形
}

/* ---------- 神将熟练度：上场次数累计（跨局），纯表现特效强化 ---------- */
const Mastery = {
  uses(key) { return (Save.data.mastery && Save.data.mastery[key]) || 0; },
  tierOf(key) {
    const u = this.uses(key), t = CONFIG.mastery.tiers;
    return u >= t[2] ? 3 : u >= t[1] ? 2 : u >= t[0] ? 1 : 0;
  },
  /* 上场计数：每局每神将只记一次（铲回再上不刷次数） */
  countPlace(key) {
    R.masteryCounted = R.masteryCounted || new Set();
    if (R.masteryCounted.has(key)) return;
    R.masteryCounted.add(key);
    const m = Save.data.mastery = Save.data.mastery || {};
    const before = this.tierOf(key);
    m[key] = (m[key] || 0) + 1;
    const after = this.tierOf(key);
    if (after > before) {
      HUD.toast(`${CONFIG.towers[key].name} 熟练度提升 · ${CONFIG.mastery.names[after - 1]}`);
      Save.write();
    } else if (m[key] % 5 === 0) Save.write();   // 攒 5 次落一次盘
  },
};
