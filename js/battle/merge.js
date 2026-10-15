/* 合成与摆放：字 → 塔、字+字 → 神将、升级/换位/回架/出售 */
'use strict';

const Merge = {

  /* 字符 → 塔 key（普通字走 charToTower，神将字返回灵字 key） */
  towerKeyOfChar(ch) {
    return CONFIG.charToTower[ch] || ('ling:' + ch);
  },

  /* 灵字塔动态 def（基于 godCharBase），返回可用的 key */
  lingKey(ch) {
    const k = 'ling:' + ch;
    if (!CONFIG.towers[k]) {
      CONFIG.towers[k] = Object.assign({}, CONFIG.godCharBase, {
        char: ch, name: '灵字·' + ch, color: '#7a6fd0', cardBg: '#efe6f6',
        pairHint: Merge.pairHintOf(ch),
      });
    }
    return k;
  },

  /* 该神将字的配对信息（用于详情展示） */
  pairHintOf(ch) {
    for (const two in CONFIG.pairs) {
      if (two.includes(ch)) {
        const d = CONFIG.towers[CONFIG.pairs[two]];
        if (d) return { with: two.replace(ch, ''), general: d.name, key: CONFIG.pairs[two] };
      }
    }
    return null;
  },

  /* 在 (col,row) 创建单位并登记棋盘。
     spec: 'bow' 等普通 key | 'ling:悟' | 'wukong' 神将 key | Tower/General 实例（移动用） */
  makeUnit(spec, col, row) {
    let u;
    if (spec instanceof Tower) {
      u = spec; u.col = col; u.row = row;
      const p = Grid.center(col, row); u.x = p.x; u.y = p.y;
    } else if (spec.startsWith('ling:')) {
      u = new Tower(Merge.lingKey(spec.slice(5)), col, row);
    } else if (CONFIG.towers[spec] && CONFIG.towers[spec].general) {
      u = new General(spec, col, row);
    } else {
      u = new Tower(spec, col, row);
    }
    Grid.tiles[row][col].tower = u;
    R.towers.push(u);
    if (u.isGeneral) Gear.onGeneralBorn(u);   // 局外专属随身提示
    return u;
  },

  removeUnit(u) {
    const i = R.towers.indexOf(u);
    if (i >= 0) R.towers.splice(i, 1);
    if (Grid.inBounds(u.col, u.row) && Grid.tiles[u.row][u.col].tower === u) {
      Grid.tiles[u.row][u.col].tower = null;
    }
    if (R.selected === u) { R.selected = null; RackUI.hideSel(); }
  },

  /* 判定 aChar/aLevel（拖动方的字/单位）放到 b 上的结果。
     合成规则：两个同字同级的单位才能合成升级；不同级只能换位 */
  judge(aChar, aLevel, b) {
    if (b.isGeneral) {
      if (aChar === b.def.char) return (aLevel === b.level && b.level < b.maxLevel) ? 'general-level' : 'swap';
      return 'swap';
    }
    if (aChar === b.def.char) return (aLevel === b.level && b.level < b.maxLevel) ? 'level' : 'swap';
    if (CONFIG.pairs[aChar + b.def.char] || CONFIG.pairs[b.def.char + aChar]) return 'pair';
    return 'swap';
  },

  /* 把 a 放到 (col,row)。
     a: {board: Tower} | {ch: '悟', slot: 0}
     b: 目标格已有单位（可为 null）。返回 {action, unit?} */
  placeOnto(a, col, row) {
    const b = Grid.inBounds(col, row) ? Grid.tiles[row][col].tower : null;
    const aUnit = a.board || null;
    const aChar = aUnit ? aUnit.def.char : a.ch;
    const aLevel = aUnit ? aUnit.level : (a.lv || 1);

    // 空格：直放
    if (!b) {
      if (!Grid.placeable(col, row)) return { action: 'fail' };
      if (aUnit) { Merge.removeUnit(aUnit); }
      const u = Merge.makeUnit(aUnit || Merge.towerKeyOfChar(aChar), col, row);
      if (aUnit) u.cd = 0.1;
      else if (a.lv > 1) u.level = Math.min(u.maxLevel, a.lv);   // 自走棋式高级字卡：直接落为对应等级
      SFX.play('place');
      return { action: 'move', unit: u };
    }

    const verdict = Merge.judge(aChar, aLevel, b);
    if (verdict === 'level' || verdict === 'general-level') {
      const lv = Math.min(b.maxLevel, Math.max(aLevel, b.level) + 1);
      if (aUnit) Merge.removeUnit(aUnit);
      b.level = lv;
      if (verdict === 'general-level') b.exp = 0;
      const color = verdict === 'general-level' ? (CONFIG.rarityColors[b.def.rarity] || '#e8933c') : '#ffd867';
      FX.ring(b.x, b.y, Grid.tile * 0.85, color);
      FX.float('Lv' + lv, b.x, b.y - Grid.tile * 0.6, '#ffd867', 16);
      SFX.play('merge');
      Bus.emit('towerMerged', { kind: verdict, unit: b });
      return { action: 'level', unit: b };
    }
    if (verdict === 'pair') {
      const key = CONFIG.pairs[b.def.char + aChar] || CONFIG.pairs[aChar + b.def.char];
      if (aUnit) Merge.removeUnit(aUnit);
      const bc = b.col, br = b.row;
      Merge.removeUnit(b);
      const g = Merge.makeUnit(key, bc, br);
      FX.burst(g.x, g.y, CONFIG.rarityColors[g.def.rarity] || '#e8933c');
      FX.float(g.def.name, g.x, g.y - Grid.tile * 0.7, '#ffd867', 17);
      SFX.play('levelup');
      Merge.unlockGeneral(key);
      Bus.emit('towerMerged', { kind: 'pair', unit: g });
      return { action: 'pair', unit: g };
    }
    // swap：仅棋盘↔棋盘换位（两塔都在棋盘，交换格子）
    if (aUnit) {
      const ac = aUnit.col, ar = aUnit.row, bc = b.col, br = b.row;
      Merge.removeUnit(aUnit); Merge.removeUnit(b);
      const na = Merge.makeUnit(aUnit, bc, br);
      Merge.makeUnit(b, ac, ar);
      na.cd = 0.1;
      SFX.play('place');
      return { action: 'swap', unit: na };
    }
    // 架子字 → 棋盘塔：不同级/不同字不再弹塔回架（防误操作），视为不可合成
    return { action: 'fail', reason: 'merge-level' };
  },

  /* 首次合成神将：图鉴解锁 + 魂晶奖励 */
  unlockGeneral(key) {
    const def = CONFIG.towers[key];
    Save.data.codex.generals = Save.data.codex.generals || {};
    if (!Save.data.codex.generals[key]) {
      Save.data.codex.generals[key] = true;
      R.crystalsEarned += 20;
      R.codexBonus += 20;
      HUD.toast(`图鉴解锁 · ${def.name}（+20 魂晶）`);
      Save.write();
    }
  },

  /* 首次抽到字：图鉴记录 */
  unlockChar(ch) {
    Save.data.codex.chars = Save.data.codex.chars || {};
    if (!Save.data.codex.chars[ch]) {
      Save.data.codex.chars[ch] = true;
      Save.write();
    }
  },

  /* 出售返还：普通字塔 sellRefund，神将 sellRefund + 4×等级 */
  sellValue(u) {
    return CONFIG.economy.sellRefund + (u.isGeneral ? 4 * u.level : 0);
  },
};
