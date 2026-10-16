/* 图鉴：字 / 神将 / 成就 三页签面板 */
'use strict';

const Codex = {
  tab: 'chars',

  entries() {
    const c = Save.data.codex;
    return {
      chars: [
        ...Object.keys(CONFIG.charToTower).map(ch => ({
          ch, name: CONFIG.towers[CONFIG.charToTower[ch]].name,
          god: false, unlock: c.chars[ch],
        })),
        ...Object.keys(CONFIG.godCharWeights).map(ch => ({
          ch, name: '神将字', god: true, unlock: c.chars[ch],
        })),
      ],
      generals: Object.keys(CONFIG.towers)
        .filter(k => CONFIG.towers[k].general)
        .map(k => ({ key: k, def: CONFIG.towers[k], unlock: c.generals[k] })),
    };
  },

  show(from) {
    this.from = from || 'menu';
    this.tab = 'chars';
    this.overlay = document.getElementById('overlay');
    Panels.card.classList.remove('menu');   // 退出菜单专用布局
    this.render();
    this.overlay.classList.remove('hidden');
  },

  hide() {
    this.overlay.classList.add('hidden');
    if (this.from === 'pause') Panels.showPause();
    else if (this.from === 'settle') Panels.showSettle(R.lastWin);
    else Panels.showMenu();
  },

  render() {
    const title = document.getElementById('overlay-title');
    const sub = document.getElementById('overlay-sub');
    const stats = document.getElementById('overlay-stats');
    const btns = document.getElementById('overlay-btns');
    title.textContent = '图 鉴';
    sub.innerHTML =
      `<div class="codex-tabs">` +
      `<button class="codex-tab ${this.tab === 'chars' ? 'on' : ''}" data-tab="chars">字</button>` +
      `<button class="codex-tab ${this.tab === 'generals' ? 'on' : ''}" data-tab="generals">神将</button>` +
      `<button class="codex-tab ${this.tab === 'ach' ? 'on' : ''}" data-tab="ach">成就</button>` +
      `</div>`;
    sub.querySelectorAll('.codex-tab').forEach(b =>
      b.addEventListener('click', () => { SFX.play('click'); this.tab = b.dataset.tab; this.render(); }));

    const e = this.entries();
    const lvMap = Save.data.codex.charLv || {};
    const genLvMap = Save.data.codex.genLv || {};
    const starMap = Save.data.codex.genStar || {};
    if (this.tab === 'chars') {
      let n2 = 0, n3 = 0, known = 0;
      const cells = e.chars.map(x => {
        const lv = x.unlock ? (lvMap[x.ch] || 1) : 0;
        if (x.unlock) known++;
        if (lv >= 3) n3++; else if (lv === 2) n2++;
        const tier = x.unlock ? (lv >= 3 ? ' lv3' : lv === 2 ? ' lv2' : '') : '';
        const badge = lv > 1 ? `<span class="codex-lv lv${lv >= 3 ? 3 : 2}">最高 Lv${lv}</span>` : '';
        return `<div class="codex-cell${x.unlock ? tier : ' locked'}${x.god ? ' god' : ''}">` + badge +
          `<span class="codex-ch">${x.unlock ? x.ch : '？'}</span>` +
          `<span class="codex-nm">${x.unlock ? x.name : '未收录'}</span>` +
          `</div>`;
      }).join('');
      stats.innerHTML = `<div class="codex-meta">已识 ${known}/${e.chars.length} 字 · Lv2 ${n2} 张 · Lv3 ${n3} 张</div>` +
        `<div class="codex-grid">` + cells + `</div>`;
    } else if (this.tab === 'generals') {
      let awoken = 0, withSig = 0;
      const cells = e.generals.map(x => {
        const d = x.def, rc = CONFIG.rarityColors[d.rarity];
        const slv = x.unlock ? Gear.sigLvOf(x.key) : 0;
        if (x.unlock) {
          awoken++;
          if (slv > 0) withSig++;
        }
        const glv = x.unlock ? (genLvMap[x.key] || 1) : 0;
        const gst = x.unlock ? (starMap[x.key] || 0) : 0;
        const tier = x.unlock ? (glv >= 3 ? ' lv3' : glv === 2 ? ' lv2' : '') : '';
        const badge = glv > 1 ? `<span class="codex-lv lv${glv >= 3 ? 3 : 2}">实战 Lv${glv}</span>` : '';
        const starBadge = gst > 0 ? `<span class="codex-lv star">${'★'.repeat(gst)}</span>` : '';
        const sigDef = slv > 0 ? CONFIG.sigGear[x.key] : null;
        const sigLine = sigDef ? `<span class="codex-sig" style="color:${sigDef.color}">随身 ${sigDef.name} Lv${slv}</span>` : '';
        const body = x.unlock
          ? `<span class="codex-ch" style="color:${d.color}">${d.char}</span>` +
            `<span class="codex-nm">${d.name}</span>` +
            `<span class="codex-sub" style="color:${rc}">${d.rarity} · 攻${d.atk} 速${d.rate} 程${d.range}</span>` +
            `<span class="codex-skill">${d.skill.name}：${d.skill.desc}</span>` +
            `<span class="codex-skill">满星 · ${d.star3.name}：${d.star3.desc}</span>` +
            (() => {
              const mu = Mastery.uses(x.key), mt = Mastery.tierOf(x.key);
              return `<span class="codex-skill">熟练 ${mt > 0 ? `Lv${mt} ${CONFIG.mastery.names[mt - 1]}` : '尚未入门'} · 上场 ${mu} 次</span>`;
            })() + sigLine
          : `<span class="codex-ch">？</span>` +
            `<span class="codex-nm">？？？</span>` +
            `<span class="codex-sub">合成 ${d.pair.map(ch => ch + (Save.data.codex.chars[ch] ? '✓' : '')).join(' + ')} 解锁</span>`;
        return `<div class="codex-cell general${x.unlock ? tier : ' locked'}">` + badge + starBadge + body + `</div>`;
      }).join('');
      stats.innerHTML = `<div class="codex-meta">已唤醒 ${awoken}/${e.generals.length} 位神将 · 随身专属 ${withSig} 件</div>` +
        `<div class="codex-grid">` + cells + `</div>`;
    } else if (this.tab === 'ach') {
      const s = Save.data;
      const got = s.ach || {};
      const n = Object.keys(got).length;
      const cells = ACHS.map(a => {
        const has = !!got[a.id];
        const equipped = s.title === a.id;
        return `<div class="ach-cell${has ? '' : ' locked'}${equipped ? ' equipped' : ''}" data-ach="${a.id}">` +
          `<div class="ach-name">${has ? a.name : '？？？'}</div>` +
          `<div class="ach-desc">${a.desc}</div>` +
          (has ? `<div class="ach-title">称号「${a.title}」${equipped ? ' · 佩戴中' : ''}</div>` : `<div class="ach-title">称号 未解锁</div>`) +
          `</div>`;
      }).join('');
      stats.innerHTML = `<div class="codex-meta">成就 ${n}/${ACHS.length} · 点已达成条目佩戴 / 卸下其称号</div>` +
        `<div class="ach-grid">` + cells + `</div>`;
      stats.querySelectorAll('[data-ach]').forEach(el =>
        el.addEventListener('click', () => {
          if (Ach.toggleTitle(el.dataset.ach)) this.render();
        }));
    }
    stats.style.maxHeight = '760px';
    stats.style.overflowY = 'auto';

    btns.innerHTML = '';
    const back = document.createElement('button');
    back.className = 'btn ghost';
    back.textContent = '返 回';
    back.addEventListener('click', () => { SFX.play('click'); this.hide(); });
    btns.appendChild(back);
  },
};
