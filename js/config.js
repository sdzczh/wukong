/* ============================================================
 * 无敌悟空 · 全部可调数值（调平衡只改这里）
 * ============================================================ */
const CONFIG = {
  logicalW: 720, logicalH: 1280,
  hudTopH: 92, hudBottomH: 152,

  /* 版本更新公告：首次打开当前版本时主菜单弹一次
     （独立 localStorage 记忆已读版本，不进存档码/云同步；发新版改 ver+notes 即可） */
  release: {
    ver: '3.0', date: '2026-10-18',
    notes: [
      { t: '三位新神将', d: '红孩儿三昧真火灼烧成海、镇元子缚地灵根定身夺桃、银角大王移山压顶流放强敌；「地仙会盟」三将同场再涨全队攻击，神将凑齐十五位。' },
      { t: '转生轮回', d: '历史波次达标即可花魂晶转入下一世，每世结算魂晶 +15%、神将经验 +10%、开局蟠桃 +2，增益永续十世。' },
      { t: '战绩分享卡', d: '结算页新增「战绩卡」：一图收揽本局波次、击杀、伤害榜与道号，长按即可存图发道友。' },
      { t: '讨伐周赛季', d: '镇守讨伐按周计赛季积分，周季榜可见全服排名，每周一刷新。' },
      { t: '无尽幽冥异象', d: '无尽征战每逢 5 波现一桩异象，二选一抉择定风云；挂机也会替你拿主意。' },
      { t: '挂机离线快进', d: '挂机中关掉页面，回来「继续上局」自动按离线时长快进追进度，桃不白等。' },
      { t: '加载提速', d: '字体按 3.0 文案重制子集、40 个脚本合并为单文件，跨境网络下首次打开明显更快。' },
    ],
  },

  board: { cols: 9, rows: 13, crossRow: 6 },
  // 地块开垦：开局随机开放 startOpen 格（其中 nearOpen 格贴近路径），
  // 其余「封」字地块需用铲子开垦；铲子也可铲塔回架
  field: { startOpen: 16, nearOpen: 10 },
  // 路径拐点（格坐标）：鬼门关 → 左廊直下 → 横穿黄泉路 → 右廊至轮回殿
  pathCells: [[0, 0], [0, 6], [8, 6], [8, 12]],
  base: { col: 8, row: 12, hearts: 10 },

  economy: {
    startPeaches: 12,
    killRewardBase: 1,
    waveRewardBase: 6,               // 过波奖 = base + 波次
    sellRefund: 4,                   // 出售字塔返还（神将另加 4×等级）
    interestEvery: 10, interestCap: 5,  // 过波息钱：每持 10 桃 +1，单波上限 +5
  },

  /* 蟠桃出口：后期（尤其无尽）回收溢出桃——补铲 + 波间瑶池祝福 */
  peachSink: {
    shovel: { base: 50, step: 15 },               // 补铲价 = base + step × 当局已补数
    bless: {
      heart: { base: 30, step: 10 },              // 回心：立即 +1 心
      rate:  { base: 45, step: 10, mul: 1.25 },   // 疾风：本波全员攻速 ×1.25
      slow:  { base: 40, step: 10, spdMul: 0.6 }, // 定身：本波敌人移速 ×0.6
    },
  },

  // 召唤（抽字）：一次召唤弹出 draftSize 张卡，点选入架，未选的再召唤时消失
  summon: {
    base: 9, step: 1,                // 费用 = base + step × 已召唤次数
    godChance: 0.26,                 // 单张神将字概率（15 将池，较 12 将时的 0.24 略抬）
    pityAfter: 4,                    // 连续 N 轮 draft 无神将字后，该轮必出一张
    startChars: 4,                   // 开局免费发字
    rackSize: 5,
    draftSize: 5,
    refreshCost: 3,                  // 选牌条刷新当前 5 卡的费用（不影响保底计数）
    sellBase: 2,                     // 架子上字卡出售 = base + 等级
    sacrificeExp: 6,                 // 神将字献祭给配对神将的经验
    // 自走棋式卡片分级：普通字卡随波次出现 Lv2/Lv3（神将字恒为 Lv1）
    cardLv: { lv2From: 2, lv2Step: 0.05, lv2Cap: 0.35, lv3From: 6, lv3Step: 0.04, lv3Cap: 0.20, maxCardLv: 3 },
  },

  shovelUses: 10,
  towerCap: 24,

  /* 灵宝掉落（击杀概率掉落，自动拾取） */
  drops: {
    chance: 0.03, bossChance: 1,
    endlessDecay: 0.85,            // 无尽征战：第 10 波后掉率每波 ×0.85
    mightMul: 1.2, mightDur: 15,   // 兵符：全体攻击 +
    mightPeach: 8,                 // 桃袋
    mightHeart: 1,                 // 轮回符
  },

  // 普通字 → 塔 key
  charToTower: { '枪': 'spear', '棍': 'staff', '弓': 'bow', '营': 'camp',
                 '毒': 'poison', '雷': 'thunder', '冰': 'frost', '锤': 'metal' },
  // 抽字权重（普通字合计 128，神将字合计权重 52）
  normalCharWeights: { '枪': 20, '棍': 16, '弓': 20, '营': 20,
                       '毒': 13, '雷': 13, '冰': 13, '锤': 13 },
  godCharWeights: {
    '悟': 3, '空': 2, '能': 3, '净': 3, '哪': 2, '吒': 3,
    '金': 3, '木': 3, '杨': 2, '戬': 2, '王': 3, '母': 2,
    '阎': 1, '玉': 1, '帝': 1, '嫦': 2, '娥': 2, '李': 2, '靖': 2,
    '红': 2, '孩': 2, '镇': 1, '元': 1, '银': 2, '角': 2,
  },
  // 神将字对 → 神将 key（key 为 CONFIG.towers 中的神将名）
  pairs: {
    '悟空': 'wukong', '悟能': 'wuneng', '悟净': 'wujing', '哪吒': 'nezha',
    '金吒': 'jinzha', '木吒': 'muzha', '杨戬': 'yangjian', '王母': 'wangmu',
    '玉帝': 'yudi', '阎王': 'yanwang', '嫦娥': 'change', '李靖': 'lijing',
    '红孩': 'honghaier', '镇元': 'zhenyuanzi', '银角': 'yinjiao',
  },

  // 未合成神将字摆上棋盘时的灵字塔（可升级、可与配对字合成）
  godCharBase: { atk: 6, rate: 0.8, range: 2.5, kind: 'arrow', maxLevel: 5, levelMul: { atk: 0.4, range: 0.15 } },

  /* 神将升星：同名神将合并 → +1 星（任意等级可作材料）；每星攻击/技能强化，满星解锁被动 */
  generalStars: { max: 3, atkStep: 0.08, skillStep: 0.15, sellStep: 6 },

  /* 神将熟练度：上场次数累计（跨局），纯表现特效强化（不影响数值）
     tier1 技能双环 → tier2 字牌金描边+出场花火 → tier3 常驻金晕+技能花火 */
  mastery: { tiers: [5, 15, 40], names: ['初试锋芒', '驾轻就熟', '出神入化'] },

  towerMaxLevel: 5,
  towerLevelMul: { atk: 0.4, range: 0.15 },

  /* 普通塔进阶（2.0 扩系）：Lv3 后花蟠桃二选一，永久改特性（存于单位 adv 字段，'a' | 'b'） */
  advances: {
    cost: 12,
    poison: {
      a: { name: '蚀骨毒', desc: '毒素每秒伤害 ×1.6，可叠 4 层', poisonMul: 1.6, poisonCap: 4 },
      b: { name: '瘴疫',   desc: '攻击溅射：目标周围敌人受 40% 伤害并染一半毒', splash: { r: 1.1, mul: 0.4, poison: 0.5 } },
    },
    thunder: {
      a: { name: '连环雷', desc: '闪电跳跃目标 3 → 5 个', chainN: 5 },
      b: { name: '霹雳',   desc: '专注主目标：200% 伤害并眩晕 0.3 秒', focusMul: 2.0, stun: 0.3 },
    },
    frost: {
      a: { name: '严寒',   desc: '减速 25% → 45%，持续 3 秒', slowF: 0.55, slowDur: 3 },
      b: { name: '冰晶爆', desc: '攻速 -15%；攻击溅射 50%，20% 概率冰冻 0.5 秒', rateMul: 0.85, splash: { r: 1.2, mul: 0.5 }, freeze: 0.2 },
    },
    metal: {
      a: { name: '碎甲锤', desc: '每击削甲 1 → 2，上限 5 → 8', shredN: 2, shredCap: 8 },
      b: { name: '重金锤', desc: '攻击 +60%，攻速 -20%', atkMul: 1.6, rateMul: 0.8 },
    },
  },

  // 普通字塔（Lv1 基准）
  towers: {
    bow:   { char: '弓', name: '木弓', atk: 10, rate: 1.1, range: 3.5, kind: 'arrow',
             desc: '远程点杀，优先攻击最接近基地的敌人' },
    spear: { char: '枪', name: '长枪', atk: 18, rate: 0.7, range: 2.8, kind: 'pierce', pierce: 3,
             desc: '穿刺：攻击贯穿直线上至多 3 个敌人' },
    staff: { char: '棍', name: '铁棍', atk: 12, rate: 1.2, range: 1.6, kind: 'cleave', cleave: 3,
             desc: '横扫：攻击目标及相邻 2 个敌人' },
    camp:  { char: '营', name: '战营', atk: 0, rate: 0, range: 2.2, kind: 'aura', auraRate: 0.15, auraLvStep: 0.05,
             desc: '战鼓：周围 2 格友塔攻速 +15%（每级扩圈、攻速再 +5%，自身不攻击）' },

    /* ---------- 2.0 扩系四塔（毒/雷/冰/锤）：Lv3 可花桃二选一进阶 ---------- */
    poison: { char: '毒', name: '腐蛊', atk: 6, rate: 1.0, range: 3.2, kind: 'arrow', color: '#7aa84e',
              poison: { dps: 4, dur: 3, cap: 3 },
              atkfx: { color: '#8fc45e', size: 5, shape: 'ink', glow: 7, trail: '#6a9440' },
              desc: '腐毒：命中染毒，每秒 4 点持续伤害（无视护甲），可叠 3 层' },
    thunder:{ char: '雷', name: '雷煞', atk: 13, rate: 0.6, range: 3.0, kind: 'chain', color: '#b88fe8',
              chain: { n: 3, fall: 0.75 },
              desc: '连环雷：闪电在至多 3 个敌人间跳跃，逐跳伤害 -25%' },
    frost:  { char: '冰', name: '霜华', atk: 8, rate: 1.0, range: 3.2, kind: 'arrow', color: '#6fb4e0',
              slowHit: { f: 0.75, dur: 1.8 },
              atkfx: { color: '#a8dcf5', size: 5, shape: 'drop', glow: 7, trail: '#7ab8e0', impact: true },
              desc: '霜寒：命中减速 25%，持续 1.8 秒' },
    metal:  { char: '锤', name: '重锤', atk: 20, rate: 0.55, range: 2.4, kind: 'cleave', cleave: 2, color: '#c0a05a',
              shred: { n: 1, cap: 5 },
              atkfx: { style: 'sweep', color: '#c8a85a', r: 1.15, width: 10, glow: 8, impact: 'ring' },
              desc: '碎甲：重锤砸地波及 2 敌，命中削减护甲 1（至多 5 层）' },

    /* ---------- 神将（两字合成；Lv1 基准，每级攻击×1.6；技能 M3 启用） ---------- */
    wukong:  { char: '悟空', name: '孙悟空', general: true, rarity: '橙', pair: ['悟', '空'], color: '#c98a2e',
               atkfx: { style: 'sweep', color: '#f0c058', core: '#fff0c0', width: 9, r: 1.3, dual: true, impact: 'spark' },
               atk: 16, rate: 1.0, range: 1.8, kind: 'cleave', cleave: 3, maxLevel: 3, levelMul: { atk: 0.6, range: 0.05 },
               skill: { name: '棍卷风云', desc: '旋转棍棒 3 秒，多次范围伤害并眩晕', cd: 12 },
               star3: { name: '火眼金睛', desc: '攻击无视护甲（克玄甲鬼将）' },
               desc: '近战群伤 · 技能：棍卷风云' },
    wuneng:  { char: '悟能', name: '猪八戒', general: true, rarity: '紫', pair: ['悟', '能'], color: '#8f7bb8',
               atkfx: { style: 'sweep', color: '#a88fd0', width: 11, r: 1.1, impact: 'ring' },
               atk: 14, rate: 0.8, range: 1.6, kind: 'cleave', cleave: 3, maxLevel: 3, levelMul: { atk: 0.6, range: 0.05 },
               skill: { name: '倒打一耙', desc: '嘲讽周围敌人并减伤回血', cd: 15 },
               star3: { name: '督战', desc: '周围 2 格友塔攻击 +15%' },
               desc: '前排肉盾 · 技能：倒打一耙' },
    wujing:  { char: '悟净', name: '沙悟净', general: true, rarity: '紫', pair: ['悟', '净'], color: '#6f86b8',
               atkfx: { shape: 'drop', color: '#7fb4e8', size: 5, glow: 8, trail: '#5a8fc8', impact: true },
               atk: 12, rate: 0.9, range: 3.0, kind: 'arrow', maxLevel: 3, levelMul: { atk: 0.6, range: 0.05 },
               skill: { name: '流沙河', desc: '范围内敌人减速 40%，持续 4 秒', cd: 12 },
               star3: { name: '寒潮', desc: '攻击附带减速 20%，持续 1.5 秒' },
               desc: '减速控制 · 技能：流沙河' },
    nezha:   { char: '哪吒', name: '哪吒', general: true, rarity: '橙', pair: ['哪', '吒'], color: '#d66a4a',
               atkfx: { shape: 'spear', color: '#ff8a5c', size: 5, glow: 12, trail: '#e06030', impact: true },
               atk: 15, rate: 1.1, range: 3.2, kind: 'arrow', maxLevel: 3, levelMul: { atk: 0.6, range: 0.05 },
               skill: { name: '乾坤圈', desc: '攻击在至多 3 个敌人间弹射', cd: 10 },
               star3: { name: '三头六臂', desc: '普攻额外命中 1 个敌人（50% 伤害）' },
               desc: '弹射输出 · 技能：乾坤圈' },
    jinzha:  { char: '金吒', name: '金吒', general: true, rarity: '蓝', pair: ['金', '吒'], color: '#5b8fd6',
               atkfx: { style: 'beam', color: '#6fa8e8', core: '#e8f4ff', width: 6, glow: 14 },
               atk: 20, rate: 0.6, range: 2.8, kind: 'pierce', pierce: 3, maxLevel: 3, levelMul: { atk: 0.6, range: 0.05 },
               skill: { name: '降魔杵', desc: '蓄力后下一击 300% 伤害', cd: 8 },
               star3: { name: '破军', desc: '25% 概率暴击，伤害 ×2' },
               desc: '单体爆发 · 技能：降魔杵' },
    muzha:   { char: '木吒', name: '木吒', general: true, rarity: '蓝', pair: ['木', '吒'], color: '#5fa86f',
               atkfx: { shape: 'crescent', color: '#6fc08a', size: 5, glow: 8, trail: '#4a9a6a', impact: true },
               atk: 10, rate: 1.3, range: 2.5, kind: 'arrow', maxLevel: 3, levelMul: { atk: 0.6, range: 0.05 },
               skill: { name: '吴钩双剑', desc: '为周围友塔 +30% 攻速 5 秒', cd: 14 },
               star3: { name: '连环', desc: '周围 2 格友塔攻速 +20%' },
               desc: '攻速辅助 · 技能：吴钩双剑' },
    yangjian:{ char: '杨戬', name: '杨戬', general: true, rarity: '橙', pair: ['杨', '戬'], color: '#7a6fd0',
               atkfx: { style: 'beam', color: '#9a8fe0', core: '#f0eaff', width: 3.5, glow: 18 },
               atk: 24, rate: 0.5, range: 4.0, kind: 'pierce', pierce: 5, maxLevel: 3, levelMul: { atk: 0.6, range: 0.05 },
               skill: { name: '天眼', desc: '贯穿激光，直线上敌人 200% 伤害', cd: 12 },
               star3: { name: '天目', desc: '射程 +1.5 格，且可攻击遁形敌人' },
               desc: '直线狙杀 · 技能：天眼' },
    wangmu:  { char: '王母', name: '王母娘娘', general: true, rarity: '橙', pair: ['王', '母'], color: '#d0a0b8',
               atkfx: { shape: 'petal', color: '#f0a8cc', size: 5.5, glow: 10, trail: '#d888b8', impact: true },
               atk: 9, rate: 0.9, range: 2.5, kind: 'arrow', maxLevel: 3, levelMul: { atk: 0.6, range: 0.05 },
               skill: { name: '蟠桃盛会', desc: '治疗周围友塔并 +25% 攻速 5 秒', cd: 18 },
               star3: { name: '福泽', desc: '每波开始 +2 蟠桃' },
               desc: '治疗辅助 · 技能：蟠桃盛会' },
    yudi:    { char: '玉帝', name: '玉皇大帝', general: true, rarity: '红', pair: ['玉', '帝'], color: '#d6b24a',
               atkfx: { style: 'sweep', color: '#e8c85c', core: '#fff8d8', width: 10, r: 1.5, impact: 'ring' },
               atk: 30, rate: 0.5, range: 3.5, kind: 'cleave', cleave: 5, maxLevel: 3, levelMul: { atk: 0.6, range: 0.05 },
               skill: { name: '昊天威压', desc: '全屏 150% 伤害并眩晕 2 秒', cd: 30 },
               star3: { name: '天威', desc: '全体友军攻击 +10%' },
               desc: '全屏压制 · 技能：昊天威压' },
    yanwang: { char: '阎王', name: '阎罗王', general: true, rarity: '红', pair: ['阎', '王'], color: '#4a4a58',
               atkfx: { shape: 'ink', color: '#c0c0e0', size: 6, glow: 14, trail: '#7070a0', impact: true },
               atk: 18, rate: 0.7, range: 3.0, kind: 'arrow', maxLevel: 3, levelMul: { atk: 0.6, range: 0.05 },
               skill: { name: '生死簿', desc: '标记血量最低敌人，3 秒后斩杀', cd: 18 },
               star3: { name: '索命', desc: '击杀时 20% 概率刷新技能冷却' },
               desc: '斩杀 · 技能：生死簿' },
    change:  { char: '嫦娥', name: '嫦娥', general: true, rarity: '橙', pair: ['嫦', '娥'], color: '#d0709a',
               atkfx: { shape: 'moon', color: '#e0d0ff', size: 6, glow: 12, trail: '#b8a8e8', impact: true },
               atk: 14, rate: 1.25, range: 3.5, kind: 'arrow', maxLevel: 3, levelMul: { atk: 0.6, range: 0.05 },
               skill: { name: '万箭齐发', desc: '向范围内每个敌人各射一箭（120% 伤害）', cd: 10 },
               star3: { name: '月华', desc: '攻击溅射：目标相邻敌人受 50% 伤害' },
               desc: '远程散射 · 技能：万箭齐发' },
    lijing:  { char: '李靖', name: '李靖', general: true, rarity: '橙', pair: ['李', '靖'], color: '#8a9a6a',
               atkfx: { style: 'beam', color: '#9ab07a', width: 8, glow: 8 },
               atk: 16, rate: 0.8, range: 3.0, kind: 'pierce', pierce: 3, maxLevel: 3, levelMul: { atk: 0.6, range: 0.05 },
               skill: { name: '玲珑宝塔', desc: '塔影罩范围 4 秒：减速 30% 受伤 +50%', cd: 16 },
               star3: { name: '镇魂', desc: '攻击 15% 概率眩晕 0.5 秒' },
               desc: '范围控制 · 技能：玲珑宝塔' },
    honghaier: { char: '红孩', name: '红孩儿', general: true, rarity: '橙', pair: ['红', '孩'], color: '#e0563c',
               atkfx: { shape: 'spear', color: '#ff9a5c', size: 5.5, glow: 12, trail: '#e06030', impact: true },
               atk: 13, rate: 1.0, range: 3.0, kind: 'arrow', maxLevel: 3, levelMul: { atk: 0.6, range: 0.05 },
               skill: { name: '三昧真火', desc: '火浪灼烧眼前敌群，并在落点留下 5 秒燃烧地带', cd: 14 },
               star3: { name: '业火', desc: '灼烧叠层上限 5 → 8' },
               desc: '灼烧地带 · 技能：三昧真火' },
    zhenyuanzi: { char: '镇元', name: '镇元子', general: true, rarity: '红', pair: ['镇', '元'], color: '#5fa8a0',
               atkfx: { style: 'beam', color: '#7fd8c8', core: '#eafff8', width: 5, glow: 12 },
               atk: 15, rate: 0.7, range: 3.2, kind: 'pierce', pierce: 2, maxLevel: 3, levelMul: { atk: 0.6, range: 0.05 },
               skill: { name: '缚地灵根', desc: '灵根定身敌群 2.5 秒并持续吸取，伤害的 25% 化作蟠桃', cd: 16 },
               star3: { name: '地脉', desc: '灵根吸取转桃比例提升到 35%' },
               desc: '伤害转桃 · 技能：缚地灵根' },
    yinjiao: { char: '银角', name: '银角大王', general: true, rarity: '紫', pair: ['银', '角'], color: '#8a7fb8',
               atkfx: { style: 'sweep', color: '#a89ae0', width: 9, r: 1.2, impact: 'ring' },
               atk: 15, rate: 0.9, range: 1.8, kind: 'cleave', cleave: 2, maxLevel: 3, levelMul: { atk: 0.6, range: 0.05 },
               skill: { name: '移山压顶', desc: '将范围内最强敌人压入山底 3 秒（移出战局），弹出时受重创', cd: 18 },
               star3: { name: '山威', desc: '被压敌人弹出时眩晕 0.8 秒' },
               desc: '禁锢控杀 · 技能：移山压顶' },
  },

  rarityColors: { '蓝': '#5b8fd6', '紫': '#9a6fd0', '橙': '#e8933c', '红': '#d64545' },

  /* ============================================================
   * 装备系统（M6）：怪物掉部件 → 3 合 1 装备 → 3 合 1 升级；
   * boss 掉神将专属碎片，带出对局、局外合成升级（永久）
   * ============================================================ */
  gear: {
    partChance: 0.06,             // 普通击杀掉部件概率
    bruteBonus: 0.20,             // 厉魂额外掉率（皮糙肉厚揣着料）
    endlessDecay: 0.85,           // 无尽第 10 波后每波 ×0.85（与灵宝一致）
    forgeNeed: 3,                 // 3 部件 → Lv1 装备；3 件同系同级 → 下一级
    maxLv: 3,
    // 四系：stat ∈ atkMul 攻击 / rateMul 攻速 / rangeMul 射程 / cdMul 技冷却（仅神将）
    families: {
      feng: { char: '锋', name: '兵锋', color: '#c05a4a', stat: 'atkMul',   per: [0.15, 0.30, 0.50] },
      ji:   { char: '疾', name: '疾风', color: '#4a8fc0', stat: 'rateMul',  per: [0.12, 0.24, 0.40] },
      yuan: { char: '远', name: '望远', color: '#5fa86f', stat: 'rangeMul', per: [0.12, 0.24, 0.40] },
      ling: { char: '灵', name: '灵犀', color: '#9a6fd0', stat: 'cdMul',    per: [0.10, 0.20, 0.32], generalOnly: true },
    },
    sigForge: 3,                  // 专属合成：3 碎片 → Lv1
    sigUpgrade: 2,                // 专属升级：2 碎片/级
    sigMaxLv: 5,
  },

  /* 神将专属装备：stat 为主属性（base 每级 +per），unique 为专属强化（skill.js 实现） */
  sigGear: {
    wukong:  { name: '如意金箍棒', color: '#c98a2e', stat: 'atkMul',  base: 0.20, per: 0.08,
               desc: '攻击 +{v}%；棍卷风云持续 +0.5s/级' },
    wuneng:  { name: '九齿钉耙',   color: '#8f7bb8', stat: 'atkMul',  base: 0.15, per: 0.06,
               desc: '攻击 +{v}%；倒打一耙定身 +0.2s/级' },
    wujing:  { name: '降妖宝杖',   color: '#6f86b8', stat: 'atkMul',  base: 0.12, per: 0.05,
               desc: '攻击 +{v}%；流沙河减速 +3%/级' },
    nezha:   { name: '风火轮',     color: '#d66a4a', stat: 'rateMul', base: 0.15, per: 0.06,
               desc: '攻速 +{v}%；乾坤圈多弹 1 个目标/级' },
    jinzha:  { name: '降魔杵',     color: '#5b8fd6', stat: 'atkMul',  base: 0.20, per: 0.08,
               desc: '攻击 +{v}%；蓄力一击 +20%/级' },
    muzha:   { name: '吴钩剑',     color: '#5fa86f', stat: 'rateMul', base: 0.12, per: 0.05,
               desc: '攻速 +{v}%；双剑加速 +3%/级' },
    yangjian:{ name: '三尖两刃刀', color: '#7a6fd0', stat: 'atkMul',  base: 0.22, per: 0.09,
               desc: '攻击 +{v}%；天眼伤害 +15%/级' },
    wangmu:  { name: '蟠桃枝',     color: '#d0a0b8', stat: 'cdMul',   base: 0.12, per: 0.05,
               desc: '技冷却 -{v}%；3 级起蟠桃盛会再 +1 心' },
    yudi:    { name: '昊天镜',     color: '#d6b24a', stat: 'cdMul',   base: 0.15, per: 0.06,
               desc: '技冷却 -{v}%；昊天威压眩晕 +0.15s/级' },
    yanwang: { name: '判官笔',     color: '#4a4a58', stat: 'cdMul',   base: 0.12, per: 0.05,
               desc: '技冷却 -{v}%；生死簿提前 0.2s/级' },
    change:  { name: '玉兔杵',     color: '#d0709a', stat: 'atkMul',  base: 0.15, per: 0.06,
               desc: '攻击 +{v}%；万箭齐发 +10%/级' },
    lijing:  { name: '玲珑金塔',   color: '#8a9a6a', stat: 'cdMul',   base: 0.12, per: 0.05,
               desc: '技冷却 -{v}%；玲珑宝塔 +0.5s/级' },
    honghaier:  { name: '火尖枪',   color: '#e0563c', stat: 'atkMul', base: 0.18, per: 0.07,
               desc: '攻击 +{v}%；灼烧每层伤害 +15%/级' },
    zhenyuanzi: { name: '玉尘麈',   color: '#5fa8a0', stat: 'atkMul', base: 0.15, per: 0.06,
               desc: '攻击 +{v}%；灵根定身 +0.2s/级' },
    yinjiao:    { name: '紫金葫芦', color: '#8a7fb8', stat: 'rateMul', base: 0.12, per: 0.05,
               desc: '攻速 +{v}%；山压禁锢 +0.3s/级' },
  },

  // 敌人（魂系）
  enemies: {
    ghost:  { char: '魂', name: '幽魂', hp: 20,  speed: 0.9, reward: 1,  exp: 1, dmg: 1, size: 0.62, color: '#8d97b8' },
    wraith: { char: '怨', name: '怨魂', hp: 14,  speed: 1.6, reward: 1,  exp: 1, dmg: 1, size: 0.56, color: '#5cc0a8' },
    brute:  { char: '厉', name: '厉魂', hp: 70,  speed: 0.7, reward: 2,  exp: 2, dmg: 1, size: 0.70, color: '#c05a72', armor: 3 },
    swarm:  { char: '游', name: '游魂', hp: 8,   speed: 1.3, reward: 1,  exp: 1, dmg: 1, size: 0.46, color: '#9aa3b8' },
    boss:   { char: '鬼', name: '鬼将', hp: 600, speed: 0.5, reward: 20, exp: 4, dmg: 3, size: 0.98, color: '#a03448', armor: 2 },
  },

  /* Boss 池轮换：每个鬼将波（n%5==0）从池中按波次轮换登场，机制与碎片偏好绑定。
     shards：该鬼将必掉的专属碎片偏向哪三位神将（碎片掉落绑定） */
  bossPool: [
    { id: 'xuanjia', char: '甲', name: '玄甲鬼将', color: '#6a7a9a', armor: 8,
      desc: '玄甲庇体：护甲极高，且存活时全军攻击 -25%',
      shards: ['lijing', 'jinzha', 'yanwang', 'yinjiao'] },
    { id: 'zhaohuan', char: '唤', name: '唤魂鬼将', color: '#9a6fd0',
      desc: '唤魂：行进间不断召出幽魂小鬼',
      shards: ['wangmu', 'change', 'wuneng', 'zhenyuanzi'] },
    { id: 'kuangbao', char: '狂', name: '狂暴鬼将', color: '#d64545', speedMul: 1.15,
      desc: '狂暴：半血后怒不可遏，移速暴涨',
      shards: ['wukong', 'nezha', 'muzha', 'honghaier'] },
    { id: 'yinshen', char: '隐', name: '隐匿鬼将', color: '#5cc0a8',
      desc: '隐匿：周期遁形 2 秒，隐身时无法被索敌',
      shards: ['yangjian', 'yudi', 'wujing'] },
  ],
  bossSummonEvery: 4,      // 唤魂：召小鬼间隔（秒）
  bossStealth: { on: 2, off: 3 },   // 隐匿：遁形/现形时长（秒）
  bossEnrageSpd: 1.6,      // 狂暴：半血后移速乘数

  /* 异步 PVP：镇守阵容 → 入侵镜像阵（镇守/讨伐） */
  pvp: {
    startPeaches: 60,        // 讨伐开局额外军饷
    winCrystals: 50,         // 破阵魂晶
    loseCrystals: 10,        // 败北安慰魂晶
    maxUnits: 12,            // 镇守阵容最多收录 12 座
    unitsPerWave: 4,         // 每阵 4 座 → 最多 3 阵
    baseHp: 42,              // 镜像单位基础血（随镇守者波次/等级/星级放大）
    groupMul: [0.85, 1.1, 1.45],   // 第 1/2/3 阵强度系数
  },

  waveCount: 10,
  waveHpGrowth: 1.14,
  // 前期保护：前 earlyWaveCount 波敌人血量乘 earlyWaveHpEase（给新玩家上手缓冲）
  earlyWaveCount: 3,
  earlyWaveHpEase: 0.85,
  waveIntermission: 6,   // 波间备战秒数

  /* 无尽模式（通关第 10 波后可选择进入）：波次无限，每 shovelEvery 波奖励 1 把铲子 */
  endless: { shovelEvery: 5, eventsEvery: 5 },   // 无尽补给铲 / 幽冥异象事件节拍（波）

  /* 提前叫波：备战期点按钮立即开下一波，按剩余秒数给桃 */
  callWave: { perSec: 2 },

  /* 精英词缀怪：中后期概率出现，血量/奖励更高，携带一个词缀 */
  elite: {
    fromWave: 6, chance: 0.22,        // 第 6 波起，每只普通怪 22% 概率升级为精英
    hpMul: 2.2, rewardMul: 2, expMul: 2,
    affixes: {
      split: { char: '裂', name: '分裂', color: '#e8b64c', desc: '死亡时分裂出 2 只小分身' },
      shield:{ char: '盾', name: '护盾', color: '#6fa8e8', desc: '护盾值一半血量，5 秒后重生成' },
      heal:  { char: '疗', name: '治疗', color: '#6fc08a', desc: '持续治疗周围敌人' },
      swift: { char: '疾', name: '急速', color: '#f0a8cc', desc: '移动速度 +60%' },
    },
  },

  /* 波间命运三选一：每 every 波过波后弹出，3 选 1 全局词条（可叠加） */
  waveMods: {
    every: 3, pick: 3,
    steps: { atk: 0.10, rate: 0.08, exp: 0.25, cd: 0.10, peach: 1, interest: 1, aura: 0.05, sell: 2 },
    pool: [
      { id: 'atk',      name: '淬锋', desc: '全体攻击 +10%' },
      { id: 'rate',     name: '疾风', desc: '全体攻速 +8%' },
      { id: 'peach',    name: '聚宝', desc: '击杀额外 +1 蟠桃' },
      { id: 'interest', name: '钱庄', desc: '过波息钱 +1/波' },
      { id: 'exp',      name: '悟道', desc: '神将经验 +25%' },
      { id: 'aura',     name: '战鼓', desc: '战鼓光环加成 +5%' },
      { id: 'cd',       name: '凝神', desc: '神将技冷却 -10%' },
      { id: 'sell',     name: '回春', desc: '出售返还 +2 桃' },
      { id: 'heart',    name: '续命', desc: '立即 +2 心' },
      { id: 'shovel',   name: '拓荒', desc: '立即 +2 铲' },
    ],
    /* 传说词条：每次三选一约 legendChance 概率随机降临一张（金红卡面），强全局效果 */
    legendChance: 0.05,
    legendSteps: { latk: 0.35, lrate: 0.25, lslow: 0.20, lgold: 30 },
    legendPool: [
      { id: 'latk',  name: '天罡战气', desc: '全体攻击 +35%' },
      { id: 'lrate', name: '神行法',   desc: '全体攻速 +25%' },
      { id: 'lslow', name: '冰封千里', desc: '敌方移速 -20%' },
      { id: 'lgold', name: '点石成桃', desc: '过波奖励 +30 桃' },
      { id: 'lheart',name: '蟠桃盛会', desc: '立即 +5 心，心上限 +3' },
    ],
  },

  /* 每周异变：同周同盘 + 3 条全局规则，结算计每周最佳 */
  weekly: {
    pick: 3,
    pool: [
      { id: 'spd',      name: '急魂夜行', desc: '敌方移速 +15%', rule: { enemySpdMul: 1.15 } },
      { id: 'hp',       name: '厚甲幽都', desc: '敌方血量 +20%', rule: { enemyHpMul: 1.20 } },
      { id: 'peach',    name: '丰收之年', desc: '桃收益 +30%',   rule: { peachAwardMul: 1.30 } },
      { id: 'cheap',    name: '字价低廉', desc: '召唤费 -2',     rule: { summonCostDelta: -2 } },
      { id: 'interest', name: '聚财之道', desc: '息钱翻倍',      rule: { interestMul: 2 } },
      { id: 'fragile',  name: '脆弱之体', desc: '敌人受伤 +25%', rule: { enemyHpMul: 0.8 } },
      { id: 'wisdom',   name: '悟性超凡', desc: '神将经验 +50%', rule: { expMul: 1.5 } },
      { id: 'dig',      name: '地脉丰饶', desc: '开局 +4 铲',    rule: { shovelDelta: 4 } },
      { id: 'god',      name: '神将降临', desc: '神将字概率 +6%', rule: { godChanceAdd: 0.06 } },
    ],
  },

  /* 羁绊：同阵营神将登场 N 名触发团队增益（2 名 / 3 名两档） */
  bonds: [
    { name: '三吒同心', color: '#d66a4a', keys: ['nezha', 'jinzha', 'muzha'], stat: 'rate', tiers: [0.08, 0.15], desc: '全体攻速' },
    { name: '天庭威仪', color: '#d6b24a', keys: ['yudi', 'wangmu', 'yangjian'], stat: 'atk', tiers: [0.08, 0.15], desc: '全体攻击' },
    { name: '取经之路', color: '#c98a2e', keys: ['wukong', 'wuneng', 'wujing'], stat: 'exp', tiers: [0.3, 0.6], desc: '神将经验' },
    { name: '散仙结盟', color: '#7a6fd0', keys: ['yanwang', 'change', 'lijing'], stat: 'cd', tiers: [0.08, 0.15], desc: '技能冷却' },
    { name: '地仙会盟', color: '#5fa8a0', keys: ['honghaier', 'zhenyuanzi', 'yinjiao'], stat: 'atk', tiers: [0.08, 0.16], desc: '全体攻击' },
  ],

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

  /* 3.0 转生轮回：历史最高波次达门槛 + 消耗魂晶 → 转入下一世（永世增益逐层叠加）
     门槛随世数抬升（无尽模式是刷门槛的主场），费用水涨船高 */
  rebirth: {
    max: 10,
    needBase: 20, needStep: 5,      // 第 n 世（0 起）需历史最高波次达 20+5n
    costBase: 350, costStep: 250,   // 每次转生费用 350+250×当前世数
    crystalStep: 0.15,              // 每世：结算魂晶 +15%
    expStep: 0.10,                  // 每世：神将击杀经验 +10%
    peachStep: 2,                   // 每世：开局蟠桃 +2
  },
};

