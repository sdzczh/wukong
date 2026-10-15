/* 图鉴：字 / 神将 双页签面板 */
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
      `</div>`;
    sub.querySelectorAll('.codex-tab').forEach(b =>
      b.addEventListener('click', () => { SFX.play('click'); this.tab = b.dataset.tab; this.render(); }));

    const e = this.entries();
    if (this.tab === 'chars') {
      stats.innerHTML = `<div class="codex-grid">` + e.chars.map(x =>
        `<div class="codex-cell ${x.unlock ? '' : 'locked'} ${x.god ? 'god' : ''}">` +
        `<span class="codex-ch">${x.unlock ? x.ch : '？'}</span>` +
        `<span class="codex-nm">${x.unlock ? x.name : '未收录'}</span>` +
        `</div>`).join('') + `</div>`;
    } else {
      stats.innerHTML = `<div class="codex-grid">` + e.generals.map(x => {
        const d = x.def, rc = CONFIG.rarityColors[d.rarity];
        const body = x.unlock
          ? `<span class="codex-ch" style="color:${d.color}">${d.char}</span>` +
            `<span class="codex-nm">${d.name}</span>` +
            `<span class="codex-sub" style="color:${rc}">${d.rarity} · 攻${d.atk} 速${d.rate} 程${d.range}</span>` +
            `<span class="codex-skill">${d.skill.name}：${d.skill.desc}</span>`
          : `<span class="codex-ch">？</span>` +
            `<span class="codex-nm">？？？</span>` +
            `<span class="codex-sub">合成 ${d.pair[0]} + ${d.pair[1]} 解锁</span>`;
        return `<div class="codex-cell general ${x.unlock ? '' : 'locked'}">${body}</div>`;
      }).join('') + `</div>`;
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
