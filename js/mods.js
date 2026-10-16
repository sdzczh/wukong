/* 波间命运三选一：每 CONFIG.waveMods.every 波过波后弹出 3 张随机词条，
   点选 1 张永久叠加（心/铲为即时结算）。选牌期间不开下一波。 */
'use strict';

const WaveMods = {
  init() {
    const bar = document.getElementById('mod-bar');
    if (!bar) return;
    bar.addEventListener('click', (e) => {
      const card = e.target.closest('.mod-card');
      if (!card || !R.modOffer) return;
      this.pick(+card.dataset.i);
    });
  },

  /* 抽取 3 张不重复词条并弹出；约 5% 概率有一张被传说词条顶替 */
  offer() {
    const pool = CONFIG.waveMods.pool.slice();
    const picks = [];
    const n = Math.min(CONFIG.waveMods.pick || 3, pool.length);
    for (let i = 0; i < n; i++) {
      const j = RNG.int(pool.length);
      picks.push(pool.splice(j, 1)[0].id);
    }
    // 传说降临：整次三选一掷一次，命中则随机顶替一张（不与已给词条重复）
    const lp = CONFIG.waveMods.legendPool || [];
    if (lp.length && RNG.next() < (CONFIG.waveMods.legendChance || 0)) {
      const cand = lp.filter(l => !picks.includes(l.id));
      if (cand.length) picks[RNG.int(picks.length)] = cand[RNG.int(cand.length)].id;
    }
    R.modOffer = picks;
    this.render();
    SFX.play('god');
    HUD.toast('命运三选一 · 选择一条词条');
  },

  /* 显隐统一走 .hidden（弹层初始自带 hidden，add('show') 会被 .hidden!important 压死） */
  render() {
    const bar = document.getElementById('mod-bar');
    if (!bar) return;
    if (!R.modOffer) { bar.classList.add('hidden'); bar.innerHTML = ''; return; }
    const legendIds = new Set((CONFIG.waveMods.legendPool || []).map(l => l.id));
    const cards = R.modOffer.map((id, i) => {
      const def = (CONFIG.waveMods.legendPool || []).find(p => p.id === id)
        || CONFIG.waveMods.pool.find(p => p.id === id);
      const stacked = R.mods[id] || 0;
      const isLegend = legendIds.has(id);
      // 心/铲是即时结算不叠加；其余词条显示「选后层数」
      const stackTxt = (stacked > 0 && id !== 'heart' && id !== 'shovel')
        ? `<span class="mod-stack">再选 ×${stacked + 1}</span>` : '';
      return `<div class="mod-card${isLegend ? ' legend' : ''}" data-i="${i}">
        ${isLegend ? '<span class="mod-legend">传说</span>' : ''}
        <div class="mod-name">${def.name}</div>
        <div class="mod-desc">${def.desc}</div>
        ${stackTxt}
      </div>`;
    }).join('');
    bar.innerHTML = `<div class="mod-title">命运三选一</div><div class="mod-cards">${cards}</div>`;
    bar.classList.remove('hidden');
  },

  /* 选中第 i 张：应用并关闭；返回是否成功 */
  pick(i) {
    if (!R.modOffer || !R.modOffer[i]) return false;
    const id = R.modOffer[i];
    this.apply(id);
    R.modOffer = null;
    this.render();
    Bus.emit('modPicked', id);
    return true;
  },

  apply(id) {
    if (id === 'heart') {
      R.hearts = Math.min(R.heartsMax, R.hearts + 2);
      FX.float('+2 心', 360, 200, '#e85858', 18);
    } else if (id === 'shovel') {
      R.shovelLeft += 2;
      HUD.toast('拓荒 +2 铲');
    } else if (id === 'lheart') {
      R.heartsMax += 3;
      R.hearts += 5;
      FX.float('+5 心 上限+3', 360, 200, '#ff9a5a', 18);
    } else {
      R.mods[id] = (R.mods[id] || 0) + 1;
    }
    SFX.play('talent');
  },
};
