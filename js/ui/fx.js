/* 特效：伤害飘字 / 弹道轨迹 / 挥击扇形 / 冲击环 */
const FX = {
  floats: [], tracers: [], arcs: [], rings: [],

  float(text, x, y, color, size) {
    this.floats.push({ text, x, y, life: 0.9, color: color || '#ffd867', size: size || 17 });
  },
  tracer(x, y, ang, len, color) {
    this.tracers.push({ x, y, ang, len, life: 0.16, color: color || '#e0905c' });
  },
  arc(x, y, r, a0, a1, color) {
    this.arcs.push({ x, y, r, a0, a1, life: 0.18, color: color || '#b98bc4' });
  },
  ring(x, y, r, color) {
    this.rings.push({ x, y, r, life: 0.4, color: color || '#ff6b81' });
  },

  update(dt) {
    for (const f of this.floats) { f.life -= dt; f.y -= 36 * dt; }
    this.floats = this.floats.filter(f => f.life > 0);
    for (const t of this.tracers) t.life -= dt;
    this.tracers = this.tracers.filter(t => t.life > 0);
    for (const a of this.arcs) a.life -= dt;
    this.arcs = this.arcs.filter(a => a.life > 0);
    for (const g of this.rings) { g.life -= dt; g.r += 40 * dt; }
    this.rings = this.rings.filter(g => g.life > 0);
  },

  draw(ctx) {
    for (const t of this.tracers) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, t.life / 0.16);
      ctx.strokeStyle = t.color; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(t.x, t.y);
      ctx.lineTo(t.x + Math.cos(t.ang) * t.len, t.y + Math.sin(t.ang) * t.len);
      ctx.stroke();
      ctx.restore();
    }
    for (const a of this.arcs) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, a.life / 0.18) * 0.8;
      ctx.strokeStyle = a.color; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(a.x, a.y, a.r, a.a0, a.a1); ctx.stroke();
      ctx.restore();
    }
    for (const g of this.rings) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, g.life / 0.4);
      ctx.strokeStyle = g.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    for (const f of this.floats) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, f.life / 0.45);
      const scale = f.life > 0.78 ? 1 + (f.life - 0.78) * 2.2 : 1;
      ctx.font = `900 ${Math.round(f.size * scale)}px "Ma Shan Zheng","Kaiti SC","STKaiti","KaiTi",serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 3; ctx.strokeStyle = '#00000088';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
  },
};
