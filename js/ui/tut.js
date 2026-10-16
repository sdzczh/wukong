/* 新手三步引导：召唤 → 放字 → 再放/合成；完成或跳过后入档不再弹。
   气泡不拦截操作（pointer-events 仅跳过钮），条件轮询自动翻步。 */
'use strict';

const TutUI = {
  step: -1, _iv: null, _merged: false,

  init() {
    this.el = document.getElementById('tut-tip');
    this.msg = document.getElementById('tut-msg');
    document.getElementById('tut-skip').addEventListener('click', () => {
      SFX.ensure(); SFX.play('click'); this.finish();
    });
    Bus.on('towerMerged', () => { this._merged = true; });
  },

  /* 开局时调用：仅新手（tut 未完成）弹 */
  maybeStart() {
    if (Save.data.tut === 1) return;
    if (R.state !== 'battle') return;
    this._merged = false;
    this.step = 0;
    this.show();
    clearInterval(this._iv);
    this._iv = setInterval(() => this.check(), 300);
  },

  _texts() {
    return [
      '欢迎入轮回！点右下角「召唤」——花蟠桃抽 5 张字卡，点选 1 张入架',
      '点架子上的字，再点棋盘亮格放下；金框虚线是上局阵容占位建议，可照摆',
      '很好！再放一座塔：两张同字同级叠放会合成升级，神仙字凑成一对就唤醒神将',
    ];
  },

  show() {
    this.msg.textContent = this._texts()[this.step] || '';
    this.el.classList.remove('hidden');
  },

  check() {
    if (this.step < 0) return;
    if (R.state === 'menu' || R.state === 'over') { this.finish(); return; }
    if (R.state !== 'battle') return;   // 暂停/选词条期间挂起
    const done =
      this.step === 0 ? R.summonsDone > 0 :
      this.step === 1 ? R.towers.length >= 1 :
      (R.towers.length >= 2 || this._merged);
    if (!done) return;
    if (this.step >= 2) { this.finish(); return; }
    this.step++;
    SFX.play('click');
    this.show();
  },

  finish() {
    Save.data.tut = 1;
    Save.write();
    this.step = -1;
    clearInterval(this._iv);
    this._iv = null;
    this.el.classList.add('hidden');
  },
};
