/* 敌人：沿路径移动的魂系单位 */
class Enemy {
  constructor(type, hpMul) {
    const d = CONFIG.enemies[type];
    this.type = type; this.def = d;
    this.maxHp = Math.round(d.hp * hpMul);
    this.hp = this.maxHp;
    this.s = 0; this.alive = true; this.leaked = false;
    this.stun = 0; this.slowT = 0; this.slowF = 1; this.flash = 0;
    this.x = 0; this.y = 0; this.angle = 0;
    this.wobble = RNG.next() * Math.PI * 2;
    this.pos();
  }

  get speedPx() { return this.def.speed * Grid.tile * Talents.enemySpeedMul(); }

  pos() {
    const p = Grid.posAt(this.s);
    this.x = p.x; this.y = p.y; this.angle = p.angle;
  }

  update(dt) {
    if (!this.alive) return;
    if (this.flash > 0) this.flash -= dt;
    // 生死簿：3 秒后斩杀
    if (this.deathMark) {
      this.deathMark.t -= dt;
      if (this.deathMark.t <= 0) {
        const src = this.deathMark.src;
        this.deathMark = null;
        this.takeDamage(99999, src);
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
    const eff = Math.max(1, dmg - (this.def.armor || 0));
    this.hp -= eff; this.flash = 0.12;
    if (src) this.lastHitBy = src;   // 记录伤害归属（神将吃经验）
    FX.float(String(eff), this.x, this.y - Grid.tile * 0.5, '#ffe9a8', 15);
    if (this.hp <= 0) { this.alive = false; Bus.emit('enemyKilled', this); }
  }

  applyStun(t) { this.stun = Math.max(this.stun, t); }
  applySlow(factor, t) { this.slowF = Math.min(this.slowF, factor); this.slowT = Math.max(this.slowT, t); }

  draw(ctx, now) {
    const tile = Grid.tile;
    const size = tile * this.def.size;
    const bob = Math.sin(now * 4.5 + this.wobble) * tile * 0.04;

    // 影
    ctx.save();
    ctx.fillStyle = '#00000055';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + size * 0.42, size * 0.42, size * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();

    // 字
    ctx.font = `900 ${Math.round(size)}px "Ma Shan Zheng","Kaiti SC","STKaiti","KaiTi",serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4; ctx.strokeStyle = '#12101ccc';
    ctx.strokeText(this.def.char, this.x, this.y + bob);
    ctx.fillStyle = this.flash > 0 ? '#ffffff' : this.def.color;
    ctx.fillText(this.def.char, this.x, this.y + bob);

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

    // 血条
    if (this.hp < this.maxHp) {
      const w = size * 1.05, h = 5;
      const bx = this.x - w / 2, by = this.y - size * 0.68;
      ctx.fillStyle = '#000000aa';
      ctx.fillRect(bx - 1, by - 1, w + 2, h + 2);
      const ratio = Math.max(0, this.hp / this.maxHp);
      ctx.fillStyle = ratio > 0.5 ? '#6fe06f' : ratio > 0.25 ? '#ffb84c' : '#ff5f6b';
      ctx.fillRect(bx, by, w * ratio, h);
    }
    ctx.restore();
  }
}
