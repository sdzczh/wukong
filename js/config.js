/* ============================================================
 * 无敌悟空 · 全部可调数值（调平衡只改这里）
 * ============================================================ */
const CONFIG = {
  logicalW: 720, logicalH: 1280,
  hudTopH: 92, hudBottomH: 152,

  board: { cols: 9, rows: 13, riverRows: [5, 6, 7], bridgeRow: 6 },
  // 地块开垦：开局仅开放奈何桥两侧 ±openBand 行（bridgeRow-2 / +2），
  // 其余「封」字地块需用铲子开垦；铲子也可铲塔回架
  field: { openBand: 2 },
  // 路径拐点（格坐标）：鬼门关 → 左廊下桥 → 奈何桥横穿 → 右廊至轮回殿
  pathCells: [[0, 0], [0, 6], [8, 6], [8, 12]],
  base: { col: 8, row: 12, hearts: 10 },

  economy: {
    startPeaches: 12,
    killRewardBase: 1,
    waveRewardBase: 6,               // 过波奖 = base + 波次
    sellRefund: 4,                   // 出售字塔返还（神将另加 4×等级）
  },

  // 召唤（抽字）
  summon: {
    base: 9, step: 1,                // 费用 = base + step × 已召唤次数
    godChance: 0.24,                 // 神将字概率
    pityAfter: 4,                    // 连续 N 抽普通字后必出神将字
    startChars: 4,                   // 开局免费发字
    rackSize: 5,
  },

  shovelUses: 10,
  towerCap: 24,

  /* 灵宝掉落（击杀概率掉落，自动拾取） */
  drops: {
    chance: 0.03, bossChance: 1,
    mightMul: 1.2, mightDur: 15,   // 兵符：全体攻击 +
    mightPeach: 8,                 // 桃袋
    mightHeart: 1,                 // 轮回符
  },

  // 普通字 → 塔 key
  charToTower: { '枪': 'spear', '棍': 'staff', '弓': 'bow', '营': 'camp' },
  // 抽字权重（普通字合计 76，神将字合计权重 42）
  normalCharWeights: { '枪': 20, '棍': 16, '弓': 20, '营': 20 },
  godCharWeights: {
    '悟': 3, '空': 2, '能': 3, '净': 3, '哪': 2, '吒': 3,
    '金': 3, '木': 3, '杨': 2, '戬': 2, '王': 3, '母': 2,
    '阎': 1, '玉': 1, '帝': 1, '嫦': 2, '娥': 2, '李': 2, '靖': 2,
  },
  // 神将字对 → 神将 key（key 为 CONFIG.towers 中的神将名）
  pairs: {
    '悟空': 'wukong', '悟能': 'wuneng', '悟净': 'wujing', '哪吒': 'nezha',
    '金吒': 'jinzha', '木吒': 'muzha', '杨戬': 'yangjian', '王母': 'wangmu',
    '玉帝': 'yudi', '阎王': 'yanwang', '嫦娥': 'change', '李靖': 'lijing',
  },

  // 未合成神将字摆上棋盘时的灵字塔（可升级、可与配对字合成）
  godCharBase: { atk: 6, rate: 0.8, range: 2.5, kind: 'arrow', maxLevel: 5, levelMul: { atk: 0.4, range: 0.15 } },

  towerMaxLevel: 5,
  towerLevelMul: { atk: 0.4, range: 0.15 },

  // 普通字塔（Lv1 基准）
  towers: {
    bow:   { char: '弓', name: '木弓', atk: 10, rate: 1.1, range: 3.5, kind: 'arrow',
             desc: '远程点杀，优先攻击最接近基地的敌人' },
    spear: { char: '枪', name: '长枪', atk: 18, rate: 0.7, range: 2.8, kind: 'pierce', pierce: 3,
             desc: '穿刺：攻击贯穿直线上至多 3 个敌人' },
    staff: { char: '棍', name: '铁棍', atk: 12, rate: 1.2, range: 1.6, kind: 'cleave', cleave: 3,
             desc: '横扫：攻击目标及相邻 2 个敌人' },
    camp:  { char: '营', name: '战营', atk: 0, rate: 0, range: 1.5, kind: 'aura', auraRate: 0.15,
             desc: '战鼓：周围 1 格友塔攻速 +15%（自身不攻击）' },

    /* ---------- 神将（两字合成；Lv1 基准，每级攻击×1.6；技能 M3 启用） ---------- */
    wukong:  { char: '悟空', name: '孙悟空', general: true, rarity: '橙', pair: ['悟', '空'], color: '#c98a2e',
               atk: 16, rate: 1.0, range: 1.8, kind: 'cleave', cleave: 3, maxLevel: 3, levelMul: { atk: 0.6, range: 0.05 },
               skill: { name: '棍卷风云', desc: '旋转棍棒 3 秒，多次范围伤害并眩晕', cd: 12 },
               desc: '近战群伤 · 技能：棍卷风云' },
    wuneng:  { char: '悟能', name: '猪八戒', general: true, rarity: '紫', pair: ['悟', '能'], color: '#8f7bb8',
               atk: 14, rate: 0.8, range: 1.6, kind: 'cleave', cleave: 3, maxLevel: 3, levelMul: { atk: 0.6, range: 0.05 },
               skill: { name: '倒打一耙', desc: '嘲讽周围敌人并减伤回血', cd: 15 },
               desc: '前排肉盾 · 技能：倒打一耙' },
    wujing:  { char: '悟净', name: '沙悟净', general: true, rarity: '紫', pair: ['悟', '净'], color: '#6f86b8',
               atk: 12, rate: 0.9, range: 3.0, kind: 'arrow', maxLevel: 3, levelMul: { atk: 0.6, range: 0.05 },
               skill: { name: '流沙河', desc: '范围内敌人减速 40%，持续 4 秒', cd: 12 },
               desc: '减速控制 · 技能：流沙河' },
    nezha:   { char: '哪吒', name: '哪吒', general: true, rarity: '橙', pair: ['哪', '吒'], color: '#d66a4a',
               atk: 15, rate: 1.1, range: 3.2, kind: 'arrow', maxLevel: 3, levelMul: { atk: 0.6, range: 0.05 },
               skill: { name: '乾坤圈', desc: '攻击在至多 3 个敌人间弹射', cd: 10 },
               desc: '弹射输出 · 技能：乾坤圈' },
    jinzha:  { char: '金吒', name: '金吒', general: true, rarity: '蓝', pair: ['金', '吒'], color: '#5b8fd6',
               atk: 20, rate: 0.6, range: 2.8, kind: 'pierce', pierce: 3, maxLevel: 3, levelMul: { atk: 0.6, range: 0.05 },
               skill: { name: '降魔杵', desc: '蓄力后下一击 300% 伤害', cd: 8 },
               desc: '单体爆发 · 技能：降魔杵' },
    muzha:   { char: '木吒', name: '木吒', general: true, rarity: '蓝', pair: ['木', '吒'], color: '#5fa86f',
               atk: 10, rate: 1.3, range: 2.5, kind: 'arrow', maxLevel: 3, levelMul: { atk: 0.6, range: 0.05 },
               skill: { name: '吴钩双剑', desc: '为周围友塔 +30% 攻速 5 秒', cd: 14 },
               desc: '攻速辅助 · 技能：吴钩双剑' },
    yangjian:{ char: '杨戬', name: '杨戬', general: true, rarity: '橙', pair: ['杨', '戬'], color: '#7a6fd0',
               atk: 24, rate: 0.5, range: 4.0, kind: 'pierce', pierce: 5, maxLevel: 3, levelMul: { atk: 0.6, range: 0.05 },
               skill: { name: '天眼', desc: '贯穿激光，直线上敌人 200% 伤害', cd: 12 },
               desc: '直线狙杀 · 技能：天眼' },
    wangmu:  { char: '王母', name: '王母娘娘', general: true, rarity: '橙', pair: ['王', '母'], color: '#d0a0b8',
               atk: 9, rate: 0.9, range: 2.5, kind: 'arrow', maxLevel: 3, levelMul: { atk: 0.6, range: 0.05 },
               skill: { name: '蟠桃盛会', desc: '治疗周围友塔并 +25% 攻速 5 秒', cd: 18 },
               desc: '治疗辅助 · 技能：蟠桃盛会' },
    yudi:    { char: '玉帝', name: '玉皇大帝', general: true, rarity: '红', pair: ['玉', '帝'], color: '#d6b24a',
               atk: 30, rate: 0.5, range: 3.5, kind: 'cleave', cleave: 5, maxLevel: 3, levelMul: { atk: 0.6, range: 0.05 },
               skill: { name: '昊天威压', desc: '全屏 150% 伤害并眩晕 2 秒', cd: 30 },
               desc: '全屏压制 · 技能：昊天威压' },
    yanwang: { char: '阎王', name: '阎罗王', general: true, rarity: '红', pair: ['阎', '王'], color: '#4a4a58',
               atk: 18, rate: 0.7, range: 3.0, kind: 'arrow', maxLevel: 3, levelMul: { atk: 0.6, range: 0.05 },
               skill: { name: '生死簿', desc: '标记血量最低敌人，3 秒后斩杀', cd: 18 },
               desc: '斩杀 · 技能：生死簿' },
    change:  { char: '嫦娥', name: '嫦娥', general: true, rarity: '橙', pair: ['嫦', '娥'], color: '#d0709a',
               atk: 14, rate: 1.25, range: 3.5, kind: 'arrow', maxLevel: 3, levelMul: { atk: 0.6, range: 0.05 },
               skill: { name: '万箭齐发', desc: '向范围内每个敌人各射一箭（120% 伤害）', cd: 10 },
               desc: '远程散射 · 技能：万箭齐发' },
    lijing:  { char: '李靖', name: '李靖', general: true, rarity: '橙', pair: ['李', '靖'], color: '#8a9a6a',
               atk: 16, rate: 0.8, range: 3.0, kind: 'pierce', pierce: 3, maxLevel: 3, levelMul: { atk: 0.6, range: 0.05 },
               skill: { name: '玲珑宝塔', desc: '塔影罩范围 4 秒：减速 30% 受伤 +50%', cd: 16 },
               desc: '范围控制 · 技能：玲珑宝塔' },
  },

  rarityColors: { '蓝': '#5b8fd6', '紫': '#9a6fd0', '橙': '#e8933c', '红': '#d64545' },

  // 敌人（魂系）
  enemies: {
    ghost:  { char: '魂', name: '幽魂', hp: 20,  speed: 0.9, reward: 1,  dmg: 1, size: 0.62, color: '#8d97b8' },
    wraith: { char: '怨', name: '怨魂', hp: 14,  speed: 1.6, reward: 1,  dmg: 1, size: 0.56, color: '#5cc0a8' },
    brute:  { char: '厉', name: '厉魂', hp: 70,  speed: 0.7, reward: 2,  dmg: 1, size: 0.70, color: '#c05a72', armor: 3 },
    swarm:  { char: '游', name: '游魂', hp: 8,   speed: 1.3, reward: 1,  dmg: 1, size: 0.46, color: '#9aa3b8' },
    boss:   { char: '鬼', name: '鬼将', hp: 600, speed: 0.5, reward: 20, dmg: 3, size: 0.98, color: '#a03448', armor: 2 },
  },
  waveCount: 10,
  waveHpGrowth: 1.14,
  // 前期保护：前 earlyWaveCount 波敌人血量乘 earlyWaveHpEase（给新玩家上手缓冲）
  earlyWaveCount: 3,
  earlyWaveHpEase: 0.85,
  waveIntermission: 6,   // 波间备战秒数

  /* 局外成长：修炼天赋（魂晶购买，永久生效） */
  talents: {
    costs: [15, 25, 40, 60, 90],
    po: {
      name: '破棍', theme: '攻击', nodes: [
        { desc: '全体攻击 +4%', mul: 0.04 },
        { desc: '全体攻击 +8%', mul: 0.08 },
        { desc: '全体攻击 +13%', mul: 0.13 },
        { desc: '全体攻击 +19%', mul: 0.19 },
        { desc: '全体攻击 +26%', mul: 0.26 },
      ],
    },
    zs: {
      name: '摘星', theme: '召唤财运', nodes: [
        { desc: '召唤费 -1' },
        { desc: '开局蟠桃 +5' },
        { desc: '神将字概率 +2%' },
        { desc: '召唤费再 -2' },
        { desc: '保底提前 1 抽' },
      ],
    },
    cs: {
      name: '长生', theme: '防御', nodes: [
        { desc: '初始心 +1' },
        { desc: '敌方移速 -3%' },
        { desc: '初始心 +2' },
        { desc: '敌方移速再 -5%' },
        { desc: '初始心 +3，心上限 +2' },
      ],
    },
    /* 隐藏天赋：累计悟空击杀达标自动激活 */
    glory: {
      need: 100, name: '齐天荣耀', desc: '孙悟空攻击 +20%，棍卷风云冷却 -20%',
    },
  },
};

/* 波次表：n=波次；刷怪事件 {t, type}；hpMul 血量倍率 */
function buildWaves() {
  const waves = [];
  for (let n = 1; n <= CONFIG.waveCount; n++) {
    const list = [];
    const isBoss = n % 5 === 0;
    let count = 5 + 3 * n;
    if (n === 1) count = 6;   // 第一波减量，热身
    for (let i = 0; i < count; i++) {
      let type = 'ghost';
      const r = RNG.next();
      if (n >= 4 && r < 0.18) type = 'swarm';
      else if (n >= 3 && r < 0.38) type = 'brute';
      else if (n >= 2 && r < 0.62) type = 'wraith';
      list.push({ t: 2 + i * 1.1, type });
    }
    if (isBoss) list.push({ t: 2 + count * 1.1 + 2, type: 'boss' });
    const ease = n <= CONFIG.earlyWaveCount ? CONFIG.earlyWaveHpEase : 1;
    waves.push({ n, hpMul: Math.pow(CONFIG.waveHpGrowth, n - 1) * ease, spawns: list });
  }
  return waves;
}
