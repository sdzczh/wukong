/* HUD：顶栏、底栏（召唤/架子/铲子）、横幅、提示、提前叫波、红闪 */
const HUD = {
  init() {
    this.peachNum = document.getElementById('peach-num');
    this.heartNum = document.getElementById('heart-num');
    this.waveLabel = document.getElementById('wave-label');
    this.banner = document.getElementById('wave-banner');
    this.bannerMain = document.getElementById('wave-banner-main');
    this.bannerSub = document.getElementById('wave-banner-sub');
    this.toastEl = document.getElementById('toast');
    this.flashEl = document.getElementById('dmg-flash');
    this.callBtn = document.getElementById('btn-callwave');
    this.callBonus = document.getElementById('callwave-bonus');

    document.getElementById('btn-pause').addEventListener('click', () => {
      SFX.ensure(); SFX.play('click');
      Bus.emit('togglePause');
    });
    const soundBtn = document.getElementById('btn-sound');
    soundBtn.addEventListener('click', () => {
      SFX.ensure();
      Save.data.sound = !Save.data.sound;
      Save.write();
      this.refreshSound();
      SFX.play('click');
    });    document.getElementById('btn-fast').addEventListener('click', () => {
      SFX.ensure(); SFX.play('click');
      // 1→2→3→4 循环，偏好入档（下局开局沿用）
      const speeds = [1, 2, 3, 4];
      R.timeScale = speeds[(speeds.indexOf(R.timeScale) + 1) % speeds.length] || 1;
      Save.data.speed = R.timeScale;
      Save.write();
      this.refresh();
    });
    // 提前叫波
    this.callBtn.addEventListener('click', () => {
      SFX.ensure();
      const bonus = Director.callNow();
      if (bonus > 0) {
        R.peaches += bonus;
        FX.float('+' + bonus + ' 桃', 360, 260, '#ffd867', 20);
        SFX.play('coin');
        HUD.toast(`提前叫波 · 奖励 ${bonus} 桃`);
      }
      SFX.play('click');
      this.refresh();
    });

    // 挂机托管：仅无尽征战备战/交战中可见
    const idleBtn = document.getElementById('btn-idle');
    if (idleBtn) idleBtn.addEventListener('click', () => {
      SFX.ensure(); SFX.play('click');
      AutoBot.toggle();
    });

    BondUI.init();
    this.refreshSound();
    this.refresh();
  },

  refreshSound() {
    document.getElementById('btn-sound').classList.toggle('off', !Save.data.sound);
    SFX.refreshBgm();
  },
  refresh() {
    this.peachNum.textContent = R.peaches;
    this.heartNum.textContent = R.hearts;
    const fastBtn = document.getElementById('btn-fast');
    fastBtn.textContent = R.timeScale + '×';
    fastBtn.classList.toggle('off', R.timeScale === 1);
    if (Director.cur) {
      this.waveLabel.textContent = R.endless ? `无尽 · 第 ${R.wave} 波` : `第 ${R.wave} / ${CONFIG.waveCount} 波`;
    } else if (R.wave > 0 && (R.wave < CONFIG.waveCount || R.endless) && Director.intermission > 0) {
      const pre = R.endless ? '无尽 · ' : '';
      this.waveLabel.textContent = `${pre}第 ${R.wave + 1} 波 · ${Math.ceil(Director.intermission)}s`;
    } else {
      this.waveLabel.textContent = '备战中';
    }
    // 提前叫波按钮：备战期且有下一波可叫时显示，附带预估桃奖励
    const canCall = R.state === 'battle' && !Director.cur && R.wave > 0 && !R.modOffer
      && Director.intermission > 0 && (R.wave < CONFIG.waveCount || R.endless);
    this.callBtn.classList.toggle('hidden', !canCall);
    if (canCall) {
      const bonus = Math.round(Director.intermission * CONFIG.callWave.perSec);
      this.callBonus.textContent = '+' + bonus + ' 桃';
    }
    // 挂机「挂」按钮：仅无尽征战的对局中显示，开启后金色高亮
    const idleBtn = document.getElementById('btn-idle');
    if (idleBtn) {
      const canIdle = R.state === 'battle' && R.endless && !R.pvp;
      idleBtn.classList.toggle('hidden', !canIdle);
      idleBtn.classList.toggle('on', !!R.idle);
      idleBtn.title = R.idle ? '挂机中：自动召唤/合成/叫波（任意操作即暂停）' : '挂机托管：自动召唤/合成/摆位/叫波（挂机局不上榜）';
    }
    RackUI.refresh();
    BlessUI.refresh();
    BondUI.refresh();
  },

  /* 横幅：boss=true 时走红色警报样式（更久） */
  showBanner(main, sub, boss) {
    this.bannerMain.textContent = main;
    this.bannerSub.textContent = sub || '';
    this.banner.classList.toggle('boss', !!boss);
    this.banner.classList.remove('hidden');
    // 重启动画
    this.banner.style.animation = 'none';
    void this.banner.offsetWidth;
    this.banner.style.animation = '';
    clearTimeout(this._bt);
    this._bt = setTimeout(() => this.banner.classList.add('hidden'), boss ? 2600 : 1800);
  },

  /* 扣心红闪：移除类 → 强制 reflow → 重新加类，使动画可连续触发 */
  flashDamage() {
    if (!this.flashEl) return;
    this.flashEl.classList.remove('on');
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('on');
  },

  toast(msg) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('hidden');
    this.toastEl.style.animation = 'none';
    void this.toastEl.offsetWidth;
    this.toastEl.style.animation = '';
    clearTimeout(this._tt);
    this._tt = setTimeout(() => this.toastEl.classList.add('hidden'), 2000);
  },
};

