/* 弹道：追踪箭矢 */
class Projectile {
  constructor(x, y, target, dmg, opts) {
    opts = opts || {};
    this.x = x; this.y = y;
    this.target = target; this.dmg = dmg;
    this.src = opts.src || null;          // 伤害归属（神将经验）
    this.speed = (opts.speed || 9) * Grid.tile;
    this.color = opts.color || '#e8c268';
    this.size = opts.size || 4;
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
        this.target.takeDamage(this.dmg, this.src);
        SFX.play('hit');
      }
      this.dead = true;
      return;
    }
    this.ang = Math.atan2(dy, dx);
    this.x += dx / d * step;
    this.y += dy / d * step;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.ang);
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color; ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(this.size * 1.8, 0);
    ctx.lineTo(-this.size, this.size * 0.7);
    ctx.lineTo(-this.size * 0.4, 0);
    ctx.lineTo(-this.size, -this.size * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
