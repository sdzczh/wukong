/* 装备系统逻辑：部件掉落、合成升级、佩戴、专属碎片出入库。
   依赖在调用期解析（R/Save/RNG/FX/HUD/CONFIG），加载顺序无所谓。 */
'use strict';

const Gear = {
  /* ---------- 掉落 ---------- */
  onKill(e) {
    if (e.type === 'boss') { this.dropSigShard(e); return; }
    let ch = CONFIG.gear.partChance + (e.type === 'brute' ? CONFIG.gear.bruteBonus : 0);
    if (R.endless && R.wave > CONFIG.waveCount) {
      ch *= Math.pow(CONFIG.gear.endlessDecay, R.wave - CONFIG.waveCount);
    }
    if (RNG.next() < ch) this.dropPart(e);
  },

  dropPart(e) {
    const fams = Object.keys(CONFIG.gear.families);
    const fam = fams[RNG.int(fams.length)];
    R.parts[fam] = (R.parts[fam] || 0) + 1;
    const f = CONFIG.gear.families[fam];
    FX.float(`部件·${f.name} ${f.char}`, e.x, e.y - Grid.tile * 0.45, f.color, 15);
    SFX.play('coin');
    if (GearUI.bar) GearUI.refresh();
  },

  /* boss 必掉 1 枚专属碎片：鬼将池轮换后按种类绑定三位神将（场上神将若在绑定列中则 70% 优先），
     无绑定（兼容旧档/测试直造 boss）退回全场池；立即入档（败局也保留） */
  dropSigShard(e) {
    const bound = e.bossDef && e.bossDef.shards;
    const onBoard = R.towers.filter(t => t.isGeneral).map(t => t.key);
    let pool;
    if (bound) {
      const hit = onBoard.filter(k => bound.includes(k));
      pool = hit.length && RNG.next() < 0.7 ? hit : bound.slice();
    } else {
      pool = onBoard.length && RNG.next() < 0.7 ? onBoard : Object.keys(CONFIG.sigGear);
    }
    const key = pool[RNG.int(pool.length)];
    const sg = CONFIG.sigGear[key];
    Save.data.shards = Save.data.shards || {};
    Save.data.shards[key] = (Save.data.shards[key] || 0) + 1;
    R.sigRun = (R.sigRun || 0) + 1;
    Save.write();
    FX.float(`遗宝·${sg.name}碎片`, e.x, e.y - Grid.tile * 0.6, sg.color, 17);
    FX.ring(e.x, e.y, Grid.tile * 0.8, sg.color);
    SFX.play('god');
    HUD.toast(`鬼将遗宝：${sg.name}碎片 +1（已入库，局外可合成）`);
  },

  /* ---------- 部件合成 / 装备再合成 ---------- */
  canForge(fam) { return (R.parts[fam] || 0) >= CONFIG.gear.forgeNeed; },

  forge(fam) {
    if (!this.canForge(fam)) return false;
    R.parts[fam] -= CONFIG.gear.forgeNeed;
    R.equips.push({ fam, lv: 1 });
    Save.data.equipForged = (Save.data.equipForged || 0) + 1;
    Ach.check();
    SFX.play('merge');
    HUD.toast(`${CONFIG.gear.families[fam].name}装备打造完成，点装备再点塔佩戴`);
    if (GearUI.bar) GearUI.refresh();
    return true;
  },

  /* 3 件同系同级 → 1 件 lv+1；返回是否成功 */
  mergeInv(fam, lv) {
    if (lv >= CONFIG.gear.maxLv) return false;
    const idxs = [];
    for (let i = 0; i < R.equips.length; i++) {
      const it = R.equips[i];
      if (it.fam === fam && it.lv === lv) idxs.push(i);
      if (idxs.length >= CONFIG.gear.forgeNeed) break;
    }
    if (idxs.length < CONFIG.gear.forgeNeed) return false;
    for (let i = idxs.length - 1; i >= 0; i--) R.equips.splice(idxs[i], 1);
    R.equips.push({ fam, lv: lv + 1 });
    Save.data.equipForged = (Save.data.equipForged || 0) + 1;
    Ach.check();
    SFX.play('levelup');
    HUD.toast(`${CONFIG.gear.families[fam].name}装备升至 Lv${lv + 1}`);
    if (GearUI.bar) GearUI.refresh();
    return true;
  },

  /* ---------- 佩戴 ---------- */
  equipName(g) { return `${CONFIG.gear.families[g.fam].name} Lv${g.lv}`; },

  canEquip(t, it) {
    if (t.def.kind === 'aura') return '战鼓为阵眼，不可装备';
    if (it.fam === 'ling' && !t.isGeneral) return '灵犀仅神将可佩';
    return null;
  },

  /* 把库存第 idx 件装备给塔（自动交换旧装备）；返回错误文案或 null */
  equipTo(t, idx) {
    const it = R.equips[idx];
    if (!it) return '装备不存在';
    const no = this.canEquip(t, it);
    if (no) return no;
    R.equips.splice(idx, 1);
    if (t.gear) R.equips.push(t.gear);
    t.gear = it;
    const f = CONFIG.gear.families[it.fam];
    FX.ring(t.x, t.y, Grid.tile * 0.8, f.color);
    FX.float(f.name + ' Lv' + it.lv, t.x, t.y - Grid.tile * 0.6, f.color, 15);
    SFX.play('place');
    if (GearUI.bar) GearUI.refresh();
    return null;
  },

  unequip(t) {
    if (!t.gear) return;
    R.equips.push(t.gear);
    FX.float('已卸下 ' + this.equipName(t.gear), t.x, t.y - Grid.tile * 0.5, '#d9cdb4', 14);
    t.gear = null;
    SFX.play('click');
    if (GearUI.bar) GearUI.refresh();
  },

  /* ---------- 属性汇总（普通装备 + 专属） ---------- */
  modsOf(t) {
    const m = { atkMul: 0, rateMul: 0, rangeMul: 0, cdMul: 0 };
    if (t.gear) {
      const f = CONFIG.gear.families[t.gear.fam];
      m[f.stat] += f.per[t.gear.lv - 1];
    }
    if (t.isGeneral) {
      const lv = this.sigLvOf(t.key);
      if (lv > 0) {
        const sg = CONFIG.sigGear[t.key];
        m[sg.stat] += sg.base + sg.per * (lv - 1);
      }
    }
    return m;
  },

  sigLvOf(key) {
    const s = Save.data.sigGear || {};
    return s[key] || 0;
  },

  /* 神将唤醒时自动佩带上局外专属等级（属性经 modsOf 生效，此处只做表现） */
  onGeneralBorn(u) {
    const lv = this.sigLvOf(u.key);
    if (lv > 0) {
      const sg = CONFIG.sigGear[u.key];
      setTimeout(() => HUD.toast(`${u.def.name} 随身 ${sg.name} Lv${lv}（局外装备库可升级）`), 900);
    }
  },

  /* ---------- 专属局外合成 / 升级 ---------- */
  canForgeSig(key) {
    return this.sigLvOf(key) === 0 && (Save.data.shards?.[key] || 0) >= CONFIG.gear.sigForge;
  },
  canUpgradeSig(key) {
    const lv = this.sigLvOf(key);
    return lv > 0 && lv < CONFIG.gear.sigMaxLv && (Save.data.shards?.[key] || 0) >= CONFIG.gear.sigUpgrade;
  },

  forgeSig(key) {
    if (!this.canForgeSig(key)) return false;
    Save.data.shards[key] -= CONFIG.gear.sigForge;
    Save.data.sigGear[key] = 1;
    Ach.check();
    Save.write();
    SFX.play('levelup');
    return true;
  },

  upgradeSig(key) {
    if (!this.canUpgradeSig(key)) return false;
    Save.data.shards[key] -= CONFIG.gear.sigUpgrade;
    Save.data.sigGear[key] = this.sigLvOf(key) + 1;
    Save.write();
    SFX.play('levelup');
    return true;
  },

  /* 专属主属性当前值（展示用）：stat → 百分比数字 */
  sigStatPct(key, lv) {
    const sg = CONFIG.sigGear[key];
    return Math.round((sg.base + sg.per * (lv - 1)) * 100);
  },
};
