/* 特效：伤害飘字 / 弹道轨迹 / 挥击扇形 / 冲击环 / 火花
   攻击特效经 sweep/beam 统一入口：普通塔走默认样式，神将走 def.atkfx 数据样式 */
const FX = {
  floats: [], tracers: [], arcs: [], rings: [], sparks: [],

  float(text, x, y, color, size) {
    this.floats.push({ text, x, y, life: 0.9, color: color || '#ffd867', size: size || 17 });
  },
  tracer(x, y, ang, len, color, opts) {
    opts = opts || {};
    this.tracers.push({
      x, y, ang, len, life: opts.life || 0.16, color: color || '#e0905c',
      width: opts.width || 4, glow: opts.glow || 0,
    });
  },
  arc(x, y, r, a0, a1, color, opts) {
    opts = opts || {};
    this.arcs.push({
      x, y, r, a0, a1, life: opts.life || 0.18, color: color || '#b98bc4',
      width: opts.width || 7, glow: opts.glow || 0,
      alpha: opts.alpha != null ? opts.alpha : 0.8,
    });
  },
  ring(x, y, r, color, opts) {
    opts = opts || {};
    this.rings.push({
      x, y, r, life: opts.life || 0.4, color: color || '#ff6b81',
      width: opts.width || 3, grow: opts.grow || 40,
    });
  },
  spark(x, y, color, n) {
    for (let i = 0; i < (n || 6); i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 70;
      this.sparks.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20,
        life: 0.3, color: color || '#ffd867',
      });
    }
  },
  burst(x, y, color) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.tracers.push({ x, y, ang: a, len: 26 + (i % 3) * 10, life: 0.28, color: color || '#e8933c', width: 4, glow: 0 });
    }
    this.ring(x, y, 20, color || '#e8933c');
  },

  /* ---------- 统一攻击特效入口 ---------- */

  /* 挥击：默认紫色薄扇；atkfx.style='sweep' → 厚弧光 + 可选白芯/双段/落点冲击 */
  sweep(x, y, ang, tile, af, target) {
    af = af || {};
    if (af.style !== 'sweep') { this.arc(x, y, tile * 1.15, ang - 0.55, ang + 0.55, af.color || '#b98bc4'); return; }
    const r = tile * (af.r || 1.2);
    const w = af.width || 9;
    this.arc(x, y, r, ang - 0.75, ang + 0.75, af.color, { width: w, life: 0.2, glow: af.glow != null ? af.glow : 10, alpha: 0.9 });
    if (af.core) this.arc(x, y, r * 0.93, ang - 0.68, ang + 0.68, af.core, { width: Math.max(2, w * 0.35), life: 0.16, alpha: 0.85 });
    if (af.dual) this.arc(x, y, r * 0.78, ang + 0.4, ang + 1.2, af.core || af.color, { width: 5, life: 0.14, alpha: 0.7 });
    if (target) {
      if (af.impact === 'ring') this.ring(target.x, target.y, tile * 0.22, af.color, { life: 0.3, width: 4 });
      else if (af.impact === 'spark') this.spark(target.x, target.y, af.core || af.color, 7);
    }
  },

  /* 直刺光束：默认橙色 tracer；atkfx.style='beam' → 光柱 + 白芯 + 落点光晕 */
  beam(x, y, ang, len, af) {
    af = af || {};
    if (af.style !== 'beam') { this.tracer(x, y, ang, len, af.color || '#e0905c'); return; }
    this.tracer(x, y, ang, len, af.color, { width: af.width || 5, glow: af.glow != null ? af.glow : 12, life: 0.2 });
    if (af.core) this.tracer(x, y, ang, len * 0.96, af.core, { width: Math.max(2, (af.width || 5) * 0.35), life: 0.16 });
    if (af.cap !== false) {
      const ex = x + Math.cos(ang) * len * 0.92;
      const ey = y + Math.sin(ang) * len * 0.92;
      this.ring(ex, ey, 9, af.color, { life: 0.25, width: 3, grow: 26 });
    }
  },

  update(dt) {
    for (const f of this.floats) { f.life -= dt; f.y -= 36 * dt; }
    this.floats = this.floats.filter(f => f.life > 0);
    for (const t of this.tracers) t.life -= dt;
    this.tracers = this.tracers.filter(t => t.life > 0);
    for (const a of this.arcs) a.life -= dt;
    this.arcs = this.arcs.filter(a => a.life > 0);
    for (const g of this.rings) { g.life -= dt; g.r += g.grow * dt; }
    this.rings = this.rings.filter(g => g.life > 0);
    for (const s of this.sparks) { s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 90 * dt; }
    this.sparks = this.sparks.filter(s => s.life > 0);
  },

  draw(ctx) {
    for (const t of this.tracers) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, Math.max(0, t.life / 0.16));
      ctx.strokeStyle = t.color; ctx.lineWidth = t.width; ctx.lineCap = 'round';
      if (t.glow) { ctx.shadowColor = t.color; ctx.shadowBlur = t.glow; }
      ctx.beginPath(); ctx.moveTo(t.x, t.y);
      ctx.lineTo(t.x + Math.cos(t.ang) * t.len, t.y + Math.sin(t.ang) * t.len);
      ctx.stroke();
      ctx.restore();
    }
    for (const a of this.arcs) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, Math.max(0, a.life / 0.18)) * a.alpha;
      ctx.strokeStyle = a.color; ctx.lineWidth = a.width; ctx.lineCap = 'round';
      if (a.glow) { ctx.shadowColor = a.color; ctx.shadowBlur = a.glow; }
      ctx.beginPath(); ctx.arc(a.x, a.y, a.r, a.a0, a.a1); ctx.stroke();
      ctx.restore();
    }
    for (const g of this.rings) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, Math.max(0, g.life / 0.4));
      ctx.strokeStyle = g.color; ctx.lineWidth = g.width;
      ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    for (const s of this.sparks) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, Math.max(0, s.life / 0.3)) * 0.9;
      ctx.fillStyle = s.color;
      ctx.beginPath(); ctx.arc(s.x, s.y, 2.2, 0, Math.PI * 2); ctx.fill();
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
