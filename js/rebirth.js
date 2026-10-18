/* 转生轮回：局外永久增益层（3.0）。
   历史最高波次达门槛（含无尽）+ 消耗魂晶 → 转入下一世：
   每世结算魂晶 +15%、神将击杀经验 +10%、开局蟠桃 +2，逐层叠加、永世随行。
   入口：主菜单「转生轮回」面板 / 结算页达标时直达。 */
'use strict';

const Rebirth = {
  layers() { const rb = Save.data.rebirth; return (rb && rb.layers) || 0; },
  maxed() { return this.layers() >= CONFIG.rebirth.max; },
  need() { return CONFIG.rebirth.needBase + CONFIG.rebirth.needStep * this.layers(); },
  cost() { return CONFIG.rebirth.costBase + CONFIG.rebirth.costStep * this.layers(); },
  /* 门槛统一看历史最高波次（结算时 bestWave 已先更新，故结算页同此判定；讨伐不计波次不参与） */
  can() { return !this.maxed() && Save.data.bestWave >= this.need(); },

  crystalMul() { return 1 + this.layers() * CONFIG.rebirth.crystalStep; },
  expBonus() { return this.layers() * CONFIG.rebirth.expStep; },
  peachBonus() { return this.layers() * CONFIG.rebirth.peachStep; },

  /* 执行转生：扣魂晶 + 世数 +1（两步确认在调用方面板里做） */
  doRebirth() {
    if (this.maxed()) { HUD.toast('十世圆满 · 已至轮回尽头'); return false; }
    if (Save.data.bestWave < this.need()) {
      HUD.toast(`需历史最高波次达 ${this.need()} 才可转生（当前 ${Save.data.bestWave}）`);
      return false;
    }
    const cost = this.cost();
    if (Save.data.crystals < cost) { HUD.toast(`魂晶不足（需 ${cost}，现有 ${Save.data.crystals}）`); return false; }
    Save.data.crystals -= cost;
    Save.data.rebirth.layers++;
    Save.write();
    SFX.play('levelup');
    const c = CONFIG.rebirth;
    HUD.toast(`转生第 ${this.layers()} 世：魂晶结算 +${Math.round(this.layers() * c.crystalStep * 100)}% · 神将经验 +${Math.round(this.layers() * c.expStep * 100)}% · 开局蟠桃 +${this.layers() * c.peachStep}`);
    if (typeof Ach !== 'undefined') Ach.check();
    return true;
  },
};
