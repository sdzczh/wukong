/* 风云榜：全服今日 / 本周最佳波次（server.js 提供 /api/board 与 /api/score）
   每局结算自动上传；静态预览（无 API）时优雅降级，不影响单机玩法。 */
'use strict';

function rankEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const RankUI = {
  from: 'menu',
  kind: 'daily',      // daily | weekly
  board: null,
  loading: false,
  err: '',
  lastSubmit: null,   // {id, state:'sending'|'ok'|'fail', dayRank?, weekRank?, wave?}
  timer: 0,
  seq: 0,

  show(from) {
    this.from = from || 'menu';
    this.overlay = document.getElementById('overlay');
    Panels.card.classList.remove('menu');   // 退出菜单专用布局
    this.render();
    this.overlay.classList.remove('hidden');
    this.fetchBoard();
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => { if (!this.loading) this.fetchBoard(true); }, 25000);
  },

  hide() {
    if (this.timer) { clearInterval(this.timer); this.timer = 0; }
    this.overlay.classList.add('hidden');
    if (this.from === 'pause') Panels.showPause();
    else if (this.from === 'settle') Panels.showSettle(R.lastWin);
    else Panels.showMenu();
  },

  /* 拉取榜文：静默刷新失败时保留上次结果 */
  fetchBoard(quiet) {
    const kind = this.kind;
    const seq = ++this.seq;
    this.loading = true;
    if (!quiet) { this.board = null; this.err = ''; this.render(); }
    fetch('/api/board?kind=' + kind + '&name=' + encodeURIComponent(User.get()) + '&t=' + Date.now(),
      { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(d => {
        if (seq !== this.seq) return;
        if (!d || d.ok !== true) throw new Error('bad payload');
        this.board = d;
        this.err = '';
      })
      .catch(() => {
        if (seq !== this.seq) return;
        this.err = '榜文服务暂不可用';
      })
      .then(() => {
        if (seq !== this.seq) return;
        this.loading = false;
        this.render();
      });
  },

  /* 结算自动上传：服务端按名号保留当日/当周最佳 */
  submitRun() {
    const name = User.get();
    if (!name || !R || !(R.wave > 0)) return;
    const id = R.runId || 0;
    const payload = {
      name,
      wave: R.wave,
      kills: R.kills || 0,
      kind: R.runKind || 'normal',
      endless: !!R.endless,
    };
    this.lastSubmit = { id, state: 'sending', wave: payload.wave };
    fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(d => {
        if (!d || d.ok !== true) throw new Error('bad payload');
        this.lastSubmit = {
          id, state: 'ok', wave: payload.wave,
          dayRank: d.dayRank, weekRank: d.weekRank,
        };
      })
      .catch(() => { this.lastSubmit = { id, state: 'fail', wave: payload.wave }; });
  },

  periodText(key) {
    if (this.kind === 'weekly') {
      const k = Number(key) || 0;
      return k ? `第 ${k % 100} 周` : '';
    }
    const s = String(key || '');
    if (s.length !== 8) return '';
    return `${Number(s.slice(4, 6))} 月 ${Number(s.slice(6, 8))} 日`;
  },

  render() {
    const title = document.getElementById('overlay-title');
    const sub = document.getElementById('overlay-sub');
    const stats = document.getElementById('overlay-stats');
    const btns = document.getElementById('overlay-btns');
    const name = User.get();

    title.textContent = '风 云 榜';
    sub.innerHTML =
      `<div class="codex-tabs">` +
      `<button class="codex-tab ${this.kind === 'daily' ? 'on' : ''}" data-rank="daily">今 日</button>` +
      `<button class="codex-tab ${this.kind === 'weekly' ? 'on' : ''}" data-rank="weekly">本 周</button>` +
      `</div>`;
    sub.querySelectorAll('[data-rank]').forEach(b => b.addEventListener('click', () => {
      if (this.kind === b.dataset.rank) return;
      SFX.play('click');
      this.kind = b.dataset.rank;
      this.board = null; this.err = '';
      this.render();
      this.fetchBoard();
    }));

    const periodTxt = this.board ? this.periodText(this.board.key) : '';
    const meta = this.board
      ? `${this.kind === 'daily' ? '今日榜' : '本周榜'}${periodTxt ? ' · ' + periodTxt : ''} · 共 ${this.board.total} 位道友`
      : '全服最佳波次 · 每局结算自动上传';
    const meLine = name
      ? `本尊「<span class="rank-me-name">${rankEsc(name)}</span>」` +
        (this.board && this.board.me
          ? ` · ${this.kind === 'daily' ? '今日' : '本周'}第 <span class="rank-me-rank">${this.board.me.rank}</span> 名`
          : '')
      : '尚未取名，无法上榜';

    let html = `<div class="rank-meta">${meta}</div>` +
      `<div class="rank-me">${meLine}<button class="rank-rename">${name ? '改名' : '取名'}</button></div>`;

    if (this.loading && !this.board) {
      html += `<div class="rank-empty">榜文加载中…</div>`;
    } else if (this.err && !this.board) {
      html += `<div class="rank-empty">${rankEsc(this.err)}<br>` +
        `<span class="rank-note">单机战绩已照常存档</span></div>`;
    } else if (this.board) {
      if (this.err) html += `<div class="rank-note" style="text-align:center">刷新失败，显示上次榜文</div>`;
      if (!this.board.rows.length) {
        html += `<div class="rank-empty">榜上尚无人，抢个首位？</div>`;
      } else {
        html += `<div class="rank-list">` + this.board.rows.map(r => {
          const me = name && r.name === name;
          const mode = r.endless ? '无尽' : r.kind === 'daily' ? '每日' : r.kind === 'weekly' ? '每周' : '普通';
          return `<div class="rank-row${me ? ' me' : ''}">` +
            `<span class="rank-no r${r.rank}">${r.rank}</span>` +
            `<span class="rank-name">${rankEsc(r.name)}</span>` +
            `<span class="rank-mode">${mode}</span>` +
            `<span class="rank-kill">杀 ${r.kills}</span>` +
            `<span class="rank-wave">${r.wave}<small>波</small></span>` +
            `</div>`;
        }).join('') + `</div>`;
      }
      html += `<div class="rank-note">` +
        (this.kind === 'daily' ? '每日 00:00' : '每周一 00:00') +
        `（北京时间）换榜 · 每人只记最佳一局</div>`;
    }
    stats.innerHTML = html;
    stats.style.maxHeight = '580px';
    stats.style.overflowY = 'auto';
    stats.querySelector('.rank-rename').addEventListener('click', () => {
      SFX.play('click');
      Panels.showNameEntry(() => this.show(this.from));
    });

    btns.innerHTML = '';
    const mk = (text, fn, ghost) => {
      const el = document.createElement('button');
      el.className = 'btn' + (ghost ? ' ghost' : '');
      el.textContent = text;
      el.addEventListener('click', () => { SFX.play('click'); fn(); });
      btns.appendChild(el);
      return el;
    };
    if (this.from === 'settle' && name) {
      mk('上 传 本 局', () => {
        if (this.loading) return;
        this.submitRun();
        setTimeout(() => this.fetchBoard(), 700);
      }, true);
    }
    mk(this.loading ? '榜 文 刷 新 中…' : '刷 新 榜 文', () => {
      if (!this.loading) this.fetchBoard();
    }, true);
    mk('返 回', () => this.hide(), true);
  },
};
