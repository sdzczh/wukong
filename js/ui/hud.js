/* HUD：顶栏、底栏（召唤/架子/铲子）、横幅、提示 */
const HUD = {
  init() {
    this.peachNum = document.getElementById('peach-num');
    this.heartNum = document.getElementById('heart-num');
    this.waveLabel = document.getElementById('wave-label');
    this.banner = document.getElementById('wave-banner');
    this.bannerMain = document.getElementById('wave-banner-main');
    this.bannerSub = document.getElementById('wave-banner-sub');
    this.toastEl = document.getElementById('toast');

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
    });
    document.getElementById('btn-fast').addEventListener('click', () => {
      SFX.ensure(); SFX.play('click');
      R.timeScale = R.timeScale === 1 ? 2 : 1;
      this.refresh();
    });

    this.refreshSound();
    this.refresh();
  },

  refreshSound() {
    document.getElementById('btn-sound').classList.toggle('off', !Save.data.sound);
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
    RackUI.refresh();
  },

  showBanner(main, sub) {
    this.bannerMain.textContent = main;
    this.bannerSub.textContent = sub || '';
    this.banner.classList.remove('hidden');
    // 重启动画
    this.banner.style.animation = 'none';
    void this.banner.offsetWidth;
    this.banner.style.animation = '';
    clearTimeout(this._bt);
    this._bt = setTimeout(() => this.banner.classList.add('hidden'), 1800);
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
