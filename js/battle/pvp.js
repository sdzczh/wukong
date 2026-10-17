/* 异步 PVP · 讨伐：把镇守者的终局阵容铸成 1-3 阵镜像敌军。
   镇守者只上传阵容快照（字/等级/星级 + 原地图种子），不需要在线。
   战场沿用讨伐方自己的经济与抽卡，但地图与镇守者同种子，保证同图对局。 */
'use strict';

const Pvp = {
  lastResult: null,   // 最近一次讨伐上报 {id, defender, state:'sending'|'ok'|'fail', ...}

  towerDefOf(u) {
    const keys = Object.keys(CONFIG.towers);
    for (const k of keys) {
      const d = CONFIG.towers[k];
      if (d.char === u.ch) return d;
    }
    // 未配对的灵字塔：按神将字给出名字与金色（否则镜像显示成「镇守者」）
    if (CONFIG.godCharWeights && CONFIG.godCharWeights[u.ch]) {
      return { name: '灵字·' + u.ch, color: '#c8a85a' };
    }
    return null;
  },

  /* 镇守阵 → {waves, defs}：每阵 4 座镜像，血量随原阵波次/等级/星级放大 */
  build(def) {
    const units = (def.lineup || []).slice(0, CONFIG.pvp.maxUnits);
    const waves = [], defs = {};
    const per = CONFIG.pvp.unitsPerWave;
    let idx = 0;
    for (let w = 0; w < Math.ceil(units.length / per); w++) {
      const group = units.slice(w * per, (w + 1) * per);
      const gm = CONFIG.pvp.groupMul[Math.min(w, CONFIG.pvp.groupMul.length - 1)];
      const spawns = [];
      group.forEach((u, i) => {
        const td = this.towerDefOf(u);
        const key = 'pvp' + (idx++);
        const base = CONFIG.pvp.baseHp * (1 + 0.10 * Math.min(40, def.wave || 1));
        const lvMul = 1 + 0.22 * ((u.lv || 1) - 1);
        const starMul = 1 + 0.15 * (u.star || 0);
        const hp = Math.max(24, Math.round(base * lvMul * starMul * gm));
        const armor = (td && td.key === 'metal' ? 3 : 1) + (u.god ? 1 : 0);
        defs[key] = {
          char: u.ch,
          name: td ? td.name : '镇守者',
          hp,
          speed: 0.58 + w * 0.03,
          reward: 2,
          exp: 3,
          dmg: 1,
          size: (u.god ? 0.74 : 0.62),
          color: (td && td.color) || '#c8a85a',
          armor,
          pvp: true,
        };
        spawns.push({ t: 3 + i * 2.1, type: key });
      });
      waves.push({ n: w + 1, hpMul: 1, spawns });
    }
    return { waves, defs };
  },

  /* 结算上报：只记守方守成/被破，不影响讨伐方单机存档 */
  report(win) {
    if (!R.pvp || !R.pvp.name) return;
    const attacker = User.get();
    if (!attacker) return;
    const defender = R.pvp.name;
    const id = R.runId || 0;
    this.lastResult = { id, defender, state: 'sending', win: !!win };
    fetch('/api/pvp/result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attacker, defender, win: !!win, wave: R.wave }),
    })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(d => {
        if (!d || d.ok !== true) throw new Error('bad payload');
        this.lastResult = { id, defender, state: 'ok', win: !!win, wins: d.wins, losses: d.losses };
      })
      .catch(() => {
        this.lastResult = { id, defender, state: 'fail', win: !!win };
      });
  },
};
