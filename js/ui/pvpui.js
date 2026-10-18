/* 镇守 / 讨伐面板：上传终局阵容做异步关卡，挑一位道友的镇守阵开战。
   服务端只存阵容快照与守成/被破记录；战斗完全在本地跑。 */
'use strict';

function pvpEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const PvpUI = {
  from: 'menu',
  mine: null,
  list: null,
  loading: false,
  err: '',
  notice: '',
  publishing: false,
  view: 'main',       // main 镇守讨伐 / season 周季榜
  season: null,
  seasonErr: '',

  show(from) {
    this.from = from || 'menu';
    this.view = 'main';
    this.overlay = document.getElementById('overlay');
    Panels.card.classList.remove('menu');
    this.render();
    this.overlay.classList.remove('hidden');
    this.fetchList();
  },

  hide() {
    this.overlay.classList.add('hidden');
    if (this.from === 'settle') Panels.showSettle(R.lastWin);
    else if (this.from === 'pause') Panels.showPause();
    else Panels.showMenu();
  },

  close() { this.overlay.classList.add('hidden'); },

  fetchList() {
    const seq = (this.seq = (this.seq || 0) + 1);
    this.loading = true;
    this.err = '';
    this.render();
    fetch('/api/pvp/list?name=' + encodeURIComponent(User.get()) + '&t=' + Date.now(), { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(d => {
        if (seq !== this.seq) return;
        if (!d || d.ok !== true) throw new Error('bad payload');
        this.mine = d.mine || null;
        this.list = d.list || [];
        if (this.mine && this.mine.name) {
          Save.data.pvpDefWins = this.mine.wins || 0;   // 展示用镜像（不参与判定）
          Save.data.pvpDefLosses = this.mine.losses || 0;
        }
      })
      .catch(() => {
        if (seq !== this.seq) return;
        this.err = '镇守/讨伐服务暂不可用';
        if (!this.list) this.list = [];
      })
      .then(() => {
        if (seq !== this.seq) return;
        this.loading = false;
        this.render();
      });

    // 周季榜并行拉取（旧服务端无此接口时静默降级，不挡主面板）
    fetch('/api/pvp/season?name=' + encodeURIComponent(User.get()) + '&t=' + Date.now(), { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(d => {
        if (seq !== this.seq) return;
        if (!d || d.ok !== true || !Array.isArray(d.rows)) throw new Error('bad payload');
        this.season = d;
        this.seasonErr = '';
      })
      .catch(() => {
        if (seq !== this.seq) return;
        this.season = null;
        this.seasonErr = '周季榜暂不可用';
      })
      .then(() => { if (seq !== this.seq) return; this.render(); });
  },

  publish() {
    if (this.publishing) return;
    const name = User.get();
    if (!name) { this.notice = '请先取一个名号，再上传镇守阵'; this.render(); return; }
    const lu = Save.data.lastLineup;
    if (!lu || !lu.items || !lu.items.length || !lu.wave || !lu.seed) {
      this.notice = '请先完成一局新的战斗，再以终局阵容镇守';
      this.render();
      return;
    }
    const lineup = lu.items.slice(0, CONFIG.pvp.maxUnits)
      .map(it => ({ ch: it.ch, god: !!it.god, lv: it.lv || 1, star: it.star || 0 }));
    this.publishing = true;
    this.notice = '镇守阵上传中…';
    this.render();
    fetch('/api/pvp/defense', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, wave: lu.wave, seed: lu.seed, lineup }),
    })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(d => {
        if (!d || d.ok !== true) throw new Error('bad payload');
        this.mine = d.mine || this.mine;
        this.notice = `镇守阵已上线：${lineup.length} 座 · 原阵第 ${lu.wave} 波`;
      })
      .catch(() => { this.notice = '上传失败，镇守服务暂不可用'; })
      .then(() => { this.publishing = false; this.render(); this.fetchList(); });
  },

  attack(def) {
    if (!def || !def.lineup || !def.lineup.length) { this.notice = '该镇守阵无有效阵容'; this.render(); return; }
    this.close();
    Game.startPvp(def);
  },

  chips(lineup, max) {
    const arr = (lineup || []).slice(0, max || 12);
    let html = `<div class="pvp-chips">` + arr.map(u => {
      const key = CONFIG.charToTower[u.ch] || '';
      const def = CONFIG.towers[key];
      const col = def ? def.color : (u.god ? '#e8933c' : '#b9a8d4');
      return `<span class="pvp-chip${u.god ? ' god' : ''}" style="color:${col}">${pvpEsc(u.ch)}` +
        `<small>Lv${u.lv || 1}</small></span>`;
    }).join('');
    if ((lineup || []).length > arr.length) html += `<span class="pvp-chip more">+${lineup.length - arr.length}</span>`;
    return html + `</div>`;
  },

  render() {
    if (this.view === 'season') return this.renderSeason();
    const title = document.getElementById('overlay-title');
    const sub = document.getElementById('overlay-sub');
    const stats = document.getElementById('overlay-stats');
    const btns = document.getElementById('overlay-btns');
    const name = User.get();
    const lu = Save.data.lastLineup;

    title.textContent = '镇 守 讨 伐';
    sub.textContent = '异步 PVP · 你的终局阵容，就是别人的关底';
    let html = `<div class="pvp-me">本尊「<span class="pvp-me-name">${pvpEsc(name || '无名氏')}</span>」` +
      `<button class="pvp-rename">${name ? '改名' : '取名'}</button></div>`;
    if (this.notice) html += `<div class="pvp-notice">${pvpEsc(this.notice)}</div>`;

    /* —— 我的镇守 —— */
    html += `<div class="pvp-sec">我 的 镇 守</div>`;
    if (lu && lu.items && lu.items.length) {
      const kindName = lu.kind === 'daily' ? '每日轮回' : lu.kind === 'weekly' ? '每周异变' : '普通局';
      html += `<div class="pvp-my">` +
        `<div class="pvp-my-top">上局 ${kindName} · 第 ${lu.wave || '—'} 波 · ${lu.items.length} 座</div>` +
        this.chips(lu.items.slice(0, CONFIG.pvp.maxUnits), 12) +
        `<button class="pvp-publish">${this.publishing ? '上 传 中…' : '镇 守 此 阵'}</button>` +
        `<div class="pvp-hint">上传后覆盖旧阵；其他道友会用它当关底，守成/被破记入你的战绩</div>` +
        `</div>`;
    } else {
      html += `<div class="pvp-empty">还没有可镇守的阵容——先打完一局，结算后就能用终局布防镇守</div>`;
    }
    if (this.mine) {
      html += `<div class="pvp-record">守成 <b>${this.mine.wins || 0}</b> · 被破 <b>${this.mine.losses || 0}</b></div>`;
      const logs = this.mine.log || [];
      if (logs.length) {
        html += `<div class="pvp-logs">` + logs.slice(0, 4).map(l =>
          `<div class="pvp-log">${pvpEsc(l.a)} ${l.w ? '破阵成功' : '铩羽而归'} · 第 ${l.n} 阵</div>`
        ).join('') + `</div>`;
      }
    }
    if (this.season && this.season.me) {
      const m = this.season.me;
      html += `<div class="pvp-record">本周讨伐 <b>${m.w} 胜 ${m.l} 负</b>${m.rank ? ` · 暂列第 ${m.rank} 名` : ''}` +
        `<button class="pvp-season-link">看周季榜</button></div>`;
    }

    /* —— 可讨伐 —— */
    html += `<div class="pvp-sec">可 讨 伐</div>`;
    if (this.loading && !this.list) {
      html += `<div class="pvp-empty">榜文加载中…</div>`;
    } else if (this.err && (!this.list || !this.list.length)) {
      html += `<div class="pvp-empty">${pvpEsc(this.err)}<br><span class="pvp-hint">单机玩法不受影响</span></div>`;
    } else if (!this.list || !this.list.length) {
      html += `<div class="pvp-empty">暂无其他道友镇守——上传你的阵，等别人来破</div>`;
    } else {
      html += this.list.map((d, i) => {
        const gods = (d.lineup || []).filter(u => u.god).length;
        return `<div class="pvp-row">` +
          `<div class="pvp-row-main">` +
          `<div class="pvp-row-head"><span class="pvp-row-name">${pvpEsc(d.name)}</span>` +
          `<span class="pvp-row-wave">原阵 ${d.wave} 波</span></div>` +
          `<div class="pvp-row-sub">${(d.lineup || []).length} 座${gods ? ` · 神将 ${gods}` : ''} · 守成 ${d.wins || 0} / 被破 ${d.losses || 0}</div>` +
          this.chips(d.lineup, 8) +
          `</div>` +
          `<button class="pvp-fight" data-i="${i}">讨 伐</button>` +
          `</div>`;
      }).join('');
    }
    stats.innerHTML = html;
    stats.style.maxHeight = Math.max(300, Math.min(720, innerHeight - 300)) + 'px';
    stats.style.overflowY = 'auto';
    stats.querySelector('.pvp-rename').addEventListener('click', () => {
      SFX.play('click');
      Panels.showNameEntry(() => this.show(this.from));
    });
    const slink = stats.querySelector('.pvp-season-link');
    if (slink) slink.addEventListener('click', () => {
      SFX.play('click');
      this.view = 'season';
      this.render();
    });
    const pub = stats.querySelector('.pvp-publish');
    if (pub) pub.addEventListener('click', () => { SFX.play('click'); this.publish(); });
    stats.querySelectorAll('.pvp-fight').forEach(b => b.addEventListener('click', () => {
      SFX.play('click');
      this.attack(this.list[Number(b.dataset.i)]);
    }));

    btns.innerHTML = '';
    const mk = (text, fn) => {
      const el = document.createElement('button');
      el.className = 'btn ghost';
      el.textContent = text;
      el.addEventListener('click', () => { SFX.play('click'); fn(); });
      btns.appendChild(el);
    };
    mk(this.loading ? '刷 新 中…' : '刷 新', () => { if (!this.loading) this.fetchList(); });
    mk('周 季 榜', () => { this.view = 'season'; this.render(); });
    mk('返 回', () => this.hide());
  },

  /* ---------- 周季榜视图：本周讨伐战绩（攻方胜场排名） ---------- */
  renderSeason() {
    const title = document.getElementById('overlay-title');
    const sub = document.getElementById('overlay-sub');
    const stats = document.getElementById('overlay-stats');
    const btns = document.getElementById('overlay-btns');
    const meName = User.get();

    title.textContent = '周 季 榜';
    sub.textContent = '每周一重置 · 讨伐破阵积胜，守成亦有功';
    let html = '';
    const d = this.season;
    if (!d) {
      html += `<div class="pvp-empty">${pvpEsc(this.seasonErr || '周季榜加载中…')}</div>`;
    } else {
      const wk = String(d.week || '');
      const wkText = wk.length >= 6 ? `${wk.slice(0, 4)} 年第 ${Number(wk.slice(4))} 周` : '本周';
      html += `<div class="pvp-sec">${wkText} · ${d.total || d.rows.length} 人参战</div>`;
      if (!d.rows.length) {
        html += `<div class="pvp-empty">本周还没有讨伐记录——去破一座镇守阵，榜上留名</div>`;
      } else {
        const shown = d.rows.slice(0, 50);
        html += shown.map(r => {
          const me = r.name === meName;
          return `<div class="pvp-srow${me ? ' me' : ''}">` +
            `<span class="pvp-srank${r.rank <= 3 ? ' top' : ''}">${r.rank}</span>` +
            `<span class="pvp-sname">${pvpEsc(r.name)}</span>` +
            `<span class="pvp-srec"><b>${r.w}</b> 胜 <b>${r.l}</b> 负</span>` +
            `</div>`;
        }).join('');
        if (d.rows.length > shown.length) html += `<div class="pvp-empty">仅示前 50 名</div>`;
        if (d.me && d.me.rank && !shown.some(r => r.name === meName)) {
          html += `<div class="pvp-srow me"><span class="pvp-srank">…</span>` +
            `<span class="pvp-sname">${pvpEsc(meName || '我')}</span>` +
            `<span class="pvp-srec"><b>${d.me.w}</b> 胜 <b>${d.me.l}</b> 负 · 第 ${d.me.rank} 名</span></div>`;
        }
      }
    }
    stats.innerHTML = html;
    stats.style.maxHeight = Math.max(300, Math.min(720, innerHeight - 300)) + 'px';
    stats.style.overflowY = 'auto';

    btns.innerHTML = '';
    const mk = (text, fn) => {
      const el = document.createElement('button');
      el.className = 'btn ghost';
      el.textContent = text;
      el.addEventListener('click', () => { SFX.play('click'); fn(); });
      btns.appendChild(el);
    };
    mk('刷 新', () => this.fetchList());   // fetchList 完成后按当前视图重渲
    mk('返 回', () => { this.view = 'main'; this.render(); });
  },
};
