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
    if (u.isGeneral) { Gear.onGeneralBorn(u); Mastery.countPlace(u.key); }   // 专属随身提示 + 熟练度上场计数
    Bonds.invalidate();                        // 神将增减 → 羁绊重算
    return u;
  },

  removeUnit(u) {
    const i = R.towers.indexOf(u);
    if (i >= 0) R.towers.splice(i, 1);
    if (Grid.inBounds(u.col, u.row) && Grid.tiles[u.row][u.col].tower === u) {
      Grid.tiles[u.row][u.col].tower = null;
    }
    if (R.selected === u) { R.selected = null; RackUI.hideSel(); }
    Bonds.invalidate();
  },

  /* 判定 aChar/aLevel（拖动方的字/单位）放到 b 上的结果。
     合成规则：两个同字同级的单位才能合成升级；同名神将任意等级合并 → 升星（满星后同级仍可升级）；
     不同级只能换位 */
  judge(aChar, aLevel, b) {
    if (b.isGeneral) {
      if (aChar === b.def.char) {
        if ((b.star || 0) < CONFIG.generalStars.max) return 'general-star';
        return (aLevel === b.level && b.level < b.maxLevel) ? 'general-level' : 'swap';
      }
      return 'swap';
    }
    if (aChar === b.def.char) return (aLevel === b.level && b.level < b.maxLevel) ? 'level' : 'swap';
    if (CONFIG.pairs[aChar + b.def.char] || CONFIG.pairs[b.def.char + aChar]) return 'pair';
    return 'swap';
  },

  /* ---------- 架子内合成（两张卡都在召唤架上，规则与棋盘完全一致） ---------- */

  /* 架子项统一口径：字 / 等级 / 等级上限（字卡与铲回的单位卡通用） */
  itemChar(item) { return item.type === 'unit' ? item.unit.def.char : item.ch; },
  itemLevel(item) { return item.type === 'unit' ? item.unit.level : (item.lv || 1); },
  itemMaxLevel(item) {
    if (item.type === 'unit') return item.unit.maxLevel;
    const key = CONFIG.charToTower[item.ch];
    return key ? (CONFIG.towers[key].maxLevel || CONFIG.towerMaxLevel) : CONFIG.godCharBase.maxLevel;
  },

  /* 架子内判定：a 放到 b 上的结果（同名神将升星 / 同字同级升级 / 神将字凑对），不可合成返回 null */
  judgeRack(a, b) {
    if (!a || !b) return null;
    const ac = Merge.itemChar(a), al = Merge.itemLevel(a);
    const bc = Merge.itemChar(b), bl = Merge.itemLevel(b);
    if (b.type === 'unit' && b.unit.isGeneral) {
      if (ac === bc) {
        if ((b.unit.star || 0) < CONFIG.generalStars.max) return 'general-star';
        return (al === bl && bl < b.unit.maxLevel) ? 'general-level' : null;
      }
      return null;
    }
    if (ac === bc) return (al === bl && bl < Merge.itemMaxLevel(b)) ? 'level' : null;
    if (CONFIG.pairs[ac + bc] || CONFIG.pairs[bc + ac]) return 'pair';
    return null;
  },

  /* 架子里的待放单位（未登棋盘，放置时由 placeOnto / makeUnit 注册） */
  makeRackUnit(key) {
    return CONFIG.towers[key].general ? new General(key, 0, 0) : new Tower(key, 0, 0);
  },

  /* 架子内合成：b（槽 j）吸收 a（槽 i）；成功返回 {verdict, text}，不可合成返回 null */
  mergeRack(i, j) {
    const a = R.rack[i], b = R.rack[j];
    if (i === j || !a || !b) return null;
    const verdict = Merge.judgeRack(a, b);
    if (!verdict) return null;
    if (a.type === 'unit' && a.unit.gear) { R.equips.push(a.unit.gear); GearUI.refresh(); }   // 被吸收单位的装备回库
    if (verdict === 'general-star') {
      R.rack[i] = null;
      b.unit.starUp();
      return { verdict, text: `升星 · ${b.unit.def.name} ★${b.unit.star}` };
    }
    if (verdict === 'pair') {
      const aCh = Merge.itemChar(a), bCh = Merge.itemChar(b);
      if (b.type === 'unit' && b.unit.gear) { R.equips.push(b.unit.gear); GearUI.refresh(); }
      const key = CONFIG.pairs[bCh + aCh] || CONFIG.pairs[aCh + bCh];
      R.rack[j] = { type: 'unit', unit: Merge.makeRackUnit(key) };
      Merge.unlockGeneral(key);
      R.rack[i] = null;
      SFX.play('levelup');
      return { verdict, text: `凑对唤醒 · ${R.rack[j].unit.def.name} 已入召唤架` };
    }
    if (b.type === 'unit') {
      b.unit.level = Math.min(b.unit.maxLevel, b.unit.level + 1);
      if (verdict === 'general-level') b.unit.exp = 0;
      if (b.unit.isGeneral) Merge.recordGeneral(b.unit.key, b.unit.level);
      else Merge.recordChar(b.unit.def.char, b.unit.level);
      R.rack[i] = null;
      SFX.play('merge');
      return { verdict, text: `合成升级 · ${b.unit.def.name} Lv${b.unit.level}` };
    }
    b.lv = (b.lv || 1) + 1;
    Merge.recordChar(Merge.itemChar(b), b.lv);
    R.rack[i] = null;
    SFX.play('merge');
    return { verdict, text: `合成升级 · ${Merge.itemChar(b)} Lv${b.lv}` };
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
      else if (a.lv > 1) { u.level = Math.min(u.maxLevel, a.lv); Merge.recordChar(aChar, u.level); }   // 自走棋式高级字卡：直接落为对应等级
      SFX.play('place');
      return { action: 'move', unit: u };
    }

    const verdict = Merge.judge(aChar, aLevel, b);
    if (verdict === 'general-star') {
      if (aUnit) Merge.removeUnit(aUnit);
      b.starUp();
      Bus.emit('towerMerged', { kind: 'general-star', unit: b });
      return { action: 'star', unit: b };
    }
    if (verdict === 'level' || verdict === 'general-level') {
      const lv = Math.min(b.maxLevel, Math.max(aLevel, b.level) + 1);
      if (aUnit) Merge.removeUnit(aUnit);
      b.level = lv;
      if (verdict === 'general-level') b.exp = 0;
      if (b.isGeneral) Merge.recordGeneral(b.key, lv);
      else Merge.recordChar(b.def.char, lv);
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

  /* 图鉴等级记录：字 / 神将历史最高等级（只升不降） */
  recordChar(ch, lv) {
    const m = Save.data.codex.charLv = Save.data.codex.charLv || {};
    if (lv > (m[ch] || 0)) { m[ch] = lv; Save.write(); }
  },

  recordGeneral(key, lv) {
    const m = Save.data.codex.genLv = Save.data.codex.genLv || {};
    if (lv > (m[key] || 0)) { m[key] = lv; Save.write(); }
  },

  /* 图鉴星级记录：神将历史最高星（只升不降） */
  recordStar(key, star) {
    const m = Save.data.codex.genStar = Save.data.codex.genStar || {};
    if (star > (m[key] || 0)) { m[key] = star; Save.write(); }
  },

  /* 出售返还：普通字塔 sellRefund，神将 sellRefund + 4×等级 + 6×星；「回春」词条每层 +2 */
  sellValue(u) {
    const mod = R.mods.sell * CONFIG.waveMods.steps.sell;
    return CONFIG.economy.sellRefund + mod +
      (u.isGeneral ? 4 * u.level + (u.star || 0) * CONFIG.generalStars.sellStep : 0);
  },
};
