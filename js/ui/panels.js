/* 弹层面板：主菜单 / 暂停 / 结算 */
const Panels = {
  init() {
    this.overlay = document.getElementById('overlay');
    this.card = document.getElementById('overlay-card');
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
    if (typeof BlessUI !== 'undefined' && BlessUI.hideConfirm) BlessUI.hideConfirm();   // 及祝福确认
    this.card.classList.remove('menu');   // 菜单专用布局仅主菜单使用
    this.title.textContent = title;
    this.sub.textContent = sub || '';
    this.stats.innerHTML = statsHtml || '';
    this.stats.style.maxHeight = '';      // 退出图鉴/榜单的长列表滚动设置
    this.stats.style.overflowY = '';
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

  /* 版本更新公告：首次打开当前版本时弹一次（独立 localStorage 记忆，不进存档码/云同步）
     force=true 调试预览。关闭即回主菜单。 */
  maybeShowUpdate(force) {
    const rel = CONFIG.release;
    if (!rel || !rel.ver) return false;
    let seen = '';
    try { seen = localStorage.getItem('wukong_seen_ver') || ''; } catch (e) {}
    if (!force && seen === rel.ver) return false;
    const items = (rel.notes || []).map(n =>
      `<div class="upd-item"><span class="upd-t">${n.t}</span><span class="upd-d">${n.d}</span></div>`).join('');
    this._fill('更 新 公 告', `版本 ${rel.ver} · ${rel.date || ''}`, items, [
      { text: '知 道 了', fn: () => {
        try { localStorage.setItem('wukong_seen_ver', rel.ver); } catch (e) {}
        if (R.state === 'menu') this.showMenu(); else this.hide();
      } },
    ]);
    return true;
  },

  /* 名号录入（首次启动 / 菜单改名） */
  showNameEntry(cb) {
    this.card.classList.remove('menu');
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
    Ach.check();   // 兜底：老档/导入档在此补结算成就
    const titleTxt = Ach.titleText();
    const d = new Date();
    const key = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    const dailyBest = (s.daily && s.daily.key === key) ? s.daily.best : 0;
    const wk = Weekly.key();
    const weeklyBest = (s.weekly && s.weekly.key === wk) ? s.weekly.best : 0;
    // 副入口角标信息：图鉴进度 / 神兵与碎片
    const cx = s.codex || { chars: {}, generals: {} };
    const cxTotal = Object.keys(CONFIG.charToTower).length +
      Object.keys(CONFIG.godCharWeights).length +
      Object.keys(CONFIG.towers).filter(k => CONFIG.towers[k].general).length;
    const cxDone = Object.keys(cx.chars || {}).length + Object.keys(cx.generals || {}).length;
    const sigN = Object.keys(s.sigGear || {}).length;
    const shardSum = Object.values(s.shards || {}).reduce((a, b) => a + b, 0);
    const gearSub = sigN ? `神兵 ${sigN}/12 · 碎片 ${shardSum}` : `碎片 ${shardSum} · 三件合成`;
    const pvpN = (s.pvpWins || 0) + (s.pvpLosses || 0);
    const pvpSub = pvpN ? `讨伐 ${s.pvpWins || 0} 胜 · ${s.pvpLosses || 0} 负` : '异步 PVP · 以阵镇守';
    const cloudSub = s.cloudCode
      ? `云端已绑 · ${CloudSave.timeText(s.cloudAt)}`
      : '换机迁移 / 云同步';

    this._fill(
      '无敌悟空',
      `道友「${s.username || '无名氏'}」${titleTxt ? `·「<span style="color:#ffd867">${titleTxt}</span>」` : ''}· 文字合成塔防 · 地府篇`,
      `历史最高波次　${s.bestWave}　｜　累计击杀　${s.totalKills}　｜　魂晶　${s.crystals}` +
      `${(typeof Rebirth !== 'undefined' && Rebirth.layers() > 0) ? `　｜　轮回第 ${Rebirth.layers()} 世` : ''}<br>` +
      `<span class="settle-break">本周异变　${Weekly.summary()}</span>`,
      []
    );
    this.card.classList.add('menu');

    // 有残局：最上方给「继续上局」（绿色按钮，与开局 CTA 区分）
    const runInfo = (typeof RunSave !== 'undefined') ? RunSave.info() : null;
    if (runInfo) {
      const rc = document.createElement('button');
      rc.className = 'btn menu-cta resume';
      const waveTxt = runInfo.kind.indexOf('讨伐') === 0
        ? `第 ${runInfo.wave + 1} 阵` : `第 ${runInfo.wave + 1} 波`;
      rc.innerHTML = '<span class="mc-main">继 续 上 局</span>' +
        `<span class="mc-sub">${runInfo.kind} · ${waveTxt} · 心 ${runInfo.hearts}/${runInfo.heartsMax} · 桃 ${runInfo.peaches} · 场上 ${runInfo.towers}${runInfo.idle ? ' · 挂机中' : ''}</span>`;
      rc.addEventListener('click', () => { SFX.play('click'); RunSave.resume(); });
      this.btns.appendChild(rc);
    }

    // 主行动：开始战斗
    const cta = document.createElement('button');
    cta.className = 'btn menu-cta';
    cta.innerHTML = '<span class="mc-main">开 始 战 斗</span><span class="mc-sub">镇守轮回殿 · 十波幽魂</span>';
    cta.addEventListener('click', () => { SFX.play('click'); Game.startRun(); });
    this.btns.appendChild(cta);

    // 副入口 2×4 网格：角标直接带今日/本周战绩与成长进度
    const grid = document.createElement('div');
    grid.className = 'menu-grid';
    const tiles = [
      ['每日轮回', dailyBest ? `今日最佳 ${dailyBest} 波` : '今日未挑战', !dailyBest, () => Game.startDaily()],
      ['每周异变', weeklyBest ? `本周最佳 ${weeklyBest} 波` : '本周未挑战', !weeklyBest, () => Game.startWeekly()],
      ['修炼', `魂晶 ${s.crystals}`, false, () => TalentUI.show('menu')],
      ['装备库', gearSub, false, () => GearUI.show('menu')],
      ['图鉴', `已识 ${cxDone}/${cxTotal}`, false, () => Codex.show('menu')],
      ['镇守讨伐', pvpSub, false, () => PvpUI.show('menu')],
      ['风云榜', '全服今日 / 本周最佳', false, () => RankUI.show('menu')],
      ['存档迁移', cloudSub, false, () => this.showSaveCode()],
      ['转生轮回',
       (typeof Rebirth !== 'undefined' && Rebirth.layers() > 0)
         ? `第 ${Rebirth.layers()} 世 · 魂晶 ×${Rebirth.crystalMul().toFixed(2)}`
         : (s.bestWave >= CONFIG.rebirth.needBase ? '已达门槛 · 魂晶换永世增益' : `波次达 ${CONFIG.rebirth.needBase} 解锁`),
       false, () => this.showRebirth('menu'), true],
    ];
    for (const [name, sub, fresh, fn, wide] of tiles) {
      const el = document.createElement('button');
      el.className = 'menu-tile' + (wide ? ' wide' : '');
      el.innerHTML = `<span class="mt-name">${name}</span>` +
        `<span class="mt-sub${fresh ? ' fresh' : ''}">${sub}</span>`;
      el.addEventListener('click', () => { SFX.play('click'); fn(); });
      grid.appendChild(el);
    }
    this.btns.appendChild(grid);

    // 改名号：低调文字链
    const rename = document.createElement('button');
    rename.className = 'menu-link';
    rename.textContent = '改 名 号';
    rename.addEventListener('click', () => { SFX.play('click'); this.showNameEntry(() => this.showMenu()); });
    this.btns.appendChild(rename);
  },

  /* 存档迁移面板：本地存档码导出/导入 + 入口到云端同步 */
  showSaveCode() {
    this.card.classList.remove('menu');
    this.title.textContent = '存 档 迁 移';
    this.sub.textContent = '复制存档码换机恢复 · 云同步可自动接进度';
    const cloudLine = Save.data.cloudCode
      ? `<div class="save-cloud on">云端已绑　${CloudSave.display()}　·　上次同步 ${CloudSave.timeText(Save.data.cloudAt)}</div>`
      : `<div class="save-cloud">未绑定云端存档　·　点下方「云端同步」生成设备码，进度自动上云</div>`;
    this.stats.innerHTML =
      '<textarea id="save-code" spellcheck="false" readonly></textarea>' +
      '<div class="save-hint">点下方「复 制」后发送给新设备；在「导 入」框粘贴对方存档码可覆盖当前进度</div>' +
      cloudLine;
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
    mk('云端同步', () => CloudUI.show('save'));
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
        { text: '风云榜', fn: () => RankUI.show('pause'), ghost: true },
        { text: '重新开始', fn: () => Game.startRun(), ghost: true },
        { text: '回主菜单', fn: () => Game.toMenu(true), ghost: true },
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

  /* 转生轮回面板：当前世数与增益、下一世门槛费用、两步确认转生 */
  showRebirth(from) {
    this.from = from || 'menu';
    this.card.classList.remove('menu');
    const rb = CONFIG.rebirth, n = Rebirth.layers();
    const pct = v => Math.round(v * 100);
    const buffs = n > 0
      ? `结算魂晶 <b>+${pct(n * rb.crystalStep)}%</b>　｜　神将经验 <b>+${pct(n * rb.expStep)}%</b>　｜　开局蟠桃 <b>+${n * rb.peachStep}</b>`
      : `<span class="rb-none">尚未转生 —— 第一世从历史最高波次 ${rb.needBase} 起步</span>`;
    let next;
    if (Rebirth.maxed()) {
      next = `<div class="rb-next done">十世圆满 · 已至轮回尽头，功德无量</div>`;
    } else {
      const ok = Rebirth.can(), afford = Save.data.crystals >= Rebirth.cost();
      next = `<div class="rb-next${ok && afford ? ' ok' : ''}">` +
        `转生第 ${n + 1} 世：需历史最高波次达 <b>${Rebirth.need()}</b>（当前 ${Save.data.bestWave}） · 费用 <b>${Rebirth.cost()}</b> 魂晶（现有 ${Save.data.crystals}）` +
        `<br>增益变为：魂晶结算 +${pct((n + 1) * rb.crystalStep)}% · 神将经验 +${pct((n + 1) * rb.expStep)}% · 开局蟠桃 +${(n + 1) * rb.peachStep}` +
        `</div>`;
    }
    this._fill('转 生 轮 回',
      '渡尽一世功行，魂归轮回殿再启新程 —— 转生增益永世随行，不损既有修炼与装备',
      `<div class="rb-now">当前　第 ${n} 世${n >= rb.max ? '（圆满）' : ''}</div>` +
      `<div class="rb-buffs">${buffs}</div>` + next,
      []);
    // 转生按钮（两步确认防误触；3 秒未确认自动收回）
    if (!Rebirth.maxed()) {
      const btn = document.createElement('button');
      btn.className = 'btn menu-cta';
      let armed = false, timer = null;
      const paint = () => {
        btn.innerHTML = armed
          ? `<span class="mc-main">确 认 转 生</span><span class="mc-sub">魂晶 -${Rebirth.cost()} · 再点一次生效</span>`
          : `<span class="mc-main">转 生</span><span class="mc-sub">${Rebirth.can() ? `第 ${n + 1} 世 · 费用 ${Rebirth.cost()} 魂晶` : `需历史最高波次 ${Rebirth.need()} · 费用 ${Rebirth.cost()} 魂晶`}</span>`;
        btn.classList.toggle('rb-armed', armed);
      };
      paint();
      btn.addEventListener('click', () => {
        SFX.play('click');
        if (!armed) {
          armed = true; paint();
          timer = setTimeout(() => { armed = false; paint(); }, 3000);
          return;
        }
        clearTimeout(timer);
        if (Rebirth.doRebirth()) Panels.showRebirth(this.from);
        else { armed = false; paint(); }
      });
      this.btns.appendChild(btn);
    }
    const back = document.createElement('button');
    back.className = 'btn';
    back.textContent = '返 回';
    back.addEventListener('click', () => {
      SFX.play('click');
      if (this.from === 'settle') Panels.showSettle(R.lastWin);
      else Panels.showMenu();
    });
    this.btns.appendChild(back);
  },

  showSettle(win) {
    const reward = R.crystalsEarned;
    const pvp = R.pvp;
    const title = pvp ? (win ? '破 阵' : '折 戟')
      : win ? '大 捷' : (R.endless ? '壮 烈 战 殁' : '殿 破');
    const sub = pvp
      ? (win ? `镇守军尽破，讨伐「${pvp.name}」功成` : `止步第 ${R.wave} 阵，讨伐「${pvp.name}」未果`)
      : win ? '幽魂尽散，轮回重明' : (R.endless ? `无尽征战止步于第 ${R.wave} 波` : '魂落黄泉，殿陷敌手');
    const dailyLine = R.daily
      ? `<br>今日轮回最佳　${(Save.data.daily && Save.data.daily.key === R.daily) ? Save.data.daily.best : R.wave}　波`
      : '';
    const weeklyLine = R.weekly
      ? `<br>本周异变最佳　${(Save.data.weekly && Save.data.weekly.key === Weekly.key()) ? Save.data.weekly.best : R.wave}　波`
      : '';
    const sigLine = R.sigRun > 0 ? `<br>本局专属碎片　+${R.sigRun}　（已入库，主菜单「装备库」合成）` : '';
    // 称号与成就：佩戴中称号 + 本局新达成（展示后清空，避免跨局重复）
    const wornTxt = Ach.titleText();
    const titleLine = wornTxt ? `<br>佩戴称号　「<span style="color:#ffd867">${wornTxt}</span>」` : '';
    const achLine = Ach.fresh.length
      ? `<br><span style="color:#ffd867">成就达成　${Ach.fresh.map(a => a.name).join(' · ')}</span>`
      : '';
    Ach.fresh.length = 0;
    // 每塔伤害前三
    const tops = Object.values(R.dmgStats)
      .sort((a, b) => b.dmg - a.dmg).slice(0, 3)
      .filter(t => t.dmg > 0);
    const dmgLine = tops.length
      ? `<br><span class="settle-break">伤害榜　</span>` +
        tops.map((t, i) => `<span style="color:${t.color}">${['一', '二', '三'][i]}·${t.name} ${Math.round(t.dmg)}</span>`).join('　')
      : '';
    // 全服风云榜：本局自动上传成功后展示名次
    const rs = (typeof RankUI !== 'undefined') ? RankUI.lastSubmit : null;
    const rankLine = rs && rs.id === R.runId && rs.state === 'ok'
      ? `<br><span class="settle-rank">风云榜　今日第 ${rs.dayRank || '—'} · 本周第 ${rs.weekRank || '—'}</span>`
      : '';
    // 异步 PVP：本尊讨伐累计 + 守方最新守成/被破
    const pvpLine = pvp ? (() => {
      const pr = (typeof Pvp !== 'undefined') ? Pvp.lastResult : null;
      let line = `<br><span class="settle-rank">讨伐战绩　本尊 ${Save.data.pvpWins || 0} 胜 · ${Save.data.pvpLosses || 0} 负</span>` +
        `<br><span class="settle-break">镇守方「${pvp.name}」</span>`;
      if (pr && pr.id === R.runId) {
        if (pr.state === 'ok') line += `　守成 ${pr.wins} · 被破 ${pr.losses}`;
        else if (pr.state === 'sending') line += `　战报同步中…`;
        else line += `　战报未送达（守方记录未更新）`;
      }
      return line;
    })() : '';
    // 挂机时长（托管局专属；不上风云榜的提示也在这里）
    const idleLine = (R.idleMs > 30000 || R.idle)
      ? `<br>挂机时长　${(typeof AutoBot !== 'undefined' && AutoBot.fmtMs) ? AutoBot.fmtMs(R.idleMs || 0) : Math.round((R.idleMs || 0) / 1000) + ' 秒'}　<span style="color:#8a7f9a">（托管局不上风云榜）</span>`
      : '';
    // 转生轮回：世数加成展示 + 达标给直达入口（讨伐不计波次不参与）
    const rbN = (typeof Rebirth !== 'undefined') ? Rebirth.layers() : 0;
    const rbMulTxt = rbN > 0 ? ` ＋ 轮回 ×${Rebirth.crystalMul().toFixed(2)}` : '';
    const rbLine = rbN > 0
      ? `<br>轮回加成　第 ${rbN} 世 · 魂晶结算 ×${Rebirth.crystalMul().toFixed(2)} · 神将经验 +${Math.round(rbN * CONFIG.rebirth.expStep * 100)}%`
      : '';
    const stats = pvp
      ? `本局阵数　${R.wave}/${R.pvpCount}　｜　击杀　${R.kills}` +
        `<br>获得魂晶　<span style="color:#9fd8ff">+${reward}</span>` +
        `<span class="settle-break">（阵数 ${R.wave * 10} ＋ 击杀 ${R.kills} ＋ 讨伐 ${win ? CONFIG.pvp.winCrystals : CONFIG.pvp.loseCrystals}${R.codexBonus ? ` ＋ 图鉴 ${R.codexBonus}` : ''}${rbMulTxt}）</span>` +
        `<br>现有魂晶　${Save.data.crystals}` + pvpLine + sigLine + achLine + dmgLine
      : `本局波次　${R.wave}　｜　击杀　${R.kills}` +
        `<br>获得魂晶　<span style="color:#9fd8ff">+${reward}</span>` +
        `<span class="settle-break">（波次 ${R.wave * 10} ＋ 击杀 ${R.kills}${R.codexBonus ? ` ＋ 图鉴 ${R.codexBonus}` : ''}${rbMulTxt}）</span>` +
        `<br>历史最高波次　${Save.data.bestWave}　｜　现有魂晶　${Save.data.crystals}` + rbLine + idleLine + dailyLine + weeklyLine + sigLine + titleLine + achLine + dmgLine + rankLine;
    const rebirthBtn = (!pvp && (typeof Rebirth !== 'undefined') && Rebirth.can())
      ? [{ text: `转生轮回（第 ${Rebirth.layers() + 1} 世 · ${Rebirth.cost()} 魂晶）`, fn: () => this.showRebirth('settle') }]
      : [];
    const buttons = pvp
      ? [
          { text: '再 讨 一 阵', fn: () => Game.startPvp(pvp) },
          { text: '镇 守 讨 伐', fn: () => PvpUI.show('settle'), ghost: true },
          { text: '修 炼', fn: () => TalentUI.show('settle'), ghost: true },
          { text: '回主菜单', fn: () => Game.toMenu(), ghost: true },
        ]
      : [
          ...rebirthBtn,
          { text: '再 来 一 局', fn: () => Game.startRun() },
          { text: '修 炼', fn: () => TalentUI.show('settle'), ghost: true },
          { text: '装 备 库', fn: () => GearUI.show('settle'), ghost: true },
          { text: '图 鉴', fn: () => Codex.show('settle'), ghost: true },
          { text: '风云榜', fn: () => RankUI.show('settle'), ghost: true },
          { text: '回主菜单', fn: () => Game.toMenu(), ghost: true },
        ];
    this._fill(title, sub, stats, buttons);
  },
};
