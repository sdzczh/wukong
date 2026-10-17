/* 云存档：8 位设备码 + 静默自动同步（每 6 秒合并一次本地落盘） */
'use strict';

function cloudEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const CloudSave = {
  ALPHABET: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',   // 去掉 I/O/0/1
  DELAY: 6000,
  timer: 0,
  dirty: false,
  busy: false,
  lastError: '',

  code() { return (Save.data && Save.data.cloudCode) || ''; },

  gen() {
    let s = '';
    for (let i = 0; i < 8; i++) s += this.ALPHABET[RNG.int(this.ALPHABET.length)];
    return s;
  },

  /* 规范化用户输入：去分隔符/小写；非法返回 '' */
  parse(v) {
    const s = String(v == null ? '' : v).toUpperCase().replace(/[^A-Z0-9]/g, '');
    return /^[A-HJ-NP-Z2-9]{8}$/.test(s) ? s : '';
  },

  display(code) {
    code = code || this.code();
    return code ? code.slice(0, 4) + '-' + code.slice(4) : '';
  },

  timeText(t) {
    if (!t) return '尚未同步';
    const d = new Date(t);
    const p = n => (n < 10 ? '0' : '') + n;
    return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  },

  /* Save.write 后调用：合并 6 秒内的多次变化，避免频繁上传 */
  queue() {
    if (!this.code()) return;
    this.dirty = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.DELAY);
  },

  flush() {
    clearTimeout(this.timer);
    if (this.busy) { this.queue(); return; }
    if (!this.dirty) return;
    this.dirty = false;
    this.push(false);
  },

  push(manual) {
    const code = this.code();
    if (!code) return Promise.resolve({ ok: false, error: '未绑定设备码' });
    if (this.busy) {
      this.dirty = true;
      this.queue();
      return Promise.resolve({ ok: false, pending: true, error: '正在同步' });
    }
    this.busy = true;
    this.lastError = '';
    if (typeof CloudUI !== 'undefined' && CloudUI.visible) CloudUI.render();
    return fetch('/api/cloud', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, name: Save.data.username || '', data: Save.data }),
    })
      .then(r => r.json().then(d => {
        if (!r.ok || !d || d.ok !== true) throw new Error((d && d.error) || ('HTTP ' + r.status));
        return d;
      }))
      .then(d => {
        Save.data.cloudAt = d.updated || Date.now();
        Save.write({ silent: true });   // 只记同步时间，不再排队
        if (typeof CloudUI !== 'undefined' && CloudUI.visible) {
          CloudUI.notice = manual ? '已上传 · 云端存档已更新' : '云端已自动同步';
          CloudUI.render();
        }
        return { ok: true, updated: Save.data.cloudAt };
      })
      .catch(e => {
        this.lastError = e.message || '同步失败';
        if (manual && typeof CloudUI !== 'undefined' && CloudUI.visible) {
          CloudUI.notice = '上传失败：' + this.lastError;
          CloudUI.render();
        }
        return { ok: false, error: this.lastError };
      })
      .then(res => {
        this.busy = false;
        if (this.dirty) this.queue();
        if (typeof CloudUI !== 'undefined' && CloudUI.visible) CloudUI.render();
        return res;
      });
  },
};

