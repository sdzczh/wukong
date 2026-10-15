/* 装备界面：局内装备栏（部件/库存/佩戴）+ 局外装备库（专属合成升级） */
'use strict';

const GearUI = {
  statLabel: { atkMul: '攻击', rateMul: '攻速', rangeMul: '射程', cdMul: '技冷却' },

  init() {
    this.bar = document.getElementById('gear-bar');
    this.bar.addEventListener('click', e => {
      const part = e.target.closest('.gp-part');
      if (part) { SFX.ensure(); Gear.forge(part.dataset.fam); return; }
      const inv = e.target.closest('.gp-inv');
      if (inv) { SFX.ensure(); this.tapInv(+inv.dataset.i); }
    });
  },

  /* 部件合成后的提示文本（点部件 = 合成） */
  refresh() {
    if (!this.bar) return;
    if ((R.state !== 'battle' && R.state !== 'paused') || (R.draft && R.draft.length)) {
      this.bar.classList.add('hidden');   // 选牌条弹出时让位
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
    title.textContent = '装 备 库';
    const totalShards = Object.values(Save.data.shards || {}).reduce((a, b) => a + b, 0);
    sub.innerHTML =
      `<div style="color:#9fd8ff;font-size:20px">专属碎片　${totalShards}　｜　鬼将（boss）必掉 1 枚，带出对局永久保留</div>`;

    let html = `<div class="sig-list">`;
    for (const key in CONFIG.sigGear) {
      const sg = CONFIG.sigGear[key];
      const gd = CONFIG.towers[key];
      const unlocked = !!(Save.data.codex.generals && Save.data.codex.generals[key]);
      const lv = Gear.sigLvOf(key);
      const shards = (Save.data.shards && Save.data.shards[key]) || 0;
      const pct = lv > 0 ? Gear.sigStatPct(key, lv) : Gear.sigStatPct(key, 1);
      const desc = sg.desc.replace('{v}', pct);
      let btn;
      if (!unlocked) btn = `<button class="sig-btn" disabled>图鉴未点亮</button>`;
      else if (lv === 0) {
        const ok = shards >= CONFIG.gear.sigForge;
        btn = `<button class="sig-btn${ok ? '' : ' poor'}" data-k="${key}" data-act="forge" ${ok ? '' : 'disabled'}>合成　${CONFIG.gear.sigForge} 碎片</button>`;
      } else if (lv >= CONFIG.gear.sigMaxLv) {
        btn = `<button class="sig-btn max" disabled>已满级</button>`;
      } else {
        const ok = shards >= CONFIG.gear.sigUpgrade;
        btn = `<button class="sig-btn${ok ? '' : ' poor'}" data-k="${key}" data-act="up" ${ok ? '' : 'disabled'}>升级 Lv${lv + 1}　${CONFIG.gear.sigUpgrade} 碎片</button>`;
      }
      html +=
        `<div class="sig-row${unlocked ? '' : ' locked'}" style="--gc:${sg.color}">` +
        `<span class="sig-gname" style="color:${gd.color}">${unlocked ? gd.name : '？？'}</span>` +
        `<span class="sig-name">${unlocked ? sg.name : '？？'}</span>` +
        `<span class="sig-lv">${lv > 0 ? 'Lv' + lv : '—'}</span>` +
        `<span class="sig-desc">${unlocked ? desc : '合成该神将点亮图鉴后可见'}</span>` +
        `<span class="sig-shards">碎片 ${shards}</span>` +
        btn + `</div>`;
    }
    html += `</div>`;
    stats.innerHTML = html;
    stats.style.maxHeight = '780px';
    stats.style.overflowY = 'auto';

    stats.querySelectorAll('.sig-btn:not([disabled])').forEach(el =>
      el.addEventListener('click', () => {
        const k = el.dataset.k;
        if (el.dataset.act === 'forge') Gear.forgeSig(k);
        else Gear.upgradeSig(k);
        SFX.play('click');
        this.render();
      }));

    btns.innerHTML = '';
    const back = document.createElement('button');
    back.className = 'btn ghost';
    back.textContent = '返 回';
    back.addEventListener('click', () => { SFX.play('click'); this.hide(); });
    btns.appendChild(back);
  },
};
