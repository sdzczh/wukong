/* 弹层面板：主菜单 / 暂停 / 结算 */
const Panels = {
  init() {
    this.overlay = document.getElementById('overlay');
    this.title = document.getElementById('overlay-title');
    this.sub = document.getElementById('overlay-sub');
    this.stats = document.getElementById('overlay-stats');
    this.btns = document.getElementById('overlay-btns');
  },

  _fill(title, sub, statsHtml, buttons) {
    this.title.textContent = title;
    this.sub.textContent = sub || '';
    this.stats.innerHTML = statsHtml || '';
    this.btns.innerHTML = '';
    for (const b of buttons) {
      const el = document.createElement('button');
      el.className = 'btn' + (b.ghost ? ' ghost' : '');
      el.textContent = b.text;
      el.addEventListener('click', () => { SFX.play('click'); b.fn(); });
      this.btns.appendChild(el);
    }
    this.overlay.classList.remove('hidden');
  },

  hide() { this.overlay.classList.add('hidden'); },

  showMenu() {
    const s = Save.data;
    this._fill(
      '无敌悟空',
      '文字合成塔防 · 地府篇',
      `历史最高波次　${s.bestWave}　｜　累计击杀　${s.totalKills}　｜　魂晶　${s.crystals}`,
      [
        { text: '开 始 战 斗', fn: () => Game.startRun() },
        { text: '图 鉴', fn: () => Codex.show('menu'), ghost: true },
      ]
    );
  },

  showPause() {
    this._fill(
      '暂 停', '黄泉为路，幽冥作甲', '',
      [
        { text: '继 续', fn: () => Game.resume() },
        { text: '图 鉴', fn: () => Codex.show('pause'), ghost: true },
        { text: '重新开始', fn: () => Game.startRun(), ghost: true },
        { text: '回主菜单', fn: () => Game.toMenu(), ghost: true },
      ]
    );
  },

  showSettle(win) {
    const reward = R.crystalsEarned;
    const title = win ? '大 捷' : '殿 破';
    const sub = win ? '幽魂尽散，轮回重明' : '魂过奈何，殿陷敌手';
    const stats =
      `本局波次　${R.wave}　｜　击杀　${R.kills}` +
      `<br>获得魂晶　<span style="color:#9fd8ff">+${reward}</span>` +
      `<br>历史最高波次　${Save.data.bestWave}`;
    this._fill(title, sub, stats, [
      { text: '再 来 一 局', fn: () => Game.startRun() },
      { text: '图 鉴', fn: () => Codex.show('settle'), ghost: true },
      { text: '回主菜单', fn: () => Game.toMenu(), ghost: true },
    ]);
  },
};
