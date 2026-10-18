/* 无尽专属事件：无尽征战每逢 CONFIG.endless.eventsEvery 波过波后弹一桩「幽冥异象」，
   二选一抉择（买卡/赌局/血月挑战/铁匠强化/祭坛换桃/甘霖/魂潮/求签）。
   与命运三选一同波撞车时排队待三选一选完再弹；待选期间导演不开下一波。 */
'use strict';

/* 事件池：choices 里 can() 为 false 的选项灰显不可点；bot(s) 是挂机托管的倾向分（大者优先） */
const ENDLESS_EVENTS = [
  {
    id: 'market', name: '妖市黑商', desc: '鬼影商队挑担而来：「过路的将军，看看货？」',
    choices: [
      { label: '花 60 桃买扩系字', hint: '毒/雷/冰/锤 随机一张 · Lv2',
        can: () => R.peaches >= 60 && R.rack.some(x => !x),
        bot: () => (R.peaches >= 180 && R.rack.some(x => !x) ? 60 : 20),
        run() { R.peaches -= 60; const ch = ['毒', '雷', '冰', '锤'][RNG.int(4)]; addRackChar(ch, 2); return `购得「${ch}」Lv2`; } },
      { label: '免费领一张白字', hint: '枪/棍/弓/营 随机一张 · Lv1',
        can: () => R.rack.some(x => !x),
        bot: () => (R.rack.some(x => !x) ? 50 : 0),
        run() { const ch = ['枪', '棍', '弓', '营'][RNG.int(4)]; addRackChar(ch, 1); return `领得「${ch}」Lv1`; } },
    ],
  },
  {
    id: 'gamble', name: '地藏赌局', desc: '地藏化身坐于道旁，指尖骰子明灭：「押一注？」',
    choices: [
      { label: '押 30 桃', hint: '五五开：赢了净赚 30，输了血本无归',
        can: () => R.peaches >= 30,
        bot: () => 10,
        run() { R.peaches -= 30; if (RNG.next() < 0.5) { R.peaches += 60; return '骰落成阳——桃子翻倍，净赚 30！'; } return '骰落成阴——30 桃打了水漂…'; } },
      { label: '袖手旁观', hint: '不赌，讨个彩头 +5 桃',
        can: () => true, bot: () => 50,
        run() { R.peaches += 5; return '地藏摇头一笑，掷给你 5 桃盘缠。'; } },
    ],
  },
  {
    id: 'bloodmoon', name: '血月凶兆', desc: '天穹赤月如瞳，鬼气百倍滋生——下一波将凶险异常。',
    choices: [
      { label: '迎战血月', hint: '下波敌军 HP +40% · 肃清后额外 +150 桃',
        can: () => true,
        bot: () => (R.hearts >= 3 ? 60 : 25),
        run() { R.eventBuff = { wave: R.wave + 1, hpMul: 1.4, bonus: 150 }; return '血色浸染战场，赏格已立：+150 桃！'; } },
      { label: '布幔遮月', hint: '以符布遮掩凶光 · +15 桃',
        can: () => true, bot: () => 45,
        run() { R.peaches += 15; return '符布展开，血芒敛去，落下 15 桃。'; } },
    ],
  },
  {
    id: 'smith', name: '游方铁匠', desc: '背着铁砧的老匠人路过营地：「替你开开锋，分文不取。」',
    choices: [
      { label: '重铸兵刃', hint: '随机一座塔攻击 +25%（本局永久）',
        can: () => R.towers.length > 0,
        bot: () => (R.towers.length ? 60 : 0),
        run() { const t = R.towers[RNG.int(R.towers.length)]; t.evAtk = (t.evAtk || 1) * 1.25; return `「${t.def.char}」兵刃重铸，攻击 +25%！`; } },
      { label: '调校机簧', hint: '随机一座塔攻速 +15%（本局永久）',
        can: () => R.towers.length > 0,
        bot: () => (R.towers.length ? 50 : 0),
        run() { const t = R.towers[RNG.int(R.towers.length)]; t.evRate = (t.evRate || 1) * 1.15; return `「${t.def.char}」机簧调校，攻速 +15%！`; } },
    ],
  },
  {
    id: 'altar', name: '残魂祭坛', desc: '荒祭坛上香火将熄，坛心传来低语：「以命换财，孰轻孰重？」',
    choices: [
      { label: '献祭心脉', hint: '心上限 -1 · +120 桃',
        can: () => R.heartsMax > 3 && R.hearts > 1,
        bot: () => (R.heartsMax >= 6 && R.hearts >= R.heartsMax - 1 ? 40 : 15),
        run() { R.heartsMax -= 1; R.hearts = Math.min(R.hearts, R.heartsMax); R.peaches += 120; return '一缕心脉没入坛中，换得 120 桃。'; } },
      { label: '叩首而退', hint: '不献祭 · +10 桃',
        can: () => true, bot: () => 50,
        run() { R.peaches += 10; return '你叩首三拜，坛中滚出 10 桃。'; } },
    ],
  },
  {
    id: 'rain', name: '天降甘霖', desc: '灵雨普降，草木疯长，军中灵气前所未有地充盈。',
    choices: [
      { label: '借势冲锋', hint: '下一波全军攻击 +20%',
        can: () => true, bot: () => 60,
        run() { R.eventBuff = { wave: R.wave + 1, atkMul: 1.2 }; return '全军士气如虹，下波攻击 +20%！'; } },
      { label: '囤积灵露', hint: '收灵露酿桃 · +60 桃',
        can: () => true, bot: () => 45,
        run() { R.peaches += 60; return '灵露入瓮，酿得 60 桃。'; } },
    ],
  },
  {
    id: 'tide', name: '魂潮异动', desc: '黄泉魂潮在地脉下翻涌，似可引之为用。',
    choices: [
      { label: '引魂缓行', hint: '下一波敌军减速 30%',
        can: () => true, bot: () => 60,
        run() { R.eventBuff = { wave: R.wave + 1, slow: 0.3 }; return '魂潮缠足，下波敌军减速 30%！'; } },
      { label: '炼魂成桃', hint: '凝魂炼桃 · +50 桃',
        can: () => true, bot: () => 45,
        run() { R.peaches += 50; return '魂气凝实，炼出 50 桃。'; } },
    ],
  },
  {
    id: 'monk', name: '云游高僧', desc: '高僧驻杖而立：「施主，求签问道，只选其一。」',
    choices: [
      { label: '求签', hint: '随机吉凶：财运 / 铲子 / 军威 / 空',
        can: () => true, bot: () => 35,
        run() {
          const r = RNG.next();
          if (r < 0.45) { R.peaches += 100; return '上上签·财运亨通：+100 桃！'; }
          if (r < 0.65) { R.shovelLeft++; return '中上签·开拓有功：铲子 +1！'; }
          if (r < 0.85) { R.eventBuff = { wave: R.wave + 1, rateMul: 1.25 }; return '中吉签·三军雷动：下波攻速 +25%！'; }
          return '下下签·万事皆空……什么也没发生。';
        } },
      { label: '问道', hint: '下一波过波奖励 ×3',
        can: () => true, bot: () => 55,
        run() { R.eventBuff = { wave: R.wave + 1, goldMul: 3 }; return '高僧指点迷津，下波奖励 ×3！'; } },
    ],
  },
];

