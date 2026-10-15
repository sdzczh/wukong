/* 神将技能：自动释放（就绪且范围内有敌时触发）。
   每个 key 对应 CONFIG.towers[key].skill 的实现。 */
'use strict';

const Skills = {
  /* 释放入口：General.update 调用 */
  cast(g) {
    const fn = this[g.key];
    if (fn) fn(g);
    g.skillT = g.def.skill.cd;
    const tile = Grid.tile;
    FX.float('✦ ' + g.def.skill.name, g.x, g.y - tile * 0.95, CONFIG.rarityColors[g.def.rarity] || '#ffd867', 16);
    FX.ring(g.x, g.y, tile * 1.1, CONFIG.rarityColors[g.def.rarity] || '#ffd867');
    SFX.play('skill');
  },

  inRange(g, e, mul) {
    return Math.hypot(e.x - g.x, e.y - g.y) <= g.rangePx * (mul || 1);
  },
  enemiesAround(g, mul) {
    return R.enemies.filter(e => e.alive && Skills.inRange(g, e, mul));
  },

  /* 孙悟空：棍卷风云 —— 3 秒旋棍，多次范围伤害+短暂眩晕 */
  wukong(g) { g.spinT = 3; g.spinTick = 0; },

  /* 猪八戒：倒打一耙 —— 周围敌人定身 1.2s 并击退 1 格（路径进度回退） */
  wuneng(g) {
    for (const e of Skills.enemiesAround(g, 1.4)) {
      e.applyStun(1.2);
      e.s = Math.max(0, e.s - Grid.tile);
      e.pos();
      e.takeDamage(Math.round(g.atk * 1.2), g);
    }
    FX.ring(g.x, g.y, g.rangePx * 1.4, '#8f7bb8');
  },

  /* 沙悟净：流沙河 —— 范围内敌人减速 40% 持续 4s */
  wujing(g) {
    for (const e of Skills.enemiesAround(g, 1.2)) e.applySlow(0.6, 4);
    FX.ring(g.x, g.y, g.rangePx * 1.2, '#6f86b8');
  },

  /* 哪吒：乾坤圈 —— 攻击在至多 3 个敌人间弹射 */
  nezha(g) {
    const targets = Skills.enemiesAround(g, 1.2)
      .sort((a, b) => b.s - a.s).slice(0, 3);
    let from = g;
    for (const e of targets) {
      e.takeDamage(Math.round(g.atk * 1.2), g);
      FX.tracer(from.x, from.y, Math.atan2(e.y - from.y, e.x - from.x),
        Math.hypot(e.x - from.x, e.y - from.y), '#d66a4a');
      from = e;
    }
  },

  /* 金吒：降魔杵 —— 蓄力，下一击 300% */
  jinzha(g) { g.nextMul = 3; },

  /* 木吒：吴钩双剑 —— 周围友塔攻速 +30% 5s */
  muzha(g) {
    for (const t of R.towers) {
      if (t === g || t.def.kind === 'aura') continue;
      if (Math.hypot(t.x - g.x, t.y - g.y) <= Grid.tile * 2.5) { t.hasteDur = 5; t.hasteMul = 1.3; }
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
      if (diff < 0.14) e.takeDamage(g.atk * 2, g);
    }
    FX.tracer(g.x, g.y, ang, len, '#7a6fd0');
  },

  /* 王母娘娘：蟠桃盛会 —— 轮回殿 +2 心（不超过上限），周围友塔攻速 +25% 5s */
  wangmu(g) {
    R.hearts = Math.min(CONFIG.base.hearts, R.hearts + CONFIG.drops.mightHeart + 1);
    for (const t of R.towers) {
      if (t === g || t.def.kind === 'aura') continue;
      if (Math.hypot(t.x - g.x, t.y - g.y) <= Grid.tile * 2.5) { t.hasteDur = 5; t.hasteMul = 1.25; }
    }
    const base = Grid.center(CONFIG.base.col, CONFIG.base.row);
    FX.float('+2 心', base.x, base.y - Grid.tile * 0.8, '#ff8fa0', 18);
    FX.ring(base.x, base.y, Grid.tile * 0.7, '#d0a0b8');
  },

  /* 玉皇大帝：昊天威压 —— 全屏 150% 伤害并眩晕 2s */
  yudi(g) {
    for (const e of R.enemies) {
      if (!e.alive) continue;
      e.applyStun(2);
      e.takeDamage(Math.round(g.atk * 1.5), g);
    }
    FX.ring(CONFIG.logicalW / 2, CONFIG.logicalH / 2, Grid.tile * 6, '#d6b24a');
  },

  /* 阎罗王：生死簿 —— 标记血量最低敌人，3s 后斩杀 */
  yanwang(g) {
    let best = null;
    for (const e of R.enemies) {
      if (!e.alive) continue;
      if (!best || e.hp < best.hp) best = e;
    }
    if (best) {
      best.deathMark = { t: 3, src: g };
      FX.float('生死簿', best.x, best.y - Grid.tile * 0.7, '#4a4a58', 16);
    }
  },

  /* 嫦娥：万箭齐发 —— 向范围内每个敌人各射一箭（120%） */
  change(g) {
    const targets = Skills.enemiesAround(g, 1.1);
    for (const e of targets) {
      R.projectiles.push(new Projectile(g.x, g.y - Grid.tile * 0.2, e, Math.round(g.atk * 1.2), { src: g, color: '#d0709a' }));
    }
    if (targets.length) SFX.play('shoot');
  },

  /* 李靖：玲珑宝塔 —— 塔影罩范围 4s：减速 30% + 持续受伤 */
  lijing(g) { g.zoneT = 4; g.zoneTick = 0; },
};
