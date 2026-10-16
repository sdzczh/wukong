/* 羁绊系统：同阵营神将登场 2/3 名触发团队增益（攻击/攻速/经验/技冷却）。
   Merge 增删神将时 Bonds.invalidate() 清缓存，下次读取时惰性重算；
   只有羁绊人数创下本局新高（2→3）才播报，换位/临时下塔不重复提示。 */
'use strict';

const Bonds = {
  _cache: null,       // {atk, rate, exp, cd, active:[...]}
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

  _refresh() {
    const keys = this._fieldKeys();
    const out = { atk: 0, rate: 0, exp: 0, cd: 0, active: [] };
    for (const b of CONFIG.bonds) {
      let n = 0;
      for (const k of b.keys) if (keys.has(k)) n++;
      if (n >= 2) {
        const v = b.tiers[n >= 3 ? 1 : 0];
        out[b.stat] += v;
        out.active.push({ name: b.name, color: b.color, count: n, stat: b.stat, v, desc: b.desc });
        if (n > (this._peak[b.name] || 0)) {
          this._peak[b.name] = n;
          HUD.toast(`羁绊 · ${b.name}（${n}人）${b.desc} +${Math.round(v * 100)}%`);
          SFX.play('levelup');
        }
      }
    }
    this._cache = out;
  },

  /* 供暂停面板/结算展示 */
  list() { return this.bonus().active; },
};