/* 羁绊条：底栏上方共享条带的芯片行，实时显示全部羁绊进度（灰暗=未激活 / 点亮=生效中）。
   让位联动（用户对遮挡零容忍）：召唤选牌条、单位/字卡详情面板出现即让位；
   装备栏打开整体上抬；祝福条可见时叠其上方；祝福确认框弹出时暂避。点芯片弹详情。 */
const BondUI = {
  bar: null,

  init() {
    this.bar = document.getElementById('bond-bar');
    if (!this.bar) return;
    this.bar.addEventListener('click', e => {
      const chip = e.target.closest('.bd-chip');
      if (!chip) return;
      SFX.ensure(); SFX.play('click');
      const st = Bonds.status()[+chip.dataset.i];
      if (!st) return;
      HUD.toast(st.on
        ? `羁绊 · ${st.name}（${st.count}/${st.need}）${st.desc} ${Bonds.fmt(st.v, st.stat)}`
        : `羁绊 · ${st.name}（${st.count}/${st.need}）再上场 ${st.need - st.count} 名神将即激活：${st.desc}`);
    });
  },

  refresh() {
    const bar = this.bar || (this.bar = document.getElementById('bond-bar'));
    if (!bar) return;
    const draftUp = !!(R.draft && R.draft.length);
    const sel = document.getElementById('sel-panel');
    const item = document.getElementById('item-panel');
    const bc = document.getElementById('bless-confirm');
    const panelUp = (sel && !sel.classList.contains('hidden'))
      || (item && !item.classList.contains('hidden'))
      || (bc && !bc.classList.contains('hidden'));
    if (R.state !== 'battle' || draftUp || panelUp) {
      bar.classList.add('hidden'); bar._html = ''; return;
    }
    // 底位：装备栏打开整体上抬；祝福条可见时叠在祝福条上方
    const gb = GearUI.open && GearUI.bar && !GearUI.bar.classList.contains('hidden')
      ? GearUI.bar.offsetHeight : 0;
    let bottom = gb ? 156 + gb + 8 : 164;
    const bless = document.getElementById('bless-bar');
    if (bless && !bless.classList.contains('hidden') && bless.offsetHeight) {
      bottom = Math.max(bottom, (parseFloat(bless.style.bottom) || 164) + bless.offsetHeight + 8);
    }
    bar.style.bottom = bottom + 'px';
    const all = Bonds.status();
    const html = all.map((b, i) => {
      const cls = 'bd-chip' + (b.on ? ' on' : '');
      const val = b.on ? `<span class="bd-val">${Bonds.fmt(b.v, b.stat)}</span>` : '';
      return `<div class="${cls}" data-i="${i}" style="--bd:${b.color}">` +
        `<span class="bd-name">${b.name}</span><span class="bd-need">${b.count}/${b.need}</span>${val}</div>`;
    }).join('');
    if (bar._html !== html) { bar.innerHTML = html; bar._html = html; }
    bar.classList.remove('hidden');
  },
};
