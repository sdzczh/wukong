/* 字塔：普通字单位（弓/枪/棍/营/灵字）与神将共用基类 */
class Tower {
  constructor(key, col, row) {
    this.key = key; this.def = CONFIG.towers[key];
    this.col = col; this.row = row;
    const p = Grid.center(col, row);
    this.x = p.x; this.y = p.y;
    this.level = 1;
    this.cd = 0; this.animT = 0;
  }

  get isGeneral() { return !!this.def.general; }

  get maxLevel() { return this.def.maxLevel || 5; }

  get levelMul() { return this.def.levelMul || CONFIG.towerLevelMul; }

  get atk() {
    const might = R.mightT > 0 ? CONFIG.drops.mightMul : 1;
    return Math.round(this.def.atk * (1 + this.levelMul.atk * (this.level - 1)) * might);
  }
  get rangePx() { return (this.def.range + this.levelMul.range * (this.level - 1)) * Grid.tile; }

  /* 营的战鼓加成 */
  auraMul() {
    let m = 1;
    for (const t of R.towers) {
      if (t === this || t.def.kind !== 'aura') continue;
      if (Math.hypot(t.x - this.x, t.y - this.y) <= t.def.range * Grid.tile + 1) m += t.def.auraRate;
    }
    return m;
  }

  inRange(e) { return Math.hypot(e.x - this.x, e.y - this.y) <= this.rangePx; }

  /* 默认索敌：最接近基地的敌人（路径 progress 最大者） */
  pickTarget(enemies) {
    let best = null;
    for (const e of enemies) {
      if (!e.alive || !this.inRange(e)) continue;
      if (!best || e.s > best.s) best = e;
    }
    return best;
  }

  update(dt, enemies) {
    if (this.animT > 0) this.animT -= dt;
    if (this.hasteDur > 0) this.hasteDur -= dt;
    if (this.def.kind === 'aura') return;
    this.cd -= dt;
    if (this.cd > 0) return;
    const target = this.pickTarget(enemies);
    if (!target) return;
    const haste = this.hasteDur > 0 ? (this.hasteMul || 1.3) : 1;
    this.cd = 1 / (this.def.rate * this.auraMul() * haste);
    this.animT = 0.14;
    this.fire(target, enemies);
  }

  fire(target, enemies) {
    const dmg = Math.round(this.atk * (this.nextMul || 1));
    this.nextMul = 0;
    if (this.def.kind === 'arrow') {
      R.projectiles.push(new Projectile(this.x, this.y - Grid.tile * 0.2, target, dmg, { src: this }));
      SFX.play('shoot');
    } else if (this.def.kind === 'pierce') {
      const ang = Math.atan2(target.y - this.y, target.x - this.x);
      const hits = enemies
        .filter(e => e.alive && this.lineHit(ang, e))
        .sort((a, b) => Math.hypot(a.x - this.x, a.y - this.y) - Math.hypot(b.x - this.x, b.y - this.y))
        .slice(0, this.def.pierce);
      hits.forEach(e => e.takeDamage(dmg, this));
      FX.tracer(this.x, this.y, ang, this.rangePx, '#e0905c');
      SFX.play('shoot');
    } else if (this.def.kind === 'cleave') {
      const ang = Math.atan2(target.y - this.y, target.x - this.x);
      const near = enemies
        .filter(e => e.alive && Math.hypot(e.x - target.x, e.y - target.y) <= Grid.tile * 1.1)
        .sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y))
        .slice(0, this.def.cleave);
      near.forEach(e => e.takeDamage(dmg, this));
      FX.arc(this.x, this.y, Grid.tile * 1.15, ang - 0.55, ang + 0.55, '#b98bc4');
      SFX.play('hit');
    }
  }

  /* 长枪穿刺：目标方向窄带判定 */
  lineHit(ang, e) {
    const dx = e.x - this.x, dy = e.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > this.rangePx + Grid.tile * 0.3) return false;
    let diff = Math.abs(Math.atan2(dy, dx) - ang);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    return diff < 0.18;
  }

  draw(ctx) {
    const tile = Grid.tile;
    const half = tile * 0.42;
    const pop = this.animT > 0 ? 1 + this.animT * 0.9 : 1;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(pop, pop);

    // 字牌底色
    ctx.fillStyle = this.def.cardBg || '#f3ead6';
    ctx.strokeStyle = this.isGeneral ? (CONFIG.rarityColors[this.def.rarity] || '#e8933c') : '#c3b18a';
    ctx.lineWidth = this.isGeneral ? 3.5 : 2.5;
    roundRect(ctx, -half, -half, half * 2, half * 2, 9);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#00000012';
    roundRect(ctx, -half + 4, half * 0.35, half * 2 - 8, half * 0.5, 6);
    ctx.fill();

    // 字（单字大、双字略小）
    const ch = this.def.char;
    const fs = ch.length > 1 ? tile * 0.34 : tile * 0.5;
    ctx.font = `900 ${Math.round(fs)}px "Ma Shan Zheng","Kaiti SC","STKaiti","KaiTi",serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = this.def.color || Tower.colors[this.key] || '#4a3b52';
    ctx.fillText(ch, 0, 2);
    ctx.restore();

    // 等级角标（神将常显，普通塔 2 级起显示）
    if (this.isGeneral || this.level > 1) {
      const bx = this.x + half - 4, by = this.y - half + 4;
      ctx.fillStyle = this.isGeneral ? (CONFIG.rarityColors[this.def.rarity] || '#e8933c') : '#b8452e';
      ctx.beginPath(); ctx.arc(bx, by, tile * 0.16, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#f3ead6'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `900 ${Math.round(tile * 0.19)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(this.level), bx, by + 1);
    }
  }

  static colors = {
    bow: '#8a5a2e', spear: '#a84a3e', staff: '#7a4e86', camp: '#4e7a52',
  };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