/* ---------- 面板 ---------- */
const CloudUI = {
  from: 'save',
  visible: false,
  busy: false,
  notice: '',

  show(from) {
    this.from = from || 'save';
    this.visible = true;
    this.notice = '';
    this.render();
    document.getElementById('overlay').classList.remove('hidden');
  },

  hide() {
    this.visible = false;
    if (this.from === 'save') Panels.showSaveCode();
    else Panels.showMenu();
  },

  copy(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {}
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    return true;
  },

  render() {
    const title = document.getElementById('overlay-title');
    const sub = document.getElementById('overlay-sub');
    const stats = document.getElementById('overlay-stats');
    const btns = document.getElementById('overlay-btns');
    const code = CloudSave.code();
    const s = Save.data;

    title.textContent = '云 端 存 档';
    sub.textContent = code ? '设备码已绑定 · 存档变化自动同步' : '生成设备码，换设备也能接上进度';

    let html = '';
    if (this.notice) html += `<div class="cloud-notice">${cloudEsc(this.notice)}</div>`;
    if (code) {
      html += `<div class="cloud-box">` +
        `<div class="cloud-label">我的设备码</div>` +
        `<div class="cloud-code">${CloudSave.display(code)}</div>` +
        `<button class="cloud-copy">复 制</button>` +
        `<div class="cloud-status">上次同步　${CloudSave.timeText(s.cloudAt)} · 之后每次存档变化约 6 秒内自动上传</div>` +
        `</div>` +
        `<div class="cloud-local">本机存档　${cloudEsc(s.username || '无名氏')} · 最高 ${s.bestWave} 波 · 魂晶 ${s.crystals}</div>` +
        `<div class="cloud-hint">换设备时在「未绑定」界面输入这 8 位码，即可把云端进度拉回来。设备码就是钥匙，请记牢。</div>`;
    } else {
      html += `<div class="cloud-box">` +
        `<div class="cloud-label">首次使用</div>` +
        `<div class="cloud-hint">生成 8 位设备码后，当前存档会立即上传；之后每次进度变化都会自动同步。</div>` +
        `<button class="cloud-gen">生成设备码并上传</button>` +
        `</div>` +
        `<div class="cloud-restore">` +
        `<div class="cloud-label">已有设备码</div>` +
        `<input id="cloud-input" maxlength="12" placeholder="输入 8 位码，如 K7MP-3XQ9" autocomplete="off" spellcheck="false">` +
        `<button class="cloud-pull">从云端恢复</button>` +
        `</div>` +
        `<div class="cloud-hint">恢复会覆盖本机当前进度；设备码丢失后云端存档无法找回。</div>`;
    }
    stats.innerHTML = html;
    stats.style.maxHeight = '';
    stats.style.overflowY = '';

    const after = fn => { SFX.play('click'); fn(); };
    const gen = stats.querySelector('.cloud-gen');
    if (gen) gen.addEventListener('click', () => after(() => this.generate()));
    const cp = stats.querySelector('.cloud-copy');
    if (cp) cp.addEventListener('click', () => after(() => {
      this.copy(code);
      this.notice = '设备码已复制';
      this.render();
    }));
    const pull = stats.querySelector('.cloud-pull');
    if (pull) pull.addEventListener('click', () => after(() => this.restore()));
    const input = stats.querySelector('#cloud-input');
    if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') this.restore(); });

    btns.innerHTML = '';
    const mk = (text, fn, ghost) => {
      const el = document.createElement('button');
      el.className = 'btn' + (ghost ? ' ghost' : '');
      el.textContent = text;
      el.addEventListener('click', () => { SFX.play('click'); fn(); });
      btns.appendChild(el);
    };
    if (code) {
      mk(this.busy ? '上 传 中…' : '立即上传', () => this.upload());
      mk('从云端恢复', () => this.restore(), true);
      mk('换新设备码', () => this.rebind(), true);
    }
    mk('返 回', () => this.hide(), true);
  },

  generate() {
    if (this.busy) return;
    const code = CloudSave.gen();
    Save.data.cloudCode = code;
    this.busy = true;
    this.notice = '正在创建云端存档…';
    this.render();
    Save.write({ silent: true });
    CloudSave.push(true).then(r => {
      this.busy = false;
      if (r.ok) this.notice = '设备码已生成，存档已上传';
      else if (r.pending) this.notice = '设备码已生成，正在同步…';
      else this.notice = '设备码已生成，但上传失败：' + (r.error || '网络异常');
      this.render();
    });
  },

  upload() {
    if (this.busy || CloudSave.busy) return;
    this.busy = true;
    this.notice = '正在上传本机存档…';
    this.render();
    CloudSave.push(true).then(r => {
      this.busy = false;
      if (r.ok) this.notice = '已上传 · 云端存档已更新';
      else if (r.pending) this.notice = '正在同步，完成后会自动上传';
      else this.notice = '上传失败：' + (r.error || '网络异常');
      this.render();
    });
  },

  restore() {
    if (this.busy) return;
    let code = CloudSave.code();
    if (!code) {
      const input = document.getElementById('cloud-input');
      code = CloudSave.parse(input && input.value);
      if (!code) {
        this.notice = '设备码格式不对：应为 8 位字母数字（不含 I O 0 1）';
        this.render();
        return;
      }
    }
    this.busy = true;
    this.notice = '正在读取云端存档…';
    this.render();
    fetch('/api/cloud?code=' + encodeURIComponent(code) + '&t=' + Date.now(), { cache: 'no-store' })
      .then(r => r.json().then(d => {
        if (!r.ok || !d || d.ok !== true) throw new Error((d && d.error) || ('HTTP ' + r.status));
        return d;
      }))
      .then(d => {
        const t = d.data || {};
        const info = `将从云端恢复「${d.name || t.username || '无名氏'}」的存档：最高 ${t.bestWave || 0} 波 · 魂晶 ${t.crystals || 0}。\n\n本机当前进度将被覆盖，确定继续？`;
        if (!window.confirm(info)) {
          this.notice = '已取消恢复';
          this.busy = false;
          this.render();
          return;
        }
        const err = Save.applyCloud(t, code, d.updated);
        this.busy = false;
        if (err) {
          this.notice = '恢复失败：' + err;
        } else {
          this.notice = `已恢复「${Save.data.username || '无名氏'}」的进度 · 云端更新于 ${CloudSave.timeText(d.updated)}`;
        }
        this.render();
      })
      .catch(e => {
        this.busy = false;
        this.notice = '云端读取失败：' + (e.message || '网络异常');
        this.render();
      });
  },

  rebind() {
    if (this.busy) return;
    if (!window.confirm('换新设备码后，旧码仍能取回旧的云端存档，但本机将改为绑定新码并上传当前进度。\n\n确定换新码？')) return;
    const old = CloudSave.display();
    Save.data.cloudCode = CloudSave.gen();
    this.busy = true;
    this.notice = '正在换绑并上传…';
    this.render();
    Save.write({ silent: true });
    CloudSave.push(true).then(r => {
      this.busy = false;
      if (r.ok) this.notice = `已换绑：${old} → ${CloudSave.display()}`;
      else if (r.pending) this.notice = '已换绑，正在同步…';
      else this.notice = '换绑上传失败：' + (r.error || '网络异常');
      this.render();
    });
  },
};
