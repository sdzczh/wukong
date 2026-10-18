/* 战绩分享图（3.0）：把本局结算数据绘成竖版战绩卡 canvas，以 <img> 展示 ——
   手机长按存图（iOS Safari 走 -webkit-touch-callout）、桌面右键另存，另附下载按钮。 */
'use strict';

const ShareCard = {
  W: 720, H: 1010,

  modeText() {
    if (R.pvp) return `讨伐「${R.pvp.name}」`;
    if (R.daily) return '每日轮回';
    if (R.weekly) return '每周异变';
    if (R.endless) return '无尽征战';
    return '轮回殿征程';
  },
  outcomeText() {
    if (R.pvp) return R.lastWin ? '破 阵' : '折 戟';
    if (R.lastWin) return '大 捷';
    return R.endless ? '壮烈战殁' : '殿 破';
  },

  /* 圆角矩形路径（iOS 15 无 roundRect，手画） */
  rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  },

  /* 绘制战绩卡，返回 { url, canvas } */
  make() {
    const kai = '"Ma Shan Zheng","Kaiti SC","STKaiti",serif';
    const cv = document.createElement('canvas');
    cv.width = this.W; cv.height = this.H;
    const ctx = cv.getContext('2d');
    const W = this.W, H = this.H, cx = W / 2;
    const lose = !R.lastWin;

    // 底色 + 双层描边
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#241a38'); g.addColorStop(1, '#141020');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#8a6f3a'; ctx.lineWidth = 3;
    this.rr(ctx, 14, 14, W - 28, H - 28, 18); ctx.stroke();
    ctx.strokeStyle = '#3a2f52'; ctx.lineWidth = 1.5;
    this.rr(ctx, 24, 24, W - 48, H - 48, 12); ctx.stroke();

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    // 标题
    ctx.font = `900 64px ${kai}`; ctx.fillStyle = '#ffd867';
    ctx.fillText('无 敌 悟 空', cx, 112);
    ctx.font = '400 21px sans-serif'; ctx.fillStyle = '#9a8fb4';
    ctx.fillText('文字合成塔防 · 地府篇', cx, 166);

    // 模式徽章
    const mode = this.modeText();
    ctx.font = '700 24px sans-serif';
    const mw = Math.min(W - 80, ctx.measureText(mode).width + 56);
    this.rr(ctx, (W - mw) / 2, 204, mw, 48, 24);
    ctx.fillStyle = lose ? '#3a2230' : '#3a3018'; ctx.fill();
    ctx.strokeStyle = lose ? '#8a4a5a' : '#8a6f3a'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = lose ? '#e8a0b0' : '#ffd867';
    ctx.fillText(mode, cx, 229);

    // 主结果：讨伐画「破阵/折戟」，其余画「第 N 波」
    ctx.font = `900 88px ${kai}`;
    ctx.fillStyle = lose ? '#d6a0aa' : '#ffe9a8';
    if (lose) { ctx.shadowColor = '#00000088'; ctx.shadowBlur = 10; }
    ctx.fillText(R.pvp ? this.outcomeText() : `第 ${R.wave} 波`, cx, 338);
    ctx.shadowBlur = 0;
    // 结果副行 + 数据行
    ctx.font = `900 30px ${kai}`; ctx.fillStyle = lose ? '#c08a96' : '#e8c85c';
    ctx.fillText(R.pvp ? `第 ${R.wave}/${R.pvpCount} 阵` : this.outcomeText(), cx, 420);
    ctx.font = '400 23px sans-serif'; ctx.fillStyle = '#d8cfe8';
    ctx.fillText(`击杀 ${(R.kills || 0).toLocaleString()}　｜　获魂晶 +${(R.crystalsEarned || 0).toLocaleString()}`, cx, 470);

    // 分隔线
    ctx.strokeStyle = '#3a2f52'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(80, 512); ctx.lineTo(W - 80, 512); ctx.stroke();
    ctx.fillStyle = '#8a6f3a';
    ctx.beginPath(); ctx.arc(cx, 512, 4, 0, Math.PI * 2); ctx.fill();

    // 信息行：道友 / 轮回 / 伤害榜
    let y = 560;
    ctx.textAlign = 'left';
    ctx.font = '400 22px sans-serif';
    ctx.fillStyle = '#9a8fb4'; ctx.fillText('道 友', 86, y);
    ctx.fillStyle = '#ffd867'; ctx.font = '700 24px sans-serif';
    const title = (typeof Ach !== 'undefined') ? Ach.titleText() : '';
    ctx.fillText(`「${Save.data.username || '无名氏'}」${title ? ` ·「${title}」` : ''}`, 190, y);
    y += 46;
    if (typeof Rebirth !== 'undefined' && Rebirth.layers() > 0) {
      ctx.fillStyle = '#9a8fb4'; ctx.font = '400 22px sans-serif'; ctx.fillText('轮 回', 86, y);
      ctx.fillStyle = '#a8e0c0'; ctx.font = '700 24px sans-serif';
      ctx.fillText(`第 ${Rebirth.layers()} 世 · 魂晶 ×${Rebirth.crystalMul().toFixed(2)}`, 190, y);
      y += 46;
    }
    const tops = Object.values(R.dmgStats || {})
      .sort((a, b) => b.dmg - a.dmg).slice(0, 3).filter(t => t.dmg > 0);
    if (tops.length) {
      ctx.fillStyle = '#9a8fb4'; ctx.font = '400 22px sans-serif'; ctx.fillText('伤害榜', 86, y);
      ctx.textAlign = 'left';
      tops.forEach((t, i) => {
        const ry = y + 4 + i * 44;
        ctx.font = '700 24px sans-serif';
        ctx.fillStyle = t.color || '#d8cfe8';
        ctx.fillText(`${['一', '二', '三'][i]} · ${t.name}`, 190, ry);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#d8cfe8'; ctx.font = '400 22px sans-serif';
        ctx.fillText(Math.round(t.dmg).toLocaleString(), W - 86, ry);
        ctx.textAlign = 'left';
      });
      y += 4 + tops.length * 44;
    }

    // 日期 + 落款
    ctx.textAlign = 'center';
    const d = new Date();
    ctx.font = '400 20px sans-serif'; ctx.fillStyle = '#8a7f9a';
    ctx.fillText(`${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`, cx, H - 148);
    ctx.font = `900 34px ${kai}`; ctx.fillStyle = '#ffd867';
    ctx.fillText('共 守 轮 回 殿', cx, H - 96);
    ctx.font = '400 21px sans-serif'; ctx.fillStyle = '#9a8fb4';
    ctx.fillText('http://43.99.15.109/', cx, H - 58);

    return { url: cv.toDataURL('image/png'), canvas: cv };
  },

  /* 结算页入口：img 展示（长按存图）+ 下载 + 返回 */
  show(from) {
    const card = this.make();
    Panels._fill('战 绩 卡', '把这一世的战果发给道友',
      `<img class="share-img" src="${card.url}" alt="无敌悟空战绩卡">` +
      `<div class="share-hint">手机长按图片可保存 · 桌面右键另存</div>`,
      []);
    const dl = document.createElement('a');
    dl.className = 'btn';
    dl.textContent = '下 载 图 片';
    dl.href = card.url;
    dl.download = `无敌悟空战绩_第${R.pvp ? R.wave + '阵' : R.wave + '波'}.png`;
    Panels.btns.appendChild(dl);
    const back = document.createElement('button');
    back.className = 'btn ghost';
    back.textContent = '返 回';
    back.addEventListener('click', () => {
      SFX.play('click');
      if (from === 'settle') Panels.showSettle(R.lastWin);
      else Panels.showMenu();
    });
    Panels.btns.appendChild(back);
  },
};
