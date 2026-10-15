/* 事件总线 + 一局运行的全局状态 */
const Bus = {
  map: {},
  on(ev, fn) { (this.map[ev] = this.map[ev] || []).push(fn); },
  emit(ev, a, b) { (this.map[ev] || []).forEach(fn => fn(a, b)); },
};

const R = {
  state: 'menu',            // menu | battle | paused | over
  hearts: CONFIG.base.hearts,
  peaches: CONFIG.economy.startPeaches,
  wave: 0,
  kills: 0,
  crystalsEarned: 0,
  summonsDone: 0,           // M2
  enemies: [], towers: [], projectiles: [],
  tool: null,               // 当前摆放工具（塔 key）
  selected: null,           // 选中的塔
  hover: null,              // 指针悬停的格子 {c, r, x, y}
  shovelLeft: CONFIG.shovelUses,
  timeScale: 1,
};

function resetRun() {
  R.hearts = CONFIG.base.hearts;
  R.peaches = CONFIG.economy.startPeaches;
  R.wave = 0; R.kills = 0; R.crystalsEarned = 0; R.summonsDone = 0;
  R.enemies = []; R.towers = []; R.projectiles = [];
  R.tool = null; R.selected = null; R.shovelLeft = CONFIG.shovelUses;
  Grid.resetTowers();
  Director.reset();
  HUD.refresh();
}
