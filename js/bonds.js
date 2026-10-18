/* 羁绊系统：神将登场凑人数触发团队增益。
   两类：同阵营 3 人档（2/3 人两档强度）与跨阵营双人档（2 人一档）。
   Merge 增删神将时 Bonds.invalidate() 清缓存，下次读取时惰性重算；
   只有羁绊人数创下本局新高（2→3）才播报，换位/临时下塔不重复提示。 */
'use strict';

const Bonds = {
  _cache: null,       // {atk, rate, exp, cd, slow, peach, active:[...], all:[...]}
  _peak: {},          // 各羁绊历史最高人数（升档播报用）

  reset() { this._cache = null; this._peak = {}; },
  invalidate() { this._cache = null; },

  /* 当前场上神将 key 集合 */
  _fieldKeys() {
    const set = new Set();
    for (const t of R.towers) if (t.isGeneral) set.add(t.key);
    return set;
  },

  /* 计算羁绊加成并缓存 */
  bonus() {
    if (!this._cache) this._refresh();
    return this._cache;
  },

  /* 全羁绊状态（含未激活的进度），羁绊条渲染用 */
  status() { this.bonus(); return this._cache.all; },

  /* 数值文案：四系百分比 + 新轴（敌速降/击杀加桃） */
  fmt(v, stat) {
    if (stat === 'peach') return `+${v} 桃/击杀`;
    if (stat === 'slow') return `敌速 −${Math.round(v * 100)}%`;
    return `+${Math.round(v * 100)}%`;
  },

  _refresh() {
    const keys = this._fieldKeys();
    const out = { atk: 0, rate: 0, exp: 0, cd: 0, slow: 0, peach: 0, active: [], all: [] };
    for (const b of CONFIG.bonds) {
      let n = 0;
      for (const k of b.keys) if (keys.has(k)) n++;
      const need = b.keys.length;                 // 3 人档需 2/3，双人档需 2/2
      const on = n >= 2;
      const v = on ? b.tiers[Math.min(n, need) - 2] : 0;
      out.all.push({ name: b.name, color: b.color, count: n, need, on, stat: b.stat, v, desc: b.desc });
      if (on) {
        out[b.stat] += v;
        out.active.push({ name: b.name, color: b.color, count: n, stat: b.stat, v, desc: b.desc });
        if (n > (this._peak[b.name] || 0)) {
          this._peak[b.name] = n;
          HUD.toast(`羁绊 · ${b.name}（${n}人）${b.desc} ${this.fmt(v, b.stat)}`);
          SFX.play('levelup');
        }
      }
    }
    this._cache = out;
  },

  /* 供暂停面板/结算展示 */
  list() { return this.bonus().active; },
};
