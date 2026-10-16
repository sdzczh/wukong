/* 弹道：追踪箭矢（普通塔默认箭簇；神将经 atkfx 走专属形态/拖尾/落点特效） */
class Projectile {
  constructor(x, y, target, dmg, opts) {
    opts = opts || {};
    this.x = x; this.y = y;
    this.target = target; this.dmg = dmg;
    this.src = opts.src || null;          // 伤害归属（神将经验）
    this.speed = (opts.speed || 9) * Grid.tile;
    this.color = opts.color || '#e8c268';
    this.size = opts.size || 4;
    this.shape = opts.shape || 'bolt';    // bolt 箭簇 | spear 火尖 | drop 水珠 | crescent 双刃 | petal 花瓣 | ink 墨团 | moon 月牙
    this.glow = opts.glow != null ? opts.glow : 6;
    this.trail = opts.trail || null;      // 拖尾颜色
    this.impact = !!opts.impact;          // 命中：小冲击环 + 火花
    this.oh = opts.oh || null;            // 命中附加包：染毒/减速/削甲/溅射（腐蛊/霜华）
    this.trailT = 0;
    this.spin = 0;
    this.dead = false;
    this.tx = x; this.ty = y; this.ang = 0;
  }

  update(dt) {
    if (this.target && this.target.alive) { this.tx = this.target.x; this.ty = this.target.y; }
    const dx = this.tx - this.x, dy = this.ty - this.y;
    const d = Math.hypot(dx, dy);
    const step = this.speed * dt;
    if (d <= Math.max(step, 7)) {
      if (this.target && this.target.alive) {
        if (this.oh) Tower.applyOnHit(this.oh, this.target, this.dmg);   // 附加先于伤害：削甲本击即生效
        this.target.takeDamage(this.dmg, this.src);
        SFX.play('hit');
        if (this.impact) {
          FX.ring(this.x, this.y, 11, this.color, { life: 0.26, width: 3, grow: 30 });
          FX.spark(this.x, this.y, this.color, 5);
        }
      }
      this.dead = true;
      return;
    }
    this.ang = Math.atan2(dy, dx);
    this.x += dx / d * step;
    this.y += dy / d * step;
    this.spin += dt * 7;
    if (this.trail) {
      this.trailT -= dt;
      if (this.trailT <= 0) {
        this.trailT = 0.045;
        FX.tracer(this.x, this.y, this.ang + Math.PI, this.size * 2, this.trail, { life: 0.22, width: this.size * 0.9, glow: 4 });
      }
    }
  }

  draw(ctx) {
    const s = this.size;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.shape === 'petal' ? this.ang + this.spin * 0.5 : this.ang);
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color; ctx.shadowBlur = this.glow;
    switch (this.shape) {
      case 'spear': {   // 火尖枪：长杆 + 大枪头
        ctx.lineWidth = s * 0.7; ctx.strokeStyle = this.color;
        ctx.beginPath(); ctx.moveTo(-s * 2.8, 0); ctx.lineTo(s * 0.4, 0); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(s * 2.4, 0);
        ctx.lineTo(-s * 0.4, s * 1.1);
        ctx.lineTo(0, 0);
        ctx.lineTo(-s * 0.4, -s * 1.1);
        ctx.closePath(); ctx.fill();
        break;
      }
      case 'drop': {    // 水珠：前圆后尖
        ctx.beginPath();
        ctx.moveTo(s * 2.2, 0);
        ctx.quadraticCurveTo(s * 0.4, s * 1.3, -s * 1.6, 0);
        ctx.quadraticCurveTo(s * 0.4, -s * 1.3, s * 2.2, 0);
        ctx.closePath(); ctx.fill();
        break;
      }
      case 'crescent': {   // 双刃：两片并行薄刀
        for (const off of [-s * 0.8, s * 0.8]) {
          ctx.beginPath();
          ctx.moveTo(s * 2, off * 0.3);
          ctx.quadraticCurveTo(0, off * 1.6, -s * 1.6, off * 0.5);
          ctx.quadraticCurveTo(0, off * 1.0, s * 2, off * 0.3);
          ctx.closePath(); ctx.fill();
        }
        break;
      }
      case 'petal': {   // 花瓣：细长椭圆
        ctx.beginPath(); ctx.ellipse(0, 0, s * 1.7, s * 0.75, 0, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'ink': {     // 墨团：软边圆斑 + 小尾点
        ctx.beginPath(); ctx.arc(s * 0.3, 0, s * 1.15, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.6;
        ctx.beginPath(); ctx.arc(-s * 1.6, 0, s * 0.45, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'moon': {    // 月牙：双弧咬合成弯月
        ctx.beginPath();
        ctx.arc(0, 0, s * 1.5, Math.PI * 0.35, Math.PI * 1.65);
        ctx.arc(s * 0.85, 0, s * 1.2, Math.PI * 1.65, Math.PI * 0.35, true);
        ctx.closePath(); ctx.fill();
        break;
      }
      default: {        // bolt：原箭簇
        ctx.beginPath();
        ctx.moveTo(s * 1.8, 0);
        ctx.lineTo(-s, s * 0.7);
        ctx.lineTo(-s * 0.4, 0);
        ctx.lineTo(-s, -s * 0.7);
        ctx.closePath(); ctx.fill();
      }
    }
    ctx.restore();
  }
}
