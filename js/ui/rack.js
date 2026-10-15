/* 召唤架：抽字、架格渲染、拖拽幽灵、选中单位面板 */
'use strict';

const RackUI = {
  init() {
    this.rackEl = document.getElementById('rack');
    this.summonBtn = document.getElementById('btn-summon');
    this.shovelBtn = document.getElementById('btn-shovel');
    this.selPanel = document.getElementById('sel-panel');
    this.ghost = document.getElementById('drag-ghost');

    this.summonBtn.addEventListener('click', () => { SFX.ensure(); this.doSummon(); });
    this.shovelBtn.addEventListener('click', () => {
      SFX.ensure(); SFX.play('click');
      R.tool = R.tool === 'shovel' ? null : 'shovel';
      if (R.tool === 'shovel') { R.armedSlot = -1; HUD.toast('点选棋盘上单位，将其铲回架子'); }
      this.refresh();
    });

    this.buildSlots();
  },

  /* ---------- 召唤 ---------- */
  summonCost() {
    return Math.max(5, CONFIG.summon.base + CONFIG.summon.step * R.summonsDone - Talents.summonDiscount());
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

  doSummon() {
    if (R.state !== 'battle') return;
    const slot = R.rack.findIndex(x => !x);
    if (slot < 0) { HUD.toast('架子满了，先摆放或合成'); return; }
    const cost = this.summonCost();
    if (R.peaches < cost) { HUD.toast('蟠桃不足'); SFX.play('click'); return; }
    R.peaches -= cost;
    R.summonsDone++;
    const ch = this.rollChar();
    const isGod = !CONFIG.charToTower[ch];
    R.rack[slot] = { type: 'char', ch };
    Merge.unlockChar(ch);
    SFX.play(isGod ? 'god' : 'summon');
    if (isGod) HUD.toast(`抽到神将字「${ch}」！`);
    this.refresh();
    HUD.refresh();
  },

  /* 开局免费发字 */
  dealStartChars() {
    for (let i = 0; i < CONFIG.summon.startChars; i++) {
      const slot = R.rack.findIndex(x => !x);
      if (slot < 0) break;
      const ch = this.rollChar();
      R.rack[slot] = { type: 'char', ch };
      Merge.unlockChar(ch);
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

  refresh() {
    if (!this.slotEls) return;
    for (let i = 0; i < this.slotEls.length; i++) {
      const el = this.slotEls[i], item = R.rack[i];
      el.className = 'slot' + (item ? ' filled' : ' empty') +
        (this.itemIsGod(item) ? ' god' : '') +
        (R.armedSlot === i ? ' armed' : '');
      if (!item) { el.innerHTML = ''; continue; }
      let badge = '';
      if (item.type === 'unit') {
        const u = item.unit;
        if (u.level > 1) badge = `<span class="lv">${u.level}</span>`;
      }
      el.innerHTML = `<span class="ch">${this.itemLabel(item)}</span>${badge}`;
    }
    // 召唤按钮
    const cost = this.summonCost();
    const full = R.rack.every(x => x);
    this.summonBtn.querySelector('.sum-cost').textContent = cost + ' 桃';
    this.summonBtn.classList.toggle('disabled', full || R.peaches < cost || R.state !== 'battle');
    this.summonBtn.querySelector('.sum-label').textContent = full ? '架子满' : '召 唤';
    // 铲子
    this.shovelBtn.querySelector('.tname').textContent = '×' + R.shovelLeft;
    this.shovelBtn.classList.toggle('disabled', R.shovelLeft <= 0 || R.state !== 'battle');
    this.shovelBtn.classList.toggle('active', R.tool === 'shovel');
  },

  /* ---------- 拖拽幽灵 ---------- */
  showGhost(text, isGod) {
    this.ghost.textContent = text;
    this.ghost.className = isGod ? 'god' : '';
    this.ghost.classList.remove('hidden');
  },
  moveGhost(x, y) {
    this.ghost.style.left = x + 'px';
    this.ghost.style.top = y + 'px';
  },
  hideGhost() { this.ghost.classList.add('hidden'); },

  /* ---------- 选中单位面板 ---------- */
  showSel(t) {
    R.selected = t;
    const d = t.def;
    const rows = [];
    if (d.kind === 'aura') {
      rows.push(`战鼓：周围友塔攻速 +${Math.round(d.auraRate * 100)}%`);
    } else {
      rows.push(`攻击 ${t.atk}　攻速 ${d.rate}/s　射程 ${(t.rangePx / Grid.tile).toFixed(1)} 格`);
    }
    if (t.isGeneral) {
      const st = t.skillT <= 0 ? '✦ 就绪' : `冷却 ${Math.max(0, t.skillT).toFixed(1)}s`;
      rows.push(`经验 ${t.exp}/10${t.level >= t.maxLevel ? '（已满级）' : ''}`);
      rows.push(`技能 · ${d.skill.name}（${st}）：${d.skill.desc}`);
    }
    if (d.pairHint) rows.push(`与「${d.pairHint.with}」合成 ${d.pairHint.general}`);
    if (d.desc) rows.push(d.desc);

    this.selPanel.innerHTML =
      `<div class="sel-head"><span class="sel-char" style="color:${d.color || '#4a3b52'}">${d.char}</span>` +
      `<span class="sel-name">${d.name}</span><span class="sel-lv">Lv.${t.level}</span>` +
      (d.rarity ? `<span class="sel-rarity" style="background:${CONFIG.rarityColors[d.rarity]}">${d.rarity}</span>` : '') +
      `<button class="sel-close">×</button></div>` +
      `<div class="sel-body">${rows.map(s => `<div>${s}</div>`).join('')}</div>` +
      `<button class="sel-sell">出售 +${Merge.sellValue(t)} 桃</button>`;
    this.selPanel.classList.remove('hidden');
    this.selPanel.querySelector('.sel-close').addEventListener('click', () => { SFX.play('click'); this.hideSel(); });
    this.selPanel.querySelector('.sel-sell').addEventListener('click', () => this.sellSelected());
  },

  hideSel() {
    R.selected = null;
    this.selPanel.classList.add('hidden');
  },

  sellSelected() {
    const t = R.selected;
    if (!t) { this.hideSel(); return; }
    const v = Merge.sellValue(t);
    R.peaches += v;
    FX.float('+' + v + ' 桃', t.x, t.y - Grid.tile * 0.4, '#ffd867', 15);
    Merge.removeUnit(t);
    SFX.play('sell');
    this.hideSel();
    HUD.refresh();
  },
};
