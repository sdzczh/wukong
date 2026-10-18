/* 神将技能：自动释放（就绪且范围内有敌时触发）。
   每个 key 对应 CONFIG.towers[key].skill 的实现。 */
'use strict';

const Skills = {
  /* 释放入口：General.update 调用 */
  cast(g) {
    const fn = this[g.key];
    if (fn) fn(g);
    // 技冷却缩减：灵犀/专属 + 羁绊 + 波间词条「凝神」（合计封顶 85%）
    const cdMul = Math.min(0.85, Gear.modsOf(g).cdMul + Bonds.bonus().cd + R.mods.cd * CONFIG.waveMods.steps.cd);
    g.skillT = g.def.skill.cd * (g.key === 'wukong' ? Talents.gloryCdMul() : 1) * (1 - cdMul);
    const tile = Grid.tile;
    FX.float('✦ ' + g.def.skill.name, g.x, g.y - tile * 0.95, CONFIG.rarityColors[g.def.rarity] || '#ffd867', 16);
    FX.ring(g.x, g.y, tile * 1.1, CONFIG.rarityColors[g.def.rarity] || '#ffd867');
    // 熟练度特效强化（纯表现）：Lv1 双环 → Lv3 花火
    const mt = Mastery.tierOf(g.key);
    if (mt >= 1) FX.ring(g.x, g.y, tile * 1.7, '#ffd867', { life: 0.5, width: 2.5 });
    if (mt >= 3) FX.spark(g.x, g.y, '#ffd867', 10);
    FX.shake(4, 0.22);
    SFX.play('skill');
  },

  inRange(g, e, mul) {
    return Math.hypot(e.x - g.x, e.y - g.y) <= g.rangePx * (mul || 1);
  },
  enemiesAround(g, mul) {
    return R.enemies.filter(e => e.alive && Skills.inRange(g, e, mul));
  },

  /* 孙悟空：棍卷风云 —— 3 秒旋棍（专属 +0.5s/级），多次范围伤害+短暂眩晕 */
  wukong(g) { g.spinT = (3 + 0.5 * g.sigLv) * g.starMul; g.spinTick = 0; },

  /* 猪八戒：倒打一耙 —— 周围敌人定身（专属 +0.2s/级）并击退 1 格（路径进度回退） */
  wuneng(g) {
    for (const e of Skills.enemiesAround(g, 1.4)) {
      e.applyStun((1.2 + 0.2 * g.sigLv) * g.starMul);
      e.s = Math.max(0, e.s - Grid.tile);
      e.pos();
      e.takeDamage(Math.round(g.atk * 1.2 * g.starMul), g);
    }
    FX.ring(g.x, g.y, g.rangePx * 1.4, '#8f7bb8');
  },

  /* 沙悟净：流沙河 —— 范围内敌人减速（专属 +3%/级）持续 4s */
  wujing(g) {
    const slowF = Math.max(0.4, 0.6 - 0.03 * g.sigLv - 0.04 * g.star);
    for (const e of Skills.enemiesAround(g, 1.2)) e.applySlow(slowF, 4 * g.starMul);
    FX.ring(g.x, g.y, g.rangePx * 1.2, '#6f86b8');
  },

  /* 哪吒：乾坤圈 —— 攻击在至多 3 个敌人间弹射（专属 +1/级） */
  nezha(g) {
    const targets = Skills.enemiesAround(g, 1.2)
      .sort((a, b) => b.s - a.s).slice(0, 3 + g.sigLv + g.star);
    let from = g;
    for (const e of targets) {
      e.takeDamage(Math.round(g.atk * 1.2 * g.starMul), g);
      FX.tracer(from.x, from.y, Math.atan2(e.y - from.y, e.x - from.x),
        Math.hypot(e.x - from.x, e.y - from.y), '#d66a4a');
      from = e;
    }
  },

  /* 金吒：降魔杵 —— 蓄力，下一击 300%（专属 +20%/级） */
  jinzha(g) { g.nextMul = (3 + 0.2 * g.sigLv) * g.starMul; },

  /* 木吒：吴钩双剑 —— 周围友塔攻速 +30% 5s（专属 +3%/级） */
  muzha(g) {
    for (const t of R.towers) {
      if (t === g || t.def.kind === 'aura') continue;
      if (Math.hypot(t.x - g.x, t.y - g.y) <= Grid.tile * 2.5) { t.hasteDur = 5; t.hasteMul = 1 + (0.3 + 0.03 * g.sigLv) * g.starMul; }
    }
  },

  /* 杨戬：天眼 —— 贯穿激光，直线 1.5 倍射程内 200% 伤害 */
  yangjian(g) {
    const t0 = g.pickTarget(R.enemies);
    if (!t0) return;
    const ang = Math.atan2(t0.y - g.y, t0.x - g.x);
    const len = g.rangePx * 1.5;
    for (const e of R.enemies) {
      if (!e.alive) continue;
      const dx = e.x - g.x, dy = e.y - g.y;
      const dist = Math.hypot(dx, dy);
      if (dist > len) continue;
      let diff = Math.abs(Math.atan2(dy, dx) - ang);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff < 0.14) e.takeDamage(g.atk * (2 + 0.15 * g.sigLv) * g.starMul, g);   // 专属 +15%/级
    }
    FX.tracer(g.x, g.y, ang, len, '#7a6fd0');
  },

  /* 王母娘娘：蟠桃盛会 —— 轮回殿 +2 心（专属 3 级起再 +1），周围友塔攻速 +25% 5s */
  wangmu(g) {
    R.hearts = Math.min(R.heartsMax, R.hearts + CONFIG.drops.mightHeart + 1 + g.star + (g.sigLv >= 3 ? 1 : 0));
    for (const t of R.towers) {
      if (t === g || t.def.kind === 'aura') continue;
      if (Math.hypot(t.x - g.x, t.y - g.y) <= Grid.tile * 2.5) { t.hasteDur = 5; t.hasteMul = 1 + 0.25 * g.starMul; }
    }
    const base = Grid.center(CONFIG.base.col, CONFIG.base.row);
    FX.float('+2 心', base.x, base.y - Grid.tile * 0.8, '#ff8fa0', 18);
    FX.ring(base.x, base.y, Grid.tile * 0.7, '#d0a0b8');
  },

  /* 玉皇大帝：昊天威压 —— 全屏 150% 伤害并眩晕（专属 +0.15s/级） */
  yudi(g) {
    for (const e of R.enemies) {
      if (!e.alive) continue;
      e.applyStun((2 + 0.15 * g.sigLv) * g.starMul);
      e.takeDamage(Math.round(g.atk * 1.5 * g.starMul), g);
    }
    FX.ring(CONFIG.logicalW / 2, CONFIG.logicalH / 2, Grid.tile * 6, '#d6b24a');
  },

  /* 阎罗王：生死簿 —— 标记血量最低敌人，（专属提前 0.2s/级）后斩杀 */
  yanwang(g) {
    let best = null;
    for (const e of R.enemies) {
      if (!e.alive) continue;
      if (!best || e.hp < best.hp) best = e;
    }
    if (best) {
      best.deathMark = { t: Math.max(1.2, (3 - 0.2 * g.sigLv) / g.starMul), src: g };
      FX.float('生死簿', best.x, best.y - Grid.tile * 0.7, '#4a4a58', 16);
    }
  },

  /* 嫦娥：万箭齐发 —— 向范围内每个敌人各射一箭（120%，专属 +10%/级） */
  change(g) {
    const targets = Skills.enemiesAround(g, 1.1);
    for (const e of targets) {
      R.projectiles.push(new Projectile(g.x, g.y - Grid.tile * 0.2, e, Math.round(g.atk * (1.2 + 0.1 * g.sigLv) * g.starMul),
        { src: g, color: '#e0d0ff', size: 6, shape: 'moon', glow: 12, trail: '#b8a8e8', impact: true }));
    }
    if (targets.length) SFX.play('shoot');
  },

  /* 李靖：玲珑宝塔 —— 塔影罩范围（专属 +0.5s/级）：减速 30% + 持续受伤 */
  lijing(g) { g.zoneT = (4 + 0.5 * g.sigLv) * g.starMul; g.zoneTick = 0; },

  /* 红孩儿：三昧真火 —— 火浪灼烧眼前敌群（120% + 叠灼烧），
     落点（最远敌处）留下燃烧地带（专属 +0.4s/级，General.update 逐跳结算） */
  honghaier(g) {
    const cap = g.starMaxed ? 8 : 5;   // 满星·业火：灼烧叠层上限 5→8
    const targets = Skills.enemiesAround(g, 1.2);
    let far = null;
    for (const e of targets) {
      e.takeDamage(Math.round(g.atk * 1.2 * g.starMul), g);
      e.applyBurn(Math.max(1, Math.round(g.atk * 0.12)), 5, cap, g);
      if (!far || e.s > far.s) far = e;
    }
    const tile = Grid.tile, r = tile * 1.6;
    const zx = far ? far.x : g.x, zy = far ? far.y : g.y;
    g.fireZone = { x: zx, y: zy, r };
    g.fireT = (5 + 0.4 * g.sigLv) * g.starMul;
    g.fireTick = 0;
    FX.ring(zx, zy, r, '#e0563c');
    FX.float('三昧真火', zx, zy - tile * 0.8, '#ff9a5c', 16);
  },

  /* 镇元子：缚地灵根 —— 定身敌群（专属 +0.2s/级），持续吸取伤害，
     25%（满星·地脉 35%）化作蟠桃，单次封顶 12（General.update 逐跳结算） */
  zhenyuanzi(g) {
    const dur = (2.5 + 0.2 * g.sigLv) * g.starMul;
    for (const e of Skills.enemiesAround(g, 1.1)) e.applyStun(dur);
    g.rootT = dur; g.rootTick = 0; g.rootGain = 0;
    FX.ring(g.x, g.y, g.rangePx * 1.1, '#7fd8c8');
    FX.float('缚地灵根', g.x, g.y - Grid.tile * 0.9, '#7fd8c8', 16);
  },

  /* 银角大王：移山压顶 —— 范围内血量最高者压入山底（专属 +0.3s/级，
     移出战局不可索敌/免伤），弹出受 200% 重创（满星·山威：弹出眩晕 0.8s） */
  yinjiao(g) {
    let best = null;
    for (const e of R.enemies) {
      if (!e.alive || e.banishT > 0) continue;
      if (Math.hypot(e.x - g.x, e.y - g.y) > g.rangePx * 1.2) continue;
      if (!best || e.maxHp > best.maxHp) best = e;
    }
    if (best) best.applyBanish((3 + 0.3 * g.sigLv) * g.starMul,
      Math.round(g.atk * 2 * g.starMul), g, g.starMaxed ? 0.8 : 0);
  },
};
