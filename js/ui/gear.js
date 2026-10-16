/* 装备界面：局内装备栏（部件/库存/佩戴）+ 局外装备库（专属合成升级） */
'use strict';

const GearUI = {
  statLabel: { atkMul: '攻击', rateMul: '攻速', rangeMul: '射程', cdMul: '技冷却' },
  open: false,   // 装备栏开合（顶栏「装」按钮切换；开局/回菜单复位）

  init() {
    this.bar = document.getElementById('gear-bar');
    this.btn = document.getElementById('btn-gear');
    this.bar.addEventListener('click', e => {
      const part = e.target.closest('.gp-part');
      if (part) { SFX.ensure(); Gear.forge(part.dataset.fam); return; }
      const inv = e.target.closest('.gp-inv');
      if (inv) { SFX.ensure(); this.tapInv(+inv.dataset.i); }
    });
    this.btn.addEventListener('click', () => {
      SFX.ensure(); SFX.play('click');
      if (R.state !== 'battle' && R.state !== 'paused') return;
      if (R.draft && R.draft.length) { HUD.toast('先选完召唤的牌'); return; }
      this.open = !this.open;
      this.refresh();
    });
  },

  /* 有部件可合成 / 有装备可再合成 → 顶栏按钮亮金提示 */
  _canAct() {
    const need = CONFIG.gear.forgeNeed;
    for (const fam in CONFIG.gear.families) if ((R.parts[fam] || 0) >= need) return true;
    for (const it of R.equips) {
      if (it.lv >= CONFIG.gear.maxLv) continue;
      let n = 0;
      for (const x of R.equips) if (x.fam === it.fam && x.lv === it.lv) n++;
      if (n >= need) return true;
    }
    return false;
  },

  /* 部件合成后的提示文本（点部件 = 合成） */
  refresh() {
    if (!this.bar) return;
    const inBattle = R.state === 'battle' || R.state === 'paused';
    if (this.btn) {
      this.btn.classList.toggle('on', inBattle && this.open);
      this.btn.classList.toggle('can', inBattle && this._canAct());
    }
    if (!inBattle || (R.draft && R.draft.length) || !this.open) {
      this.bar.classList.add('hidden');   // 未开 / 选牌中 / 非战斗：收起
      BlessUI.refresh();                  // 收起后祝福条归位
      return;
    }
    const fams = CONFIG.gear.families;
    const partsHtml = Object.keys(fams).map(fam => {
      const f = fams[fam], n = R.parts[fam] || 0;
      const can = n >= CONFIG.gear.forgeNeed;
      return `<button class="gp-part${can ? ' can' : ''}" data-fam="${fam}" style="--gc:${f.color}">` +
        `<span class="gp-char">${f.char}</span><span class="gp-name">${f.name}</span>` +
        `<span class="gp-n">${n}/${CONFIG.gear.forgeNeed}</span></button>`;
    }).join('');

    // 库存装备按 系+级 聚合显示
    let invHtml = '';
    if (R.equips.length) {
      const groups = [];
      for (let i = 0; i < R.equips.length; i++) {
        const it = R.equips[i];
        let g = groups.find(x => x.fam === it.fam && x.lv === it.lv);
        if (!g) { g = { fam: it.fam, lv: it.lv, idx: i, n: 0 }; groups.push(g); }
        g.n++;
      }
      invHtml = groups.map(g => {
        const f = fams[g.fam];
        const canMerge = g.n >= CONFIG.gear.forgeNeed && g.lv < CONFIG.gear.maxLv;
        const armed = R.gearArm >= 0 && R.equips[R.gearArm] && R.equips[R.gearArm].fam === g.fam && R.equips[R.gearArm].lv === g.lv;
        return `<button class="gp-inv${canMerge ? ' can' : ''}${armed ? ' armed' : ''}" data-i="${g.idx}" style="--gc:${f.color}">` +
          `<span class="gp-char">${f.char}</span><span class="gp-lv">Lv${g.lv}${g.n > 1 ? '×' + g.n : ''}</span></button>`;
      }).join('');
    }

    this.bar.innerHTML =
      `<span class="gp-title">装备</span>${partsHtml}` +
      (invHtml ? `<span class="gp-sep"></span>${invHtml}` : '') +
      (R.gearArm >= 0 ? `<span class="gp-tip">点塔佩戴</span>` : '');
    this.bar.classList.remove('hidden');
    BlessUI.refresh();   // 开栏后祝福条上抬让位
  },

  /* 点库存装备：≥3 且未满级 → 合成升级；否则进入佩戴模式 */
  tapInv(idx) {
    const it = R.equips[idx];
    if (!it) return;
    let n = 0;
    for (const x of R.equips) if (x.fam === it.fam && x.lv === it.lv) n++;
    if (n >= CONFIG.gear.forgeNeed && it.lv < CONFIG.gear.maxLv && Gear.mergeInv(it.fam, it.lv)) return;
    if (R.gearArm === idx) { R.gearArm = -1; }
    else {
      R.gearArm = idx;
      HUD.toast('点棋盘上的单位佩戴（再点一下取消）');
      SFX.play('click');
    }
    this.refresh();
  },

  /* ---------- 局外装备库 ---------- */
  show(from) {
    this.from = from || 'menu';
    this.overlay = document.getElementById('overlay');
    Panels.card.classList.remove('menu');   // 退出菜单专用布局
    this.render();
    this.overlay.classList.remove('hidden');
  },

  hide() {
    this.overlay.classList.add('hidden');
    if (this.from === 'settle') Panels.showSettle(R.lastWin);
    else Panels.showMenu();
  },

  render() {
    const title = document.getElementById('overlay-title');
    const sub = document.getElementById('overlay-sub');
    const stats = document.getElementById('overlay-stats');
    const btns = document.getElementById('overlay-btns');
    const F = CONFIG.gear;
    title.textContent = '装 备 库';

    // 可操作汇总（只统计已点亮图鉴的行）
    let nForge = 0, nUp = 0;
    for (const key in CONFIG.sigGear) {
      if (!(Save.data.codex.generals && Save.data.codex.generals[key])) continue;
      if (Gear.canForgeSig(key)) nForge++;
      else if (Gear.canUpgradeSig(key)) nUp++;
    }
    const totalShards = Object.values(Save.data.shards || {}).reduce((a, b) => a + b, 0);
    sub.innerHTML =
      `<div style="color:#9fd8ff;font-size:20px">专属碎片 ${totalShards} ｜ 鬼将（boss）必掉 1 枚，败局也保留</div>` +
      ((nForge || nUp) ? `<div class="sig-actsum">${[nForge && `可合成 ${nForge}`, nUp && `可升级 ${nUp}`].filter(Boolean).join(' · ')}——金框行可直接操作</div>` : '') +
      `<div class="sig-hint" id="sig-hint"></div>`;

    let html = `<div class="sig-list">`;
    for (const key in CONFIG.sigGear) {
      const sg = CONFIG.sigGear[key];
      const gd = CONFIG.towers[key];
      const unlocked = !!(Save.data.codex.generals && Save.data.codex.generals[key]);
      const lv = Gear.sigLvOf(key);
      const shards = (Save.data.shards && Save.data.shards[key]) || 0;
      const canAct = unlocked && (Gear.canForgeSig(key) || Gear.canUpgradeSig(key));
      // 碎片进度：下一档所需（合成 3 / 升级 2；满级不计）
      const need = lv === 0 ? F.sigForge : (lv < F.sigMaxLv ? F.sigUpgrade : 0);

      const pips = `<i><b>${'●'.repeat(lv)}</b>${'○'.repeat(F.sigMaxLv - lv)}</i>`;
      const lvTag = lv > 0 ? `Lv${lv}` : '未持有';

      let desc, next = '';
      if (!unlocked) {
        desc = '唤醒该神将（两字凑对）点亮图鉴后解锁，碎片可先囤';
      } else {
        desc = sg.desc.replace('{v}', Gear.sigStatPct(key, Math.max(lv, 1)));
        if (lv >= F.sigMaxLv) next = '<i class="sig-next">已满级</i>';
        else if (lv > 0) {
          const sgn = sg.stat === 'cdMul' ? '-' : '+';
          next = `<i class="sig-next">下一级 → ${this.statLabel[sg.stat]} ${sgn}${Gear.sigStatPct(key, lv + 1)}%</i>`;
        }
      }

      let btn;
      if (!unlocked) btn = `<button class="sig-btn poor" data-k="${key}">未点亮</button>`;
      else if (lv === 0) btn = `<button class="sig-btn${canAct ? '' : ' poor'}" data-k="${key}" data-act="forge">合成 ${F.sigForge} 碎片</button>`;
      else if (lv >= F.sigMaxLv) btn = `<button class="sig-btn max" data-k="${key}">已满级</button>`;
      else btn = `<button class="sig-btn${canAct ? '' : ' poor'}" data-k="${key}" data-act="up">升 Lv${lv + 1} ${F.sigUpgrade} 碎片</button>`;

      html +=
        `<div class="sig-row${unlocked ? '' : ' locked'}${canAct ? ' can' : ''}" data-k="${key}" style="--gc:${sg.color}">` +
          `<div class="sig-head">` +
            `<span class="sig-gname" style="color:${gd.color}">${unlocked ? gd.name : '？？'}</span>` +
            `<span class="sig-name">${unlocked ? sg.name : '？？？'}</span>` +
            `<span class="sig-pips">${lvTag}${pips}</span>` +
          `</div>${btn}` +
          `<div class="sig-desc">${desc}${next}</div>` +
          `<div class="sig-shards">碎片 ${shards}${need ? '/' + need : ''}` +
            (need ? `<span class="sig-bar${shards >= need ? ' full' : ''}"><i style="width:${Math.min(100, Math.round(shards / need * 100))}%"></i></span>` : '') +
          `</div>` +
        `</div>`;
    }
    html += `</div>`;

    // 局内普通装备图例：四系数值 + 合成规则（装备库即完整装备参考）
    const fams = F.families;
    html += `<div class="sig-legend">` +
      `<div class="sl-head">局内普通装备 · 每局重新收集</div>` +
      `<div class="sl-chips">` + Object.keys(fams).map(fam => {
        const f = fams[fam];
        const sgn = f.stat === 'cdMul' ? '−' : '+';
        return `<span class="sl-chip" style="--gc:${f.color}"><b>${f.char}·${f.name}</b>${this.statLabel[f.stat]} ${sgn}${f.per.map(v => Math.round(v * 100)).join('/')}%${f.generalOnly ? ' ·仅神将' : ''}</span>`;
      }).join('') + `</div>` +
      `<div class="sl-note">击杀概率掉部件（厉魂 +20%）｜${F.forgeNeed} 部件 → Lv1，${F.forgeNeed} 件同系同级 → 升一级（满 Lv${F.maxLv}）｜出售/铲除自动回库</div>` +
    `</div>`;

    stats.innerHTML = html;
    stats.style.maxHeight = '780px';
    stats.style.overflowY = 'auto';

    // 交互反馈：不足/未点亮不再静默（#toast z-index 低于弹层会被盖住，改用卡内提示行）
    stats.querySelectorAll('.sig-row:not(.locked) .sig-btn').forEach(el => {
      el.addEventListener('click', () => {
        const k = el.dataset.k;
        const sg = CONFIG.sigGear[k];
        SFX.play('click');
        if (!el.dataset.act) return;   // 已满级
        const cost = el.dataset.act === 'forge' ? F.sigForge : F.sigUpgrade;
        const ok = el.dataset.act === 'forge' ? Gear.forgeSig(k) : Gear.upgradeSig(k);
        if (!ok) { this.hint(`还差 ${cost - (Save.data.shards?.[k] || 0)} 枚碎片——鬼将（boss）必掉`); return; }
        const msg = el.dataset.act === 'forge'
          ? `${sg.name} 合成完成（Lv1），唤醒${CONFIG.towers[k].name}自动随身`
          : `${sg.name} 升至 Lv${Gear.sigLvOf(k)}（碎片 -${F.sigUpgrade}）`;
        this.render();
        this.hint(msg);
        const row = stats.querySelector(`.sig-row[data-k="${k}"]`);
        if (row) { row.classList.add('just'); setTimeout(() => row.classList.remove('just'), 600); }
      });
    });
    stats.querySelectorAll('.sig-row.locked').forEach(row =>
      row.addEventListener('click', () => { SFX.play('click'); this.hint('先在局内唤醒该神将（两字凑对）点亮图鉴，碎片不丢'); }));

    btns.innerHTML = '';
    const back = document.createElement('button');
    back.className = 'btn ghost';
    back.textContent = '返 回';
    back.addEventListener('click', () => { SFX.play('click'); this.hide(); });
    btns.appendChild(back);
  },

  /* 卡内提示行：合成/升级结果、碎片不足、未点亮原因（toast 会被弹层盖住） */
  hint(msg) {
    const el = document.getElementById('sig-hint');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('pop');
    void el.offsetWidth;   // 重启淡入动画
    el.classList.add('pop');
    clearTimeout(this._ht);
    this._ht = setTimeout(() => { el.textContent = ''; }, 2600);
  },
};