function addRackChar(ch, lv) {
  const slot = R.rack.findIndex(x => !x);
  if (slot < 0) return false;
  R.rack[slot] = { type: 'char', ch, lv: lv || 1 };
  RackUI.refresh();
  return true;
}

const EndlessEvents = {
  pendingWave: 0,   // 与三选一撞车时排队（清波号）

  init() {
    const bar = document.getElementById('event-bar');
    if (!bar) return;
    bar.addEventListener('click', (e) => {
      const card = e.target.closest('.ev-choice');
      if (!card || !R.eventOffer) return;
      if (card.classList.contains('off')) return;
      this.pick(+card.dataset.i);
    });
    Bus.on('modPicked', () => { if (this.pendingWave) this.offer(); });
  },

  /* 清波后由 waveClear 调用：n % every === 0 时弹事件；三选一在弹则排队 */
  maybeOffer(n) {
    if (!R.endless || R.pvp) return;
    if (n < 12 || n % CONFIG.endless.eventsEvery !== 0) return;
    if (R.modOffer) { this.pendingWave = n; return; }   // 三选一选完（modPicked）再弹
    this.offer();
  },

  offer() {
    this.pendingWave = 0;
    // 最近 2 个事件不重复抽（保新鲜感；池子小也可整池翻完重来）
    let pool = ENDLESS_EVENTS.filter(e => !(this._recent || []).includes(e.id));
    if (!pool.length) pool = ENDLESS_EVENTS;
    const ev = pool[RNG.int(pool.length)];
    this._recent = (this._recent || []).concat(ev.id).slice(-2);
    R.eventOffer = ev.id;
    this.render();
    SFX.play('god');
    HUD.toast('幽冥异象 · 做出你的抉择');
  },

  render() {
    const bar = document.getElementById('event-bar');
    if (!bar) return;
    if (!R.eventOffer) { bar.classList.add('hidden'); bar.innerHTML = ''; return; }
    const ev = ENDLESS_EVENTS.find(e => e.id === R.eventOffer);
    if (!ev) { R.eventOffer = null; bar.classList.add('hidden'); bar.innerHTML = ''; return; }
    const cards = ev.choices.map((c, i) => {
      const ok = !!c.can();
      return `<div class="ev-choice${ok ? '' : ' off'}" data-i="${i}">` +
        `<div class="ev-label">${c.label}</div>` +
        `<div class="ev-hint">${c.hint}${ok ? '' : '（条件不足）'}</div>` +
        `</div>`;
    }).join('');
    bar.innerHTML = `<div class="mod-title">幽冥异象</div>` +
      `<div class="ev-head"><div class="ev-name">${ev.name}</div><div class="ev-desc">${ev.desc}</div></div>` +
      `<div class="ev-choices">${cards}</div>`;
    bar.classList.remove('hidden');
  },

  /* 选定第 i 项：应用并关闭 */
  pick(i) {
    if (!R.eventOffer) return false;
    const ev = ENDLESS_EVENTS.find(e => e.id === R.eventOffer);
    if (!ev || !ev.choices[i] || !ev.choices[i].can()) return false;
    const msg = ev.choices[i].run();
    R.eventOffer = null;
    this.render();
    HUD.refresh();
    SFX.play('talent');
    HUD.toast(msg);
    if (typeof RunSave !== 'undefined') RunSave.checkpoint();
    return true;
  },

  /* 挂机托管：按 bot 倾向分挑最高分的可选选项 */
  botPick() {
    const ev = ENDLESS_EVENTS.find(e => e.id === R.eventOffer);
    if (!ev) { R.eventOffer = null; this.render(); return false; }
    let bi = -1, bs = -Infinity;
    ev.choices.forEach((c, i) => {
      if (!c.can()) return;
      const s = c.bot ? c.bot() : 0;
      if (s > bs) { bs = s; bi = i; }
    });
    if (bi < 0) bi = ev.choices.findIndex(c => c.can());   // 兜底：首个可选项
    return bi >= 0 ? this.pick(bi) : false;
  },
};
