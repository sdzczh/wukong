/* 弹层面板：主菜单 / 暂停 / 结算 */
const Panels = {
  init() {
    this.overlay = document.getElementById('overlay');
    this.title = document.getElementById('overlay-title');
    this.sub = document.getElementById('overlay-sub');
    this.stats = document.getElementById('overlay-stats');
    this.btns = document.getElementById('overlay-btns');

    // 双击「封」字地块：开垦确认
    this.ulPanel = document.getElementById('unlock-panel');
    this.ulCount = document.getElementById('ul-count');
    document.getElementById('ul-yes').addEventListener('click', () => {
      const cell = this.ulCell;
      this.hideUnlock();
      if (cell) { SFX.play('click'); Bus.emit('shovelAt', cell); }
    });
    document.getElementById('ul-no').addEventListener('click', () => {
      SFX.play('click');
      this.hideUnlock();
    });
  },

  /* 双击「封」字地块弹出：确认后走铲子开垦（消耗 1 把） */
  showUnlock(cell) {
    this.ulCell = cell;
    this.ulCount.textContent = R.shovelLeft;
    this.ulPanel.classList.remove('hidden');
    const p = Grid.center(cell.c, cell.r);
    FX.ring(p.x, p.y, Grid.tile * 0.6, '#d9cdb4', { life: 0.5, width: 4 });
  },

  hideUnlock() {
    if (this.ulPanel) this.ulPanel.classList.add('hidden');
    this.ulCell = null;
  },

  _fill(title, sub, statsHtml, buttons) {
    this.hideUnlock();   // 任何弹层出现时收起开垦确认
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
    const d = new Date();
    const key = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    const dailyBest = (s.daily && s.daily.key === key) ? s.daily.best : 0;
    const wk = Weekly.key();
    const weeklyBest = (s.weekly && s.weekly.key === wk) ? s.weekly.best : 0;
    this._fill(
      '无敌悟空',
      `道友「${s.username || '无名氏'}」· 文字合成塔防 · 地府篇`,
      `历史最高波次　${s.bestWave}　｜　累计击杀　${s.totalKills}　｜　魂晶　${s.crystals}<br>` +
      `今日轮回最佳　${dailyBest}　波　｜　本周异变最佳　${weeklyBest}　波<br>` +
      `<span class="settle-break">本周异变　${Weekly.summary()}</span>`,
      [
        { text: '开 始 战 斗', fn: () => Game.startRun() },
        { text: '每 日 轮 回', fn: () => Game.startDaily(), ghost: true },
        { text: '每 周 异 变', fn: () => Game.startWeekly(), ghost: true },
        { text: '修 炼', fn: () => TalentUI.show('menu'), ghost: true },
        { text: '装 备 库', fn: () => GearUI.show('menu'), ghost: true },
        { text: '图 鉴', fn: () => Codex.show('menu'), ghost: true },
        { text: '存 档 码', fn: () => this.showSaveCode(), ghost: true },
        { text: '改 名 号', fn: () => this.showNameEntry(() => this.showMenu()), ghost: true },
      ]
    );
  },

  /* 存档码面板：导出当前存档 / 粘贴导入覆盖 */
  showSaveCode() {
    this.title.textContent = '存 档 码';
    this.sub.textContent = '复制存档码可在其他设备恢复进度';
    this.stats.innerHTML =
      '<textarea id="save-code" spellcheck="false" readonly></textarea>' +
      '<div class="save-hint">点下方「复 制」后发送给新设备；在「导 入」框粘贴对方存档码可覆盖当前进度</div>';
    this.btns.innerHTML = '';
    const ta = this.stats.querySelector('#save-code');
    ta.value = Save.exportCode();
    ta.addEventListener('focus', () => ta.select());

    const mk = (text, fn, ghost) => {
      const el = document.createElement('button');
      el.className = 'btn' + (ghost ? ' ghost' : '');
      el.textContent = text;
      el.addEventListener('click', () => { SFX.play('click'); fn(); });
      this.btns.appendChild(el);
      return el;
    };
    mk('复 制', () => {
      ta.removeAttribute('readonly');
      ta.focus(); ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      ta.setAttribute('readonly', '');
      HUD.toast('存档码已复制');
    });
    mk('导 入', () => {
      const code = prompt('粘贴存档码（将覆盖当前进度）：');
      if (code == null) return;
      const err = Save.importCode(code);
      if (err) { HUD.toast('导入失败：' + err); return; }
      HUD.toast('导入成功 · 存档已更新');
      this.showMenu();
    }, true);
    mk('返 回', () => this.showMenu(), true);
    this.overlay.classList.remove('hidden');
  },

  showPause() {
    const bondsLine = Bonds.list().length
      ? `<br>${Bonds.list().map(a => `${a.name}(${a.count}人) ${a.desc}+${Math.round(a.v * 100)}%`).join('　｜　')}`
      : '';
    const weeklyLine = R.weekly
      ? `<br>本周异变　${R.weekly.map(p => p.name).join(' · ')}`
      : '';
    const modsLine = R.mods && Object.values(R.mods).some(v => v > 0)
      ? `<br>波间词条　${CONFIG.waveMods.pool.filter(p => R.mods[p.id] > 0).map(p => `${p.name}×${R.mods[p.id]}`).join(' × ')}`
      : '';
    this._fill(
      '暂 停', '黄泉为路，幽冥作甲', bondsLine + weeklyLine + modsLine,
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
    const dailyLine = R.daily
      ? `<br>今日轮回最佳　${(Save.data.daily && Save.data.daily.key === R.daily) ? Save.data.daily.best : R.wave}　波`
      : '';
    const weeklyLine = R.weekly
      ? `<br>本周异变最佳　${(Save.data.weekly && Save.data.weekly.key === Weekly.key()) ? Save.data.weekly.best : R.wave}　波`
      : '';
    const sigLine = R.sigRun > 0 ? `<br>本局专属碎片　+${R.sigRun}　（已入库，主菜单「装备库」合成）` : '';
    // 每塔伤害前三
    const tops = Object.values(R.dmgStats)
      .sort((a, b) => b.dmg - a.dmg).slice(0, 3)
      .filter(t => t.dmg > 0);
    const dmgLine = tops.length
      ? `<br><span class="settle-break">伤害榜　</span>` +
        tops.map((t, i) => `<span style="color:${t.color}">${['一', '二', '三'][i]}·${t.name} ${Math.round(t.dmg)}</span>`).join('　')
      : '';
    const stats =
      `本局波次　${R.wave}　｜　击杀　${R.kills}` +
      `<br>获得魂晶　<span style="color:#9fd8ff">+${reward}</span>` +
      `<span class="settle-break">（波次 ${R.wave * 10} ＋ 击杀 ${R.kills}${R.codexBonus ? ` ＋ 图鉴 ${R.codexBonus}` : ''}）</span>` +
      `<br>历史最高波次　${Save.data.bestWave}　｜　现有魂晶　${Save.data.crystals}` + dailyLine + weeklyLine + sigLine + dmgLine;
    this._fill(title, sub, stats, [
      { text: '再 来 一 局', fn: () => Game.startRun() },
      { text: '修 炼', fn: () => TalentUI.show('settle'), ghost: true },
      { text: '装 备 库', fn: () => GearUI.show('settle'), ghost: true },
      { text: '图 鉴', fn: () => Codex.show('settle'), ghost: true },
      { text: '回主菜单', fn: () => Game.toMenu(), ghost: true },
    ]);
  },
};
