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
  daily: null,        // 每日轮回的日期种子（普通局为 null）
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
  parts: null,        // 装备部件计数 {feng,ji,yuan,ling}（resetRun 初始化）
  equips: null,       // 未佩戴装备库存 [{fam,lv}]
  gearArm: -1,        // 待佩戴的库存装备索引（-1 无）：点塔即佩戴
  sigRun: 0,          // 本局专属碎片收获数（结算展示）
  runKind: 'normal',  // 本局类型：normal | daily | weekly
  mods: null,         // 波间词条累计 {atk,rate,peach,interest,exp,aura,cd,sell}（resetRun 初始化）
  modOffer: null,     // 待选词条（3 个 id），非 null 时暂停开波
  shovelBuys: 0,      // 当局花桃补铲数（补铲价递增）
  blessBuys: null,    // 当局瑶池祝福已购数 {heart,rate,slow}（价格递增）
  blessWave: null,    // 本波祝福/已购标记 {heart,rate,slow}；过波清空
  blessTaught: false, // 本局是否已提示过瑶池祝福
  shovelTaught: false,// 本局是否已提示过补铲
  weekly: null,       // 每周异变生效的规则名列表（展示用）
  rules: null,        // 本局全局规则倍率（newRules 初始化）
  dmgStats: null,     // 每塔伤害统计 {towerId: {name, dmg, color}}
  nextTowerId: 1,     // 塔唯一 id 计数
};

function newMods() { return { atk: 0, rate: 0, peach: 0, interest: 0, exp: 0, aura: 0, cd: 0, sell: 0, latk: 0, lrate: 0, lslow: 0, lgold: 0 }; }
function newRules() {
  return {
    enemyHpMul: 1, enemySpdMul: 1, peachAwardMul: 1, summonCostDelta: 0,
    interestMul: 1, expMul: 1, shovelDelta: 0, godChanceAdd: 0,
    weeklyNames: [],
  };
}

function resetRun() {
  R.state = 'battle';
  R.runId = (R.runId || 0) + 1;   // 本局标识（榜单上传结果与结算页对齐）
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
  R.daily = null;
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
  R.timeScale = (Save.data && Save.data.speed) || 1;   // 速度偏好沿用（HUD 可 1/2/3/4 循环）
  R.mightT = 0;        // 兵符全局加攻剩余秒数
  R.rangeFloor = 0;    // 当局射程地板（startRun 时按最远离径开放格校准）
  R.endless = false;   // 无尽征战模式（通关第 10 波后可选择进入）
  R.lastWin = false;   // 本局结算结果（图鉴/修炼返回结算页用）
  R.parts = { feng: 0, ji: 0, yuan: 0, ling: 0 };
  R.equips = [];
  R.gearArm = -1;
  R.sigRun = 0;
  R.runKind = 'normal';
  R.mods = newMods();
  R.modOffer = null;
  R.shovelBuys = 0;
  R.blessBuys = { heart: 0, rate: 0, slow: 0 };
  R.blessWave = {};
  R.blessTaught = false;
  R.shovelTaught = false;
  R.rules = newRules();
  R.weekly = null;
  R.dmgStats = {};     // 每塔伤害统计 {towerId: dmg}（resetRun 初始化）
  R.battleTime = 0;    // 交战累计秒（开波计时，波间不计，DPS 面板用）
  R.ghosts = null;     // 上局阵容占位建议 [{c,r,ch,god,lv}]（首波备战期显示）
  R.nextTowerId = 1;
  if (typeof Bonds !== 'undefined' && Bonds.reset) Bonds.reset();
}
