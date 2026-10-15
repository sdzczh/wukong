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

  /* 名号录入（首次启动 / 菜单改名） */
  showNameEntry(cb) {
    this.title.textContent = '道 友 名 号';
    this.sub.textContent = '名号会留在本地存档中';
    this.stats.innerHTML = '<input id="name-input" maxlength="8" placeholder="如：齐天大圣" autocomplete="off">';
    this.btns.innerHTML = '';
    const input = this.stats.querySelector('#name-input');
    const done = () => { User.set(input.value); SFX.play('click'); cb(); };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') done(); });
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = '确 定';
    btn.addEventListener('click', done);
    this.btns.appendChild(btn);
    this.overlay.classList.remove('hidden');
    setTimeout(() => input.focus(), 60);
  },

  showMenu() {
    const s = Save.data;
    this._fill(
      '无敌悟空',
      `道友「${s.username || '无名氏'}」· 文字合成塔防 · 地府篇`,
      `历史最高波次　${s.bestWave}　｜　累计击杀　${s.totalKills}　｜　魂晶　${s.crystals}`,
      [
        { text: '开 始 战 斗', fn: () => Game.startRun() },
        { text: '修 炼', fn: () => TalentUI.show('menu'), ghost: true },
        { text: '图 鉴', fn: () => Codex.show('menu'), ghost: true },
        { text: '改 名 号', fn: () => this.showNameEntry(() => this.showMenu()), ghost: true },
      ]
    );
  },

  showPause() {
    this._fill(
      '暂 停', '黄泉为路，幽冥作甲', '',
      [
        { text: '继 续', fn: () => Game.resume() },
        { text: '修 炼', fn: () => TalentUI.show('pause'), ghost: true },
        { text: '图 鉴', fn: () => Codex.show('pause'), ghost: true },
        { text: '重新开始', fn: () => Game.startRun(), ghost: true },
        { text: '回主菜单', fn: () => Game.toMenu(), ghost: true },
      ]
    );
  },

  /* 通关第 10 波后的选择：无尽征战 / 功成身退 */
  showEndlessOffer() {
    this._fill(
      '十 波 尽 破', '轮回殿暂安，幽魂潮未歇',
      '无尽征战：波次不设上限，敌人逐波增强<br>每过 5 波奖励 1 把铲子，可继续开垦「封」字地块',
      [
        { text: '无 尽 征 战', fn: () => Game.enterEndless() },
        { text: '功 成 身 退', fn: () => Game.gameOver(true), ghost: true },
      ]
    );
  },

  showSettle(win) {
    const reward = R.crystalsEarned;
    const title = win ? '大 捷' : (R.endless ? '壮 烈 战 殁' : '殿 破');
    const sub = win ? '幽魂尽散，轮回重明' : (R.endless ? `无尽征战止步于第 ${R.wave} 波` : '魂落黄泉，殿陷敌手');
    const stats =
      `本局波次　${R.wave}　｜　击杀　${R.kills}` +
      `<br>获得魂晶　<span style="color:#9fd8ff">+${reward}</span>` +
      `<span class="settle-break">（波次 ${R.wave * 10} ＋ 击杀 ${R.kills}${R.codexBonus ? ` ＋ 图鉴 ${R.codexBonus}` : ''}）</span>` +
      `<br>历史最高波次　${Save.data.bestWave}　｜　现有魂晶　${Save.data.crystals}`;
    this._fill(title, sub, stats, [
      { text: '再 来 一 局', fn: () => Game.startRun() },
      { text: '修 炼', fn: () => TalentUI.show('settle'), ghost: true },
      { text: '图 鉴', fn: () => Codex.show('settle'), ghost: true },
      { text: '回主菜单', fn: () => Game.toMenu(), ghost: true },
    ]);
  },
};
