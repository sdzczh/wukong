/* 瑶池祝福：备战期花桃买三项临时增益（回心/疾风/定身）。
   每波每项限购一次，价格随当局购买次数递增；过波自动失效（waveClear 清 R.blessWave）。 */
'use strict';

const BlessUI = {
  ids: ['heart', 'rate', 'slow'],
  meta: {
    heart: { name: '回心', sub: '立即 +1 心' },
    rate:  { name: '疾风', sub: '本波攻速 +25%' },
    slow:  { name: '定身', sub: '本波敌速 −40%' },
  },

  init() {
    this.bar = document.getElementById('bless-bar');
    if (!this.bar) return;
    this.bar.addEventListener('click', e => {
      const chip = e.target.closest('.bless-chip');
      if (chip) { SFX.ensure(); this.buy(chip.dataset.id); }
    });
  },

  /* 价格 = base + step × 当局已购数 */
  cost(id) {
    const def = CONFIG.peachSink.bless[id];
    return def.base + def.step * ((R.blessBuys && R.blessBuys[id]) || 0);
  },

  /* 备战期显示窗口：与提前叫波一致（含三选一弹窗期，买祝福不被挡）；
     召唤选牌条出现时让位，收起后自动回来 */
  canShow() {
    return R.state === 'battle' && !Director.cur && R.wave > 0
      && Director.intermission > 0 && (R.wave < CONFIG.waveCount || R.endless)
      && !(R.draft && R.draft.length);
  },

  refresh() {
    const bar = this.bar || document.getElementById('bless-bar');
    if (!bar) return;
    if (!this.canShow()) { bar.classList.add('hidden'); bar.innerHTML = ''; bar._html = ''; return; }
    // 底栏上方横排；装备栏打开时整条上抬到装备栏上方让位
    const gb = GearUI.open && GearUI.bar && !GearUI.bar.classList.contains('hidden')
      ? GearUI.bar.offsetHeight : 0;
    bar.style.bottom = (gb ? 156 + gb + 8 : 164) + 'px';
    // 首次出现给一次教学提示
    if (!R.blessTaught) { R.blessTaught = true; HUD.toast('蟠桃有处花：瑶池祝福每波限购一次'); }
    const html = this.ids.map(id => {
      const m = this.meta[id];
      const c = this.cost(id);
      const done = !!(R.blessWave && R.blessWave[id]);
      const fullHeart = id === 'heart' && R.hearts >= R.heartsMax;
      const poor = R.peaches < c;
      const cls = 'bless-chip' + (done ? ' bought' : '') + ((!done && (poor || fullHeart)) ? ' poor' : '');
      const price = done ? '已购' : `<b>${c}</b>桃`;
      const sub = done ? '本波已生效' : (fullHeart ? '心已满' : m.sub);
      return `<div class="${cls}" data-id="${id}">
        <span class="bc-name">${m.name}<span class="bc-price">${price}</span></span>
        <span class="bc-sub">${sub}</span>
      </div>`;
    }).join('');
    // 内容未变不重建 DOM，按住购买时不被高频刷新打断
    if (bar._html !== html) { bar.innerHTML = html; bar._html = html; }
    bar.classList.remove('hidden');
  },

  /* 购买：写 R.blessBuys（价格递增计数）+ R.blessWave（本波已购标记） */
  buy(id) {
    if (!this.canShow()) return false;
    if (R.blessWave && R.blessWave[id]) { HUD.toast('本波已买过这项祝福'); SFX.play('click'); return false; }
    if (id === 'heart' && R.hearts >= R.heartsMax) { HUD.toast('心已满'); SFX.play('click'); return false; }
    const c = this.cost(id);
    if (R.peaches < c) { HUD.toast('蟠桃不足'); SFX.play('click'); return false; }
    R.peaches -= c;
    R.blessBuys[id] = (R.blessBuys[id] || 0) + 1;
    R.blessWave[id] = true;
    if (id === 'heart') {
      R.hearts = Math.min(R.heartsMax, R.hearts + 1);
      FX.float('+1 心', 360, 200, '#e85858', 18);
    }
    SFX.play('talent');
    HUD.toast(id === 'heart' ? '瑶池回心 · +1 心'
      : (id === 'rate' ? '瑶池疾风 · 本波全员攻速 ×1.25' : '瑶池定身 · 本波敌速 ×0.6'));
    HUD.refresh();
    return true;
  },
};
