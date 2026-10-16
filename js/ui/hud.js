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
    RackUI.refresh();
    BlessUI.refresh();
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
