/* 修炼：天赋树面板（三系 × 5 节点 + 齐天荣耀） */
'use strict';

const TalentUI = {
  show(from) {
    this.from = from || 'menu';
    this.overlay = document.getElementById('overlay');
    this.render();
    this.overlay.classList.remove('hidden');
  },

  hide() {
    this.overlay.classList.add('hidden');
    if (this.from === 'pause') Panels.showPause();
    else if (this.from === 'settle') Panels.showSettle(R.wave >= CONFIG.waveCount);
    else Panels.showMenu();
  },

  render() {
    const title = document.getElementById('overlay-title');
    const sub = document.getElementById('overlay-sub');
    const stats = document.getElementById('overlay-stats');
    const btns = document.getElementById('overlay-btns');
    title.textContent = '修 炼';
    sub.innerHTML =
      `<div style="color:#9fd8ff;font-size:20px">魂晶　${Save.data.crystals}　｜　悟空累计击杀　${Save.data.wukongKills}</div>`;

    const branches = ['po', 'zs', 'cs'];
    let html = `<div class="talent-tree">`;
    for (const b of branches) {
      const conf = CONFIG.talents[b];
      const lv = Talents.lv(b);
      html += `<div class="talent-branch"><div class="talent-bname">${conf.name}<span>${conf.theme}</span></div>`;
      conf.nodes.forEach((n, i) => {
        const owned = i < lv;
        const next = i === lv;
        const afford = next && Save.data.crystals >= CONFIG.talents.costs[i];
        html +=
          `<button class="talent-node ${owned ? 'owned' : next ? (afford ? 'next' : 'next poor') : 'locked'}" ` +
          `data-b="${b}" data-i="${i}" ${owned || !next ? 'disabled' : ''}>` +
          `<span class="tn-desc">${n.desc}</span>` +
          `<span class="tn-cost">${owned ? '✓' : CONFIG.talents.costs[i] + ' 晶'}</span>` +
          `</button>`;
      });
      html += `</div>`;
    }
    html += `</div>`;

    // 齐天荣耀（隐藏天赋）
    const g = CONFIG.talents.glory;
    const un = Talents.gloryUnlocked();
    html +=
      `<div class="talent-glory ${un ? 'on' : ''}">` +
      `<span class="tg-name">${un ? '★ ' + g.name : '？ 隐藏天赋'}</span>` +
      `<span class="tg-desc">${un ? g.desc : `孙悟空累计击杀 ${Save.data.wukongKills}/${g.need} 解锁`}</span>` +
      `</div>`;
    stats.innerHTML = html;
    stats.style.maxHeight = '760px';
    stats.style.overflowY = 'auto';

    stats.querySelectorAll('.talent-node.next').forEach(el =>
      el.addEventListener('click', () => {
        const msg = Talents.buy(el.dataset.b, Number(el.dataset.i));
        if (msg) { HUD.toast(msg); SFX.play('click'); }
        else { SFX.play('talent'); }
        this.render();
        // 魂晶数变化同步主菜单统计
        if (this.from === 'menu') Save.write();
      }));

    btns.innerHTML = '';
    const back = document.createElement('button');
    back.className = 'btn ghost';
    back.textContent = '返 回';
    back.addEventListener('click', () => { SFX.play('click'); this.hide(); });
    btns.appendChild(back);
  },
};
