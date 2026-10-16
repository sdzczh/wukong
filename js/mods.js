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

  /* 抽取 3 张不重复词条并弹出 */
  offer() {
    const pool = CONFIG.waveMods.pool.slice();
    const picks = [];
    const n = Math.min(CONFIG.waveMods.pick || 3, pool.length);
    for (let i = 0; i < n; i++) {
      const j = RNG.int(pool.length);
      picks.push(pool.splice(j, 1)[0].id);
    }
    R.modOffer = picks;
    this.render();
    SFX.play('god');
    HUD.toast('命运三选一 · 选择一条词条');
  },

  render() {
    const bar = document.getElementById('mod-bar');
    if (!bar) return;
    if (!R.modOffer) { bar.classList.remove('show'); bar.innerHTML = ''; return; }
    const cards = R.modOffer.map((id, i) => {
      const def = CONFIG.waveMods.pool.find(p => p.id === id);
      const stacked = R.mods[id] || 0;
      // 心/铲是即时结算不叠加；其余词条显示「选后层数」
      const stackTxt = (stacked > 0 && id !== 'heart' && id !== 'shovel')
        ? `<span class="mod-stack">再选 ×${stacked + 1}</span>` : '';
      return `<div class="mod-card" data-i="${i}">
        <div class="mod-name">${def.name}</div>
        <div class="mod-desc">${def.desc}</div>
        ${stackTxt}
      </div>`;
    }).join('');
    bar.innerHTML = `<div class="mod-title">命运三选一</div><div class="mod-cards">${cards}</div>`;
    bar.classList.add('show');
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
    } else {
      R.mods[id] = (R.mods[id] || 0) + 1;
    }
    SFX.play('talent');
  },
};
