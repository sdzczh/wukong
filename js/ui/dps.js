/* 实时 DPS 面板：战斗中可开关的伤害排行（全程平均 DPS = 累计伤 / 交战时长） */
'use strict';

const DpsUI = {
  open: false, _iv: null,

  init() {
    this.el = document.getElementById('dps-panel');
    this.btn = document.getElementById('btn-dps');
    this.btn.addEventListener('click', () => { SFX.ensure(); SFX.play('click'); this.toggle(); });
  },

  toggle() {
    this.open = !this.open;
    this.el.classList.toggle('hidden', !this.open);
    this.btn.classList.toggle('on', this.open);
    if (this.open) { this.refresh(); this._start(); }
    else this._stop();
  },

  close() {
    if (!this.open) return;
    this.open = false;
    this.el.classList.add('hidden');
    this.btn.classList.remove('on');
    this._stop();
  },

  _start() { clearInterval(this._iv); this._iv = setInterval(() => this.refresh(), 500); },
  _stop() { clearInterval(this._iv); this._iv = null; },

  /* 排行数据：取伤害前 5 的塔（name/dmg 由 takeDamage 时维护） */
  rows() {
    const t = Math.max(0.5, R.battleTime || 0);
    return Object.values(R.dmgStats)
      .map(st => ({ name: st.name, color: st.color, dmg: st.dmg, dps: Math.round(st.dmg / t) }))
      .filter(r => r.dmg > 0)
      .sort((a, b) => b.dmg - a.dmg)
      .slice(0, 5);
  },

  refresh() {
    if (!this.open) return;
    const rows = this.rows();
    this.el.innerHTML = `<div class="dps-head">伤害榜${R.battleTime > 0 ? ' · 交战 ' + Math.round(R.battleTime) + 's' : ''}</div>` +
      (rows.length
        ? rows.map((r, i) =>
          `<div class="dps-row"><i>${i + 1}</i>` +
          `<b style="color:${r.color}">${r.name}</b>` +
          `<span>${r.dmg >= 10000 ? (r.dmg / 1000).toFixed(1) + 'k' : r.dmg}</span>` +
          `<em>${r.dps >= 10000 ? (r.dps / 1000).toFixed(1) + 'k' : r.dps}/s</em></div>`).join('')
        : '<div class="dps-empty">尚未造成伤害</div>');
  },
};
