/* 成就与称号：基于持久存档数据（波次/击杀/图鉴等级/神将收集/装备锻造）自动解锁。
   每条成就绑定一个称号，达成即可在图鉴「成就」页签佩戴，主菜单与结算页展示。
   Ach.check() 在结算、装备锻造、主菜单打开时调用；解锁即写档（败局也保留）。 */
'use strict';

const ACHS = [
  /* —— 波次征程 —— */
  { id: 'wave5',   name: '初镇黄泉', title: '黄泉哨探', desc: '单局抵达第 5 波',      test: s => s.bestWave >= 5 },
  { id: 'wave10',  name: '十波尽破', title: '轮回镇守', desc: '通关第 10 波',        test: s => s.bestWave >= 10 },
  { id: 'wave15',  name: '无尽初征', title: '征战都尉', desc: '无尽征战抵达第 15 波', test: s => s.bestWave >= 15 },
  { id: 'wave20',  name: '长驱直入', title: '破军先锋', desc: '无尽征战抵达第 20 波', test: s => s.bestWave >= 20 },
  { id: 'wave25',  name: '幽冥深处', title: '荡魔将军', desc: '无尽征战抵达第 25 波', test: s => s.bestWave >= 25 },
  /* —— 击杀 —— */
  { id: 'kill100',  name: '小试锋芒', title: '驱魂人',   desc: '累计击杀 100',      test: s => s.totalKills >= 100 },
  { id: 'kill500',  name: '百战余生', title: '伏魂师',   desc: '累计击杀 500',      test: s => s.totalKills >= 500 },
  { id: 'kill2000', name: '千军斩将', title: '屠鬼校尉', desc: '累计击杀 2000',     test: s => s.totalKills >= 2000 },
  { id: 'boss5',    name: '鬼将克星', title: '鬼将克星', desc: '累计斩杀鬼将 5',    test: s => (s.bossKills || 0) >= 5 },
  { id: 'boss20',   name: '群鬼辟易', title: '降魔护法', desc: '累计斩杀鬼将 20',   test: s => (s.bossKills || 0) >= 20 },
  { id: 'wk100',    name: '金箍初鸣', title: '悟空同行', desc: '孙悟空累计击杀 100', test: s => (s.wukongKills || 0) >= 100 },
  /* —— 图鉴收集 —— */
  { id: 'cx16',   name: '识字百人', title: '集字生',   desc: '图鉴收集 16 个字',       test: s => Object.keys((s.codex && s.codex.chars) || {}).length >= 16 },
  { id: 'cx23',   name: '字海拾遗', title: '藏经阁主', desc: '图鉴集齐全部 23 个字',    test: s => Object.keys((s.codex && s.codex.chars) || {}).length >= 23 },
  { id: 'lv2x5',  name: '熔铸成钢', title: '锻字匠',   desc: '5 个字历史最高达到 Lv2', test: s => Object.values((s.codex && s.codex.charLv) || {}).filter(v => v >= 2).length >= 5 },
  { id: 'lv3x1',  name: '点石成金', title: '点金手',   desc: '1 个字历史最高达到 Lv3', test: s => Object.values((s.codex && s.codex.charLv) || {}).filter(v => v >= 3).length >= 1 },
  { id: 'lv3x5',  name: '登峰造极', title: '极字宗师', desc: '5 个字历史最高达到 Lv3', test: s => Object.values((s.codex && s.codex.charLv) || {}).filter(v => v >= 3).length >= 5 },
  { id: 'god3',   name: '神将初醒', title: '唤神者',   desc: '唤醒 3 位神将',       test: s => Object.keys((s.codex && s.codex.generals) || {}).length >= 3 },
  { id: 'god6',   name: '半壁天河', title: '天河副将', desc: '唤醒 6 位神将',       test: s => Object.keys((s.codex && s.codex.generals) || {}).length >= 6 },
  { id: 'god12',  name: '满天神佛', title: '齐天尊者', desc: '唤醒全部 12 位神将',   test: s => Object.keys((s.codex && s.codex.generals) || {}).length >= 12 },
  /* —— 神兵与装备 —— */
  { id: 'sig1',   name: '遗宝在手', title: '遗宝传人', desc: '合成 1 件专属神兵',   test: s => Object.keys(s.sigGear || {}).length >= 1 },
  { id: 'sig4',   name: '神兵满架', title: '神兵库监', desc: '合成 4 件专属神兵',   test: s => Object.keys(s.sigGear || {}).length >= 4 },
  { id: 'eq1',    name: '初铸兵锋', title: '铸装学徒', desc: '累计锻造 1 件装备',   test: s => (s.equipForged || 0) >= 1 },
  { id: 'eq10',   name: '炉火纯青', title: '锻造大师', desc: '累计锻造 10 件装备',  test: s => (s.equipForged || 0) >= 10 },
  /* —— 历练 —— */
  { id: 'daily1',  name: '日日常新', title: '守日人', desc: '完成 1 局每日轮回', test: s => (s.dailyDone || 0) >= 1 },
  { id: 'weekly1', name: '七日之约', title: '应约者', desc: '完成 1 局每周异变', test: s => (s.weeklyDone || 0) >= 1 },
  { id: 'tut',     name: '初入幽冥', title: '新晋行者', desc: '完成新手引导',   test: s => s.tut === 1 },
];

const Ach = {
  fresh: [],   // 本局新达成（结算页展示后清空）

  check() {
    const s = Save.data;
    if (!s.ach) s.ach = {};
    let newly = 0;
    for (const a of ACHS) {
      if (s.ach[a.id]) continue;
      let ok = false;
      try { ok = !!a.test(s); } catch (e) { /* 单条异常不拖垮整体 */ }
      if (ok) {
        s.ach[a.id] = Date.now();
        this.fresh.push(a);
        newly++;
        HUD.toast(`成就达成 · ${a.name}（获称号「${a.title}」）`);
      }
    }
    if (newly) {
      if (!s.title) s.title = this.fresh[this.fresh.length - 1].id;   // 首个称号自动佩戴
      Save.write();
    }
    return newly;
  },

  of(id) { return ACHS.find(a => a.id === id) || null; },

  /* 佩戴/卸下称号（仅已达成条目可戴）；返回是否改变了状态 */
  toggleTitle(id) {
    const s = Save.data;
    if (!s.ach || !s.ach[id]) return false;
    s.title = s.title === id ? '' : id;
    Save.write();
    HUD.toast(s.title ? `已佩戴称号「${this.of(id).title}」` : '已卸下称号');
    return true;
  },

  current() { const s = Save.data; return s.title ? this.of(s.title) : null; },
  titleText() { const a = this.current(); return a ? a.title : ''; },
};
