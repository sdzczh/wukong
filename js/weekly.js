/* 每周异变：以 ISO 周（yyyy + 周序）为种子，整周同一地图 + 3 条全局规则。
   用独立 LCG 抽规则，不扰动对局自身的 RNG 流。 */
'use strict';

const Weekly = {
  /* 本周 key：yyyy * 100 + 周序（1-53），越界周归到周边（周四为界） */
  key(d) {
    d = d || new Date();
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = (t.getUTCDay() + 6) % 7;            // 周一=0
    t.setUTCDate(t.getUTCDate() - dayNum + 3);         // 到本周四
    const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
    const fDay = (firstThu.getUTCDay() + 6) % 7;
    firstThu.setUTCDate(firstThu.getUTCDate() - fDay + 3);
    const wk = 1 + Math.round((t - firstThu) / (7 * 24 * 3600 * 1000));
    return t.getUTCFullYear() * 100 + wk;
  },

  /* 本周抽出的 3 条规则（纯函数，同 key 恒同结果） */
  picksFor(key) {
    let s = (key * 2654435761) >>> 0;
    const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const pool = CONFIG.weekly.pool.slice();
    const picks = [];
    const n = Math.min(CONFIG.weekly.pick, pool.length);
    for (let i = 0; i < n; i++) {
      const j = Math.floor(rand() * pool.length);
      picks.push(pool.splice(j, 1)[0]);
    }
    return picks;
  },

  /* 生成每周异变局的对局种子（纯数字，与每日的 yyyymmdd 区分且不冲突） */
  seedKey() { return this.key(); },

  /* 把本周规则并入 R.rules（在 resetRun 之后调用） */
  apply() {
    const picks = this.picksFor(this.key());
    R.weekly = picks;
    R.rules.weeklyNames = picks.map(p => p.name);
    for (const p of picks) {
      for (const k in p.rule) {
        if (k === 'summonCostDelta') R.rules.summonCostDelta += p.rule[k];
        else if (k === 'shovelDelta') R.rules.shovelDelta += p.rule[k];
        else if (k === 'godChanceAdd') R.rules.godChanceAdd += p.rule[k];
        else R.rules[k] *= p.rule[k];
      }
    }
    // 开局修正类立即生效
    R.shovelLeft += R.rules.shovelDelta;
  },

  /* 展示用一句话（菜单里显示本周规则） */
  summary() {
    const picks = this.picksFor(this.key());
    return picks.map(p => p.name).join(' · ');
  },
};