/* Boss 池轮换：第 5 波→池 0、第 10 波→池 1……按波次公式轮换（不用 RNG，保日/周种子回放一致） */
function bossKindFor(n) {
  const pool = CONFIG.bossPool;
  return pool[(Math.ceil(n / 5) - 1) % pool.length].id;
}

/* 无尽波次生成：n>10；公式延续前十波的节奏并逐波加压 */
function buildEndlessWave(n) {
  const list = [];
  const isBoss = n % 5 === 0;
  const count = 5 + 3 * n;
  for (let i = 0; i < count; i++) {
    let type = 'ghost';
    const r = RNG.next();
    if (r < 0.22) type = 'swarm';
    else if (r < 0.45) type = 'brute';
    else if (r < 0.68) type = 'wraith';
    list.push({ t: 2 + i * 1.0, type });
  }
  if (isBoss) list.push({ t: 2 + count * 1.0 + 2, type: 'boss', bossKind: bossKindFor(n) });
  return { n, hpMul: Math.pow(CONFIG.waveHpGrowth, n - 1), spawns: list };
}

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
    if (isBoss) list.push({ t: 2 + count * 1.1 + 2, type: 'boss', bossKind: bossKindFor(n) });
    const ease = n <= CONFIG.earlyWaveCount ? CONFIG.earlyWaveHpEase : 1;
    waves.push({ n, hpMul: Math.pow(CONFIG.waveHpGrowth, n - 1) * ease, spawns: list });
  }
  return waves;
}
