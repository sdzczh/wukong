/* 局外成长：修炼天赋的等级查询与数值注入 */
'use strict';

const Talents = {
  lv(b) { return Save.data.talents[b] || 0; },

  /* 破棍：全体攻击加成（乘区） */
  atkBonus() {
    const l = this.lv('po');
    return l > 0 ? CONFIG.talents.po.nodes[l - 1].mul : 0;
  },

  /* 摘星 */
  summonDiscount() { const l = this.lv('zs'); return (l >= 1 ? 1 : 0) + (l >= 4 ? 2 : 0); },
  startPeachBonus() { return this.lv('zs') >= 2 ? 5 : 0; },
  godChanceBonus() { return this.lv('zs') >= 3 ? 0.02 : 0; },
  pityDelta() { return this.lv('zs') >= 5 ? 1 : 0; },

  /* 长生 */
  heartsBonus() { return [0, 1, 1, 3, 3, 6][this.lv('cs')]; },
  maxHeartsBonus() { return this.lv('cs') >= 5 ? 2 : 0; },
  enemySpeedMul() { const l = this.lv('cs'); return l >= 4 ? 0.92 : l >= 2 ? 0.97 : 1; },

  /* 齐天荣耀（隐藏） */
  gloryUnlocked() { return Save.data.wukongKills >= CONFIG.talents.glory.need; },
  gloryAtk() { return this.gloryUnlocked() ? 0.2 : 0; },
  gloryCdMul() { return this.gloryUnlocked() ? 0.8 : 1; },

  /* 心上限 = 基础 + 初始心加成 + 节点5额外上限 */
  heartsCap() { return CONFIG.base.hearts + this.heartsBonus() + this.maxHeartsBonus(); },

  /* 购买第 idx 节点（idx 0 起）；返回结果消息，null 表示成功 */
  buy(branch, idx) {
    const cur = this.lv(branch);
    if (idx !== cur) return idx < cur ? '已修习' : '需先修习前一节点';
    const cost = CONFIG.talents.costs[idx];
    if (Save.data.crystals < cost) return '魂晶不足';
    Save.data.crystals -= cost;
    Save.data.talents[branch] = cur + 1;
    Save.write();
    return null;
  },
};
