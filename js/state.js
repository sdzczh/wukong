/* 全局运行态 + 事件总线 */
'use strict';

const Bus = {
  _e: {},
  on(ev, fn) { (this._e[ev] = this._e[ev] || []).push(fn); return this; },
  emit(ev, a, b) { const l = this._e[ev]; if (l) l.slice().forEach(f => f(a, b)); },
};

/* 当前局数据（save.js 只管跨局持久化） */
const R = {
  state: 'menu',      // menu | battle | paused | over
  hearts: 10,
  heartsMax: 10,
  peaches: 0,
  wave: 0,
  kills: 0,
  crystalsEarned: 0,  // 本局结算魂晶
  summonsDone: 0,     // 累计召唤次数（召唤价递增）
  rack: [],           // 召唤架 5 格，元素 null | {type:'char'|'unit', ch?, lv?, unit?}
  draft: null,        // 本轮召唤选牌（数组），再召唤时旧的未选卡作废
  pityMiss: 0,        // 距上次神字的普通抽数
  armedSlot: -1,      // 点选后待放置的格子索引（-1 无）
  drag: null,         // {from:'rack'|'board', slot?, unit?} 拖拽中的来源
  enemies: [],
  towers: [],
  projectiles: [],
  tool: null,         // 当前工具（M2 起仅 'shovel'）
  selected: null,     // 选中的棋盘单位（Tower）
  hover: null,
  shovelLeft: 0,
  timeScale: 1,
};

function resetRun() {
  R.state = 'battle';
  R.heartsMax = Talents.heartsCap();
  R.hearts = Math.min(R.heartsMax, CONFIG.base.hearts + Talents.heartsBonus());
  R.peaches = CONFIG.economy.startPeaches + Talents.startPeachBonus();
  R.wave = 0;
  R.kills = 0;
  R.crystalsEarned = 0;
  R.codexBonus = 0;   // 本局图鉴解锁奖励魂晶
  R.summonsDone = 0;
  R.rack = new Array(CONFIG.summon.rackSize).fill(null);
  R.draft = null;
  R.pityMiss = 0;
  R.armedSlot = -1;
  R.drag = null;
  R.enemies = [];
  R.towers = [];
  R.projectiles = [];
  R.tool = null;
  R.selected = null;
  R.hover = null;
  R.shovelLeft = CONFIG.shovelUses;
  R.timeScale = 1;
  R.mightT = 0;        // 兵符全局加攻剩余秒数
  R.rangeFloor = 0;    // 当局射程地板（startRun 时按最远离径开放格校准）
  R.endless = false;   // 无尽征战模式（通关第 10 波后可选择进入）
  R.lastWin = false;   // 本局结算结果（图鉴/修炼返回结算页用）
}
