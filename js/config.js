/* ============================================================
 * 无敌悟空 · 全部可调数值（调平衡只改这里）
 * ============================================================ */
const CONFIG = {
  logicalW: 720, logicalH: 1280,
  hudTopH: 92, hudBottomH: 152,

  board: { cols: 9, rows: 13, riverRows: [5, 6, 7], bridgeRow: 6 },
  // 路径拐点（格坐标）：鬼门关 → 左廊下桥 → 奈何桥横穿 → 右廊至轮回殿
  pathCells: [[0, 0], [0, 6], [8, 6], [8, 12]],
  base: { col: 8, row: 12, hearts: 10 },

  economy: {
    startPeaches: 10,
    summonBase: 12, summonStep: 2,   // M2 启用：召唤费 = base + step×已召唤次数
    killRewardBase: 1,
    waveRewardBase: 5,               // 过波奖 = base + 波次
    sellRefund: 4,
  },
  shovelUses: 2,
  towerCap: 24,

  // 普通字塔（Lv1 基准；每级攻击 +40%、射程 +0.15 格）
  towers: {
    bow:   { char: '弓', name: '木弓', atk: 10, rate: 1.1, range: 3.5, kind: 'arrow',
             desc: '远程点杀，优先攻击最接近基地的敌人' },
    spear: { char: '枪', name: '长枪', atk: 18, rate: 0.7, range: 2.8, kind: 'pierce', pierce: 3,
             desc: '穿刺：攻击贯穿直线上至多 3 个敌人' },
    staff: { char: '棍', name: '铁棍', atk: 12, rate: 1.2, range: 1.6, kind: 'cleave', cleave: 3,
             desc: '横扫：攻击目标及相邻 2 个敌人' },
    camp:  { char: '营', name: '战营', atk: 0, rate: 0, range: 1.5, kind: 'aura', auraRate: 0.15,
             desc: '战鼓：周围 1 格友塔攻速 +15%（自身不攻击）' },
  },
  towerLevelMul: { atk: 0.4, range: 0.15 },
  towerMaxLevel: 5,

  // 敌人（魂系）
  enemies: {
    ghost:  { char: '魂', name: '幽魂', hp: 20,  speed: 0.9, reward: 1,  dmg: 1, size: 0.62, color: '#8d97b8' },
    wraith: { char: '怨', name: '怨魂', hp: 14,  speed: 1.6, reward: 1,  dmg: 1, size: 0.56, color: '#5cc0a8' },
    brute:  { char: '厉', name: '厉魂', hp: 70,  speed: 0.7, reward: 2,  dmg: 1, size: 0.70, color: '#c05a72', armor: 3 },
    swarm:  { char: '游', name: '游魂', hp: 8,   speed: 1.3, reward: 1,  dmg: 1, size: 0.46, color: '#9aa3b8' },
    boss:   { char: '鬼', name: '鬼将', hp: 600, speed: 0.5, reward: 15, dmg: 3, size: 0.98, color: '#a03448', armor: 2 },
  },
  waveCount: 10,
  waveHpGrowth: 1.12,
  waveIntermission: 6,   // 波间备战秒数
};

/* 波次表：n=波次；刷怪事件 {t, type}；hpMul 血量倍率 */
function buildWaves() {
  const waves = [];
  for (let n = 1; n <= CONFIG.waveCount; n++) {
    const list = [];
    const isBoss = n % 5 === 0;
    const count = 5 + 3 * n;
    for (let i = 0; i < count; i++) {
      let type = 'ghost';
      const r = RNG.next();
      if (n >= 4 && r < 0.18) type = 'swarm';
      else if (n >= 3 && r < 0.38) type = 'brute';
      else if (n >= 2 && r < 0.62) type = 'wraith';
      list.push({ t: 2 + i * 1.1, type });
    }
    if (isBoss) list.push({ t: 2 + count * 1.1 + 2, type: 'boss' });
    waves.push({ n, hpMul: Math.pow(CONFIG.waveHpGrowth, n - 1), spawns: list });
  }
  return waves;
}
