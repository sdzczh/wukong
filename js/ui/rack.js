/* 召唤架：抽字、架格渲染、拖拽幽灵、选中单位面板 */
'use strict';

const RackUI = {
  init() {
    this.rackEl = document.getElementById('rack');
    this.summonBtn = document.getElementById('btn-summon');
    this.shovelBtn = document.getElementById('btn-shovel');
    this.selPanel = document.getElementById('sel-panel');
    this.itemPanel = document.getElementById('item-panel');
    this.draftBar = document.getElementById('draft-bar');
    this.ghost = document.getElementById('drag-ghost');
    this.stageEl = document.getElementById('stage');

    this.summonBtn.addEventListener('click', () => { SFX.ensure(); this.doSummon(); });
    // 铲子：短按=开垦/取消；无铲时短按=花桃补铲；长按 0.52s=随时补铲
    let shovelHold = null;
    const cancelHold = () => { if (shovelHold) { clearTimeout(shovelHold); shovelHold = null; } };
    this.shovelBtn.addEventListener('pointerdown', () => {
      this._shovelHoldBuy = false;
      cancelHold();
      shovelHold = setTimeout(() => { shovelHold = null; this._shovelHoldBuy = true; this.buyShovel(); }, 520);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev =>
      this.shovelBtn.addEventListener(ev, cancelHold));
    this.shovelBtn.addEventListener('click', () => {
      SFX.ensure();
      if (this._shovelHoldBuy) { this._shovelHoldBuy = false; return; } // 长按已补铲，吞掉收尾点击
      SFX.play('click');
      if (R.shovelLeft <= 0) { this.buyShovel(); return; }              // 无铲：短按即补
      R.tool = R.tool === 'shovel' ? null : 'shovel';
      if (R.tool === 'shovel') { R.armedSlot = -1; HUD.toast('点「封」字地块开垦；点单位铲回架子'); }
      this.refresh();
    });

    // 选牌条：点卡入架，刷新重 roll 本轮，✕ 放弃整轮
    this.draftBar.addEventListener('click', e => {
      const card = e.target.closest('.draft-card');
      if (card) { SFX.ensure(); this.pickDraft(+card.dataset.i); }
    });
    this.draftBar.querySelector('.draft-refresh').addEventListener('click', () => { SFX.ensure(); this.refreshDraft(); });
    this.draftBar.querySelector('.draft-x').addEventListener('click', () => { SFX.play('click'); this.discardDraft(); });

    this.buildSlots();
  },

  /* 补铲价 = base + step × 当局已补数 */
  shovelBuyCost() {
    const cfg = CONFIG.peachSink.shovel;
    return cfg.base + cfg.step * (R.shovelBuys || 0);
  },

  /* 花桃补 1 把铲（无铲短按 / 长按 0.52s） */
  buyShovel() {
    if (R.state !== 'battle') return false;
    const cost = this.shovelBuyCost();
    if (R.peaches < cost) { HUD.toast(`补铲需 ${cost} 桃，蟠桃不足`); SFX.play('click'); return false; }
    R.peaches -= cost;
    R.shovelBuys++;
    R.shovelLeft++;
    SFX.play('coin');
    HUD.toast(`瑶池补铲 +1（现有 ${R.shovelLeft} 把）· 下一把 ${this.shovelBuyCost()} 桃`);
    HUD.refresh();
    return true;
  },

  /* 3 桃重 roll 当前 5 张（不动保底计数） */
  refreshDraft() {
    if (!R.draft || !R.draft.length) return;
    const cost = CONFIG.summon.refreshCost;
    if (R.peaches < cost) { HUD.toast('蟠桃不足'); SFX.play('click'); return; }
    R.peaches -= cost;
    const godSet = this._godSet();
    R.draft = [];
    for (let i = 0; i < CONFIG.summon.draftSize; i++) R.draft.push(this._rollDraftCard(godSet));
    SFX.play('summon');
    this.renderDraft();
    HUD.refresh();
  },

  /* ---------- 召唤 ---------- */
  summonCost() {
    const rule = R.rules ? R.rules.summonCostDelta : 0;
    return Math.max(5, CONFIG.summon.base + CONFIG.summon.step * R.summonsDone - Talents.summonDiscount() + rule);
  },

  /* 神将字集合（两两配对） */
  _godSet() {
    if (!this.__godSet) {
      const s = new Set();
      for (const two in CONFIG.pairs) { s.add(two[0]); s.add(two[1]); }
      this.__godSet = s;
    }
    return this.__godSet;
  },

  /* 单张卡：神将字恒 Lv1；普通字随波次概率出 Lv2/Lv3（自走棋式） */
  _rollDraftCard(godSet) {
    const godChance = CONFIG.summon.godChance + Talents.godChanceBonus() + (R.rules ? R.rules.godChanceAdd : 0);
    const ch = RNG.next() < godChance
      ? RNG.pickWeighted(this._godWeights())
      : RNG.pickWeighted(Object.entries(CONFIG.normalCharWeights));
    let lv = 1;
    if (!godSet.has(ch)) {
      const cl = CONFIG.summon.cardLv;
      const w3 = Math.min(cl.lv3Cap, Math.max(0, (R.wave - cl.lv3From) * cl.lv3Step));
      const w2 = Math.min(cl.lv2Cap, Math.max(0, (R.wave - cl.lv2From) * cl.lv2Step));
      const roll = RNG.next();
      if (roll < w3) lv = 3;
      else if (roll < w3 + w2) lv = 2;
      lv = Math.min(lv, cl.maxCardLv);
    }
    return { ch, lv };
  },

  rollChar() {
    const godChance = CONFIG.summon.godChance + Talents.godChanceBonus();
    const pityAfter = CONFIG.summon.pityAfter - Talents.pityDelta();
    const isGod = R.pityMiss >= pityAfter ? true : RNG.next() < godChance;
    let ch;
    if (isGod) {
      ch = RNG.pickWeighted(this._godWeights());
      R.pityMiss = 0;
    } else {
      ch = RNG.pickWeighted(Object.entries(CONFIG.normalCharWeights));
      R.pityMiss++;
    }
    return ch;
  },

  /* 缘引：已持某对字的一半时，另一半权重 ×4，避免神将字久合不成 */
  _godWeights() {
    const owned = new Set();
    for (const it of R.rack) if (it && it.type === 'char' && !CONFIG.charToTower[it.ch]) owned.add(it.ch);
    for (const t of R.towers) {
      if (t.key.startsWith('ling:')) owned.add(t.def.char);
      else if (t.isGeneral) for (const c of t.def.char) owned.add(c);
    }
    const boost = {};
    for (const pair in CONFIG.pairs) {
      const [a, b] = [pair[0], pair[1]];
      if (owned.has(a) && !owned.has(b)) boost[b] = (boost[b] || 1) * 4;
      if (owned.has(b) && !owned.has(a)) boost[a] = (boost[a] || 1) * 4;
    }
    return Object.entries(CONFIG.godCharWeights).map(([ch, w]) => [ch, w * (boost[ch] || 1)]);
  },

  /* 一次召唤：弹出 draftSize 张卡供点选，未选的再召唤时作废 */
  doSummon() {
    if (R.state !== 'battle') return;
    const slot = R.rack.findIndex(x => !x);
    if (slot < 0) { HUD.toast('架子满了，先摆放或合成'); return; }
    const cost = this.summonCost();
    if (R.peaches < cost) { HUD.toast('蟠桃不足'); SFX.play('click'); return; }
    R.peaches -= cost;
    R.summonsDone++;

    const godSet = this._godSet();
    const cards = [];
    for (let i = 0; i < CONFIG.summon.draftSize; i++) cards.push(this._rollDraftCard(godSet));
    // 整轮保底：本轮全无神将字记一次 miss，达阈值强制替换一张
    const pityAfter = CONFIG.summon.pityAfter - Talents.pityDelta();
    if (cards.some(c => godSet.has(c.ch))) {
      R.pityMiss = 0;
    } else {
      R.pityMiss++;
      if (R.pityMiss >= pityAfter) {
        cards[RNG.int(cards.length)] = { ch: RNG.pickWeighted(this._godWeights()), lv: 1 };
        R.pityMiss = 0;
        HUD.toast('缘分天定 · 必出神将字');
      }
    }
    R.draft = cards;   // 直接覆盖旧一轮，未领取的自动作废

    SFX.play(cards.some(c => godSet.has(c.ch)) ? 'god' : 'summon');
    this.hideSel();
    this.refresh();
    this.renderDraft();
    HUD.refresh();
  },

  /* 点选第 i 张卡入架；架满则本轮剩余自动作废 */
  pickDraft(i) {
    if (!R.draft || !R.draft[i]) return;
    const slot = R.rack.findIndex(x => !x);
    if (slot < 0) { HUD.toast('架子满了'); return; }
    const d = R.draft.splice(i, 1)[0];
    R.rack[slot] = { type: 'char', ch: d.ch, lv: d.lv };
    Merge.unlockChar(d.ch);
    Merge.recordChar(d.ch, d.lv);
    SFX.play('place');
    if (R.rack.every(x => x)) {
      R.draft = null;
      HUD.toast('召唤架已满，剩余卡牌已散');
    }
    this.refresh();
    this.renderDraft();
    HUD.refresh();
  },

  discardDraft() {
    R.draft = null;
    this.renderDraft();
  },

  renderDraft() {
    if (!this.draftBar) return;
    if (!R.draft || R.draft.length === 0 || R.state !== 'battle') {
      this.draftBar.classList.add('hidden');
      GearUI.refresh();   // 选牌收起：装备栏按开合态恢复（原先依赖掉落事件才恢复）
      return;
    }
    this.draftBar.classList.remove('hidden');
    const godSet = this._godSet();
    this.draftBar.querySelector('.draft-cards').innerHTML = R.draft.map((d, i) => {
      const isGod = godSet.has(d.ch);
      const lvTxt = d.lv > 1 ? `<span class="dlv">Lv${d.lv}</span>` : '';
      const hint = isGod ? this._pairHintText(d.ch) : '';
      return `<div class="draft-card${isGod ? ' god' : ''}" data-i="${i}">` +
        `<span class="dchar" style="color:${isGod ? '#7a6fd0' : '#4a3b52'}">${d.ch}</span>${lvTxt}${hint}</div>`;
    }).join('');
    // 刷新按钮可用态
    const rf = this.draftBar.querySelector('.draft-refresh');
    rf.textContent = `刷新 ${CONFIG.summon.refreshCost}桃`;
    rf.classList.toggle('disabled', R.peaches < CONFIG.summon.refreshCost);
    GearUI.refresh();   // 选牌条开合时装备栏让位/恢复
  },

  /* 神将字的配对字（如 悟 → 空） */
  _pairOf(ch) {
    for (const two in CONFIG.pairs) if (two.includes(ch)) return two.replace(ch, '');
    return '';
  },

  /* 神将字的配对提示（如 悟 → 配「空」） */
  _pairHintText(ch) {
    const p = this._pairOf(ch);
    return p ? `<span class="dpair">配「${p}」</span>` : '';
  },

  /* ---------- 架子物品面板（长按架子格）：出售字卡 / 献祭神将字 ---------- */
  showItemPanel(slot) {
    const item = R.rack[slot];
    if (!item) return;
    this.hideSel();
    R.armedSlot = -1;
    if (item.type === 'unit') {
      const u = item.unit;
      this.itemPanel.innerHTML =
        `<div class="sel-head"><span class="sel-char" style="color:${u.def.color || '#4a3b52'}">${u.def.char}</span>` +
        `<span class="sel-name">${u.def.name}</span><span class="sel-lv">Lv.${u.level}</span>` +
        (u.isGeneral && u.star > 0 ? `<span class="sel-star${u.starMaxed ? ' maxed' : ''}">${'★'.repeat(u.star)}${'☆'.repeat(CONFIG.generalStars.max - u.star)}</span>` : '') +
        `<button class="sel-close">×</button></div>` +
        `<div class="sel-body">已铲回架子的单位，拖到棋盘可继续作战${u.isGeneral ? '；拖到同名神将上可升星' : ''}</div>` +
        `<button class="item-sell">出售 +${Merge.sellValue(u)} 桃</button>`;
      this.itemPanel.querySelector('.item-sell').addEventListener('click', () => {
        R.peaches += Merge.sellValue(u);
        R.rack[slot] = null;
        SFX.play('sell');
        this.hideItemPanel(); this.refresh(); HUD.refresh();
      });
    } else {
      const lv = item.lv || 1;
      const isGod = !CONFIG.charToTower[item.ch];
      const towerName = isGod ? '' : CONFIG.towers[CONFIG.charToTower[item.ch]].name;
      // 献祭目标：棋盘上已唤醒的配对神将
      let feedTarget = null;
      if (isGod) {
        for (const t of R.towers) {
          if (t.isGeneral && t.def.pair && t.def.pair.includes(item.ch)) { feedTarget = t; break; }
        }
      }
      const body = isGod
        ? `神将字 · 与「${this._pairOf(item.ch)}」凑对唤醒神将，或拖出棋盘成灵字塔`
        : `${towerName}字卡 · 放到棋盘即成 ${towerName} Lv${lv}`;
      const sellVal = CONFIG.summon.sellBase + lv + R.mods.sell * CONFIG.waveMods.steps.sell;
      this.itemPanel.innerHTML =
        `<div class="sel-head"><span class="sel-char" style="color:${isGod ? '#7a4e86' : '#4a3b52'}">${item.ch}</span>` +
        `<span class="sel-name">${isGod ? '神将字' : towerName + '字卡'}</span><span class="sel-lv">Lv.${lv}</span>` +
        `<button class="sel-close">×</button></div>` +
        `<div class="sel-body"><div>${body}</div></div>` +
        (feedTarget ? `<button class="item-feed">献祭给${feedTarget.def.name}　经验 +${CONFIG.summon.sacrificeExp}</button>` : '') +
        `<button class="item-sell">出售 +${sellVal} 桃</button>`;
      this.itemPanel.querySelector('.item-sell').addEventListener('click', () => {
        R.peaches += sellVal;
        R.rack[slot] = null;
        SFX.play('sell');
        this.hideItemPanel(); this.refresh(); HUD.refresh();
      });
      const feedBtn = this.itemPanel.querySelector('.item-feed');
      if (feedBtn) feedBtn.addEventListener('click', () => {
        R.rack[slot] = null;
        feedTarget.gainExp(CONFIG.summon.sacrificeExp);
        FX.ring(feedTarget.x, feedTarget.y, Grid.tile * 0.8, '#9a6fd0');
        FX.float('+' + CONFIG.summon.sacrificeExp + ' 经验', feedTarget.x, feedTarget.y - Grid.tile * 0.6, '#c9a2ff', 15);
        SFX.play('merge');
        this.hideItemPanel(); this.refresh(); HUD.refresh();
      });
    }
    this.itemPanel.querySelector('.sel-close').addEventListener('click', () => { SFX.play('click'); this.hideItemPanel(); });
    this.itemPanel.classList.remove('hidden');
    this.refresh();
  },

  hideItemPanel() { if (this.itemPanel) this.itemPanel.classList.add('hidden'); },

  /* 开局免费发字 */
  dealStartChars() {
    for (let i = 0; i < CONFIG.summon.startChars; i++) {
      const slot = R.rack.findIndex(x => !x);
      if (slot < 0) break;
      const ch = this.rollChar();
      R.rack[slot] = { type: 'char', ch };
      Merge.unlockChar(ch);
      Merge.recordChar(ch, 1);
    }
  },

  /* ---------- 架子渲染 ---------- */
  buildSlots() {
    this.rackEl.innerHTML = '';
    this.slotEls = [];
    for (let i = 0; i < CONFIG.summon.rackSize; i++) {
      const el = document.createElement('div');
      el.className = 'slot empty';
      el.dataset.slot = i;
      el.addEventListener('pointerdown', e => Input.slotDown(i, e));
      this.rackEl.appendChild(el);
      this.slotEls.push(el);
    }
  },

  itemLabel(item) {
    if (!item) return '';
    if (item.type === 'char') return item.ch;
    return item.unit.def.char;
  },
  itemIsGod(item) {
    if (!item) return false;
    if (item.type === 'char') return !CONFIG.charToTower[item.ch];
    return item.unit.isGeneral || String(item.unit.key).startsWith('ling:');
  },
  /* 场上或架上是否有可合成目标（同字同级/同级同名神将/神将字配对）→ 高亮架子卡 */
  canMerge(slot) {
    if (!R.rack[slot]) return false;
    return !!Input.findMergeTarget(slot) || Input.findRackMergeTarget(slot) >= 0;
  },

  refresh() {
    if (!this.slotEls) return;
    for (let i = 0; i < this.slotEls.length; i++) {
      const el = this.slotEls[i], item = R.rack[i];
      el.className = 'slot' + (item ? ' filled' : ' empty') +
        (this.itemIsGod(item) ? ' god' : '') +
        (R.armedSlot === i ? ' armed' : '') +
        (item && this.canMerge(i) ? ' can-merge' : '');
      if (!item) { el.innerHTML = ''; continue; }
      let badge = '';
      if (item.type === 'unit') {
        const u = item.unit;
        if (u.level > 1) badge = `<span class="lv">${u.level}</span>`;
        if (u.isGeneral && u.star > 0) badge += `<span class="st${u.starMaxed ? ' maxed' : ''}">${'★'.repeat(u.star)}</span>`;
      } else if (item.lv > 1) {
        badge = `<span class="lv">${item.lv}</span>`;
      }
      el.innerHTML = `<span class="ch">${this.itemLabel(item)}</span>${badge}`;
    }
    // 召唤按钮
    const cost = this.summonCost();
    const full = R.rack.every(x => x);
    this.summonBtn.querySelector('.sum-cost').textContent = cost + ' 桃';
    this.summonBtn.classList.toggle('disabled', full || R.peaches < cost || R.state !== 'battle');
    this.summonBtn.querySelector('.sum-label').textContent = full ? '架子满' : '召 唤';
    // 铲子：无铲时进补铲模式（短按即买）；有铲短按开垦、长按随时补铲
    const shovelCost = this.shovelBuyCost();
    const canBuy = R.state === 'battle' && R.peaches >= shovelCost;
    this.shovelBtn.querySelector('.tname').textContent = R.shovelLeft > 0 ? '×' + R.shovelLeft : '补 1 把';
    this.shovelBtn.querySelector('.tbuy').textContent = shovelCost + ' 桃';
    this.shovelBtn.classList.toggle('disabled', R.shovelLeft <= 0 ? !canBuy : R.state !== 'battle');
    this.shovelBtn.classList.toggle('active', R.tool === 'shovel');
    this.shovelBtn.classList.toggle('buy-mode', R.shovelLeft <= 0 && R.state === 'battle');
    // 首次用完铲给一次教学提示
    if (R.shovelLeft <= 0 && this._lastShovelN > 0 && !R.shovelTaught) {
      R.shovelTaught = true;
      HUD.toast(`铲子用完了 · 点铲子按钮或长按花 ${shovelCost} 桃补一把`);
    }
    this._lastShovelN = R.shovelLeft;
  },

  /* 合成完成：槽位弹跳一下（金框动画；refresh 重写 className 后调用方须在其后再闪） */
  flashSlot(i) {
    const el = this.slotEls && this.slotEls[i];
    if (!el) return;
    el.classList.remove('just-merged');
    void el.offsetWidth;   // 强制重排以重启动画
    el.classList.add('just-merged');
    setTimeout(() => el.classList.remove('just-merged'), 650);
  },

  /* ---------- 拖拽幽灵 ---------- */
  showGhost(text, isGod) {
    this.ghost.textContent = text;
    this.ghost.className = isGod ? 'god' : '';
    this.ghost.classList.remove('hidden');
  },
  /* 幽灵在缩放舞台内，需把屏幕坐标换算回舞台逻辑坐标 */
  moveGhost(x, y) {
    const rect = this.stageEl.getBoundingClientRect();
    const k = rect.width / CONFIG.logicalW;
    this.ghost.style.left = ((x - rect.left) / k) + 'px';
    this.ghost.style.top = ((y - rect.top) / k) + 'px';
  },
  hideGhost() { this.ghost.classList.add('hidden'); },

  /* ---------- 选中单位面板 ---------- */
  showSel(t) {
    R.selected = t;
    const d = t.def;
    const rows = [];
    // 神将星标：★★☆（满星金亮）
    const starHtml = t.isGeneral
      ? `<span class="sel-star${t.starMaxed ? ' maxed' : ''}">${'★'.repeat(t.star)}${'☆'.repeat(CONFIG.generalStars.max - t.star)}</span>`
      : '';
    if (d.kind === 'aura') {
      const rate = Math.round((d.auraRate + (d.auraLvStep || 0) * (t.level - 1)) * 100);
      rows.push(`战鼓：周围 ${(t.rangePx / Grid.tile).toFixed(1)} 格友塔攻速 +${rate}%`);
    } else {
      rows.push(`攻击 ${t.atk}　攻速 ${d.rate}/s　射程 ${(t.rangePx / Grid.tile).toFixed(1)} 格`);
    }
    if (t.isGeneral) {
      const st = t.skillT <= 0 ? '✦ 就绪' : `冷却 ${Math.max(0, t.skillT).toFixed(1)}s`;
      rows.push(`经验 ${t.exp}/${t.expNeed}${t.level >= t.maxLevel ? '（已满级）' : ''}`);
      rows.push(`技能 · ${d.skill.name}（${st}）：${d.skill.desc}`);
      if (t.star > 0) rows.push(`星威 ★${t.star}：攻击 +${t.star * 8}% · 技能效果 +${t.star * 15}%`);
      const s3 = d.star3;
      rows.push(t.starMaxed
        ? `<span class="sel-passive">满星被动 · ${s3.name}：${s3.desc}</span>`
        : `<span class="sel-passive-locked">满星 ★★★ 解锁被动「${s3.name}」：${s3.desc}</span>`);
      const mu = Mastery.uses(t.key), mt = Mastery.tierOf(t.key);
      rows.push(`熟练 ${mt > 0 ? `Lv${mt} · ${CONFIG.mastery.names[mt - 1]}` : '尚未入门'}（上场 ${mu} 次）`);
    }
    if (t.gear) {
      const f = CONFIG.gear.families[t.gear.fam];
      const v = Math.round(f.per[t.gear.lv - 1] * 100);
      const txt = f.stat === 'cdMul' ? `技冷却 -${v}%` : `${GearUI.statLabel[f.stat]} +${v}%`;
      rows.push(`装备 · ${f.name} Lv${t.gear.lv}（${txt}）`);
    }
    if (t.isGeneral) {
      const sg = CONFIG.sigGear[t.key], slv = t.sigLv;
      if (slv > 0) {
        rows.push(`<span class="sel-sig" style="color:${sg.color}">专属 · ${sg.name} Lv${slv}：${sg.desc.replace('{v}', Gear.sigStatPct(t.key, slv))}</span>`);
      } else {
        rows.push(`<span class="sel-sig-locked">专属 · ${sg.name} 未铸（boss 掉 3 碎片，装备库合成）</span>`);
      }
    }
    if (d.pairHint) rows.push(`与「${d.pairHint.with}」合成 ${d.pairHint.general}`);
    if (d.desc) rows.push(d.desc);

    // 二选一进阶（毒/雷/冰/锤 达 Lv3 开放，花费蟠桃，择一路不可更改）
    let advRow = '';
    const advSet = !t.isGeneral && CONFIG.advances && CONFIG.advances[t.key];
    if (advSet && t.adv) {
      const a = t.advDef();
      advRow = `<div class="sel-adv-done"><span class="sel-adv-name" style="color:${d.color}">${a.name}</span><span class="sel-adv-desc">${a.desc}</span></div>`;
    } else if (advSet && t.level >= 3) {
      const afford = R.peaches >= CONFIG.advances.cost;
      advRow =
        `<div class="sel-adv-row">` +
        ['a', 'b'].map(k =>
          `<button class="sel-adv" data-adv="${k}"><span class="sel-adv-name" style="color:${d.color}">${advSet[k].name}</span><span class="sel-adv-desc">${advSet[k].desc}</span></button>`).join('') +
        `</div>` +
        `<div class="sel-adv-cost${afford ? '' : ' no'}">进阶花费 ${CONFIG.advances.cost} 蟠桃 · 择一路不可更改${afford ? '' : '（蟠桃不足）'}</div>`;
    } else if (advSet) {
      advRow = `<div class="sel-adv-cost">升至 Lv3 可二选一进阶</div>`;
    }

    // 索敌模式行（光环塔不攻击，不显示）
    const modeRow = d.kind === 'aura' ? '' :
      `<div class="sel-mode-row"><span class="sm-label">索敌</span>` +
      ['first', 'near', 'strong', 'last'].map(m =>
        `<button class="sel-mode${t.mode === m ? ' on' : ''}" data-mode="${m}">${Tower.modeName[m]}</button>`).join('') +
      `</div>`;
    // 本塔伤害统计行
    const st = R.dmgStats[t.tid];
    const dmgRow = st && st.dmg > 0 ? `<div class="sel-dmg">本局伤害 ${Math.round(st.dmg)}</div>` : '';

    this.selPanel.innerHTML =
      `<div class="sel-head"><span class="sel-char" style="color:${d.color || '#4a3b52'}">${d.char}</span>` +
      `<span class="sel-name">${d.name}</span><span class="sel-lv">Lv.${t.level}</span>` + starHtml +
      (d.rarity ? `<span class="sel-rarity" style="background:${CONFIG.rarityColors[d.rarity]}">${d.rarity}</span>` : '') +
      `<button class="sel-close">×</button></div>` +
      `<div class="sel-body">${rows.map(s => `<div>${s}</div>`).join('')}</div>` +
      advRow + dmgRow + modeRow +
      (t.gear ? `<button class="sel-gear-off">卸下 ${Gear.equipName(t.gear)}</button>` : '') +
      `<button class="sel-sell">出售 +${Merge.sellValue(t)} 桃</button>`;
    this.selPanel.classList.remove('hidden');
    this.selPanel.querySelector('.sel-close').addEventListener('click', () => { SFX.play('click'); this.hideSel(); });
    this.selPanel.querySelectorAll('.sel-adv').forEach(btn => btn.addEventListener('click', () => {
      if (R.peaches < CONFIG.advances.cost) { HUD.toast(`进阶需 ${CONFIG.advances.cost} 桃，蟠桃不足`); SFX.play('click'); return; }
      R.peaches -= CONFIG.advances.cost;
      t.adv = btn.dataset.adv;
      const a = t.advDef();
      FX.ring(t.x, t.y, Grid.tile * 0.9, '#ffd867', { life: 0.6, width: 4, grow: 40 });
      FX.float(a.name + '！', t.x, t.y - Grid.tile * 0.8, '#ffd867', 18);
      SFX.play('merge');
      HUD.refresh();
      this.showSel(t);
    }));
    const offBtn = this.selPanel.querySelector('.sel-gear-off');
    if (offBtn) offBtn.addEventListener('click', () => { Gear.unequip(t); this.showSel(t); });
    this.selPanel.querySelectorAll('.sel-mode').forEach(btn => btn.addEventListener('click', () => {
      t.mode = btn.dataset.mode;
      SFX.play('click');
      this.showSel(t);   // 重渲染高亮
    }));
    this.selPanel.querySelector('.sel-sell').addEventListener('click', () => this.sellSelected());
  },

  hideSel() {
    R.selected = null;
    this.selPanel.classList.add('hidden');
    this.hideItemPanel();
  },

  sellSelected() {
    const t = R.selected;
    if (!t) { this.hideSel(); return; }
    const v = Merge.sellValue(t);
    R.peaches += v;
    if (t.gear) { R.equips.push(t.gear); t.gear = null; GearUI.refresh(); }   // 装备回库不丢失
    FX.float('+' + v + ' 桃', t.x, t.y - Grid.tile * 0.4, '#ffd867', 15);
    Merge.removeUnit(t);
    SFX.play('sell');
    this.hideSel();
    HUD.refresh();
  },
};
