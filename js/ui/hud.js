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

    this.refreshSound();
    this.refresh();
  },

  refreshSound() {
    document.getElementById('btn-sound').classList.toggle('off', !Save.data.sound);
  },

  refresh() {
    this.peachNum.textContent = R.peaches;
    this.heartNum.textContent = R.hearts;
    this.waveLabel.textContent = R.wave > 0 ? `第 ${R.wave} / ${CONFIG.waveCount} 波` : '备战中';
    if (window.RackUI) RackUI.refresh();
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
