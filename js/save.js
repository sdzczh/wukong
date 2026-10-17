/* localStorage 存档 */
const Save = {
  KEY: 'wukong_tower_save_v1',
  EXPORT_PREFIX: 'WK1-',              // 存档码前缀（便于辨识与校验）
  data: null,
  defaults() {
    return {
      username: '',                       // 道友名号（本地用户模块，无账号体系）
      bestWave: 0, totalKills: 0, crystals: 0,
      sound: true,
      speed: 1,                           // 倍速偏好（1/2/3/4，下局沿用）
      tut: 0,                             // 新手引导完成标记（1=已完成/跳过）
      daily: { key: 0, best: 0 },         // 每日轮回当日最佳（key=yyyymmdd）
      weekly: { key: 0, best: 0 },        // 每周异变本周最佳（key=yyyy*100+周序）
      codex: {},                          // 神将图鉴点亮（M3）
      mastery: {},                        // 神将熟练度：上场次数累计（key → uses）
      talents: { po: 0, zs: 0, cs: 0 },   // 三系已点层数（M4）
      shards: {},                         // 专属装备碎片（boss 掉落，带出对局）
      sigGear: {},                        // 专属装备等级（局外合成升级，永久）
      lastLineup: null,                   // 上局阵容快照（占位建议用，{kind, seed, ts, items}）
      wukongKills: 0,
      bossKills: 0,                       // 累计鬼将击杀（成就）
      equipForged: 0,                     // 累计锻造装备件数（合成与升级都计，成就）
      dailyDone: 0,                       // 完成每日轮回局数（成就）
      weeklyDone: 0,                      // 完成每周异变局数（成就）
      pvpWins: 0,                         // 讨伐成功次数（成就）
      pvpLosses: 0,                       // 讨伐失利次数
      cloudCode: '',                      // 云存档设备码（8 位，空=未绑定）
      cloudAt: 0,                         // 云端最近同步时间戳
      ach: {},                            // 成就达成表 {id: 时间戳}
      title: '',                          // 当前佩戴称号（对应成就 id，''=未佩戴）
    };
  },
  load() {
    try {
      this.data = Object.assign(this.defaults(), JSON.parse(localStorage.getItem(this.KEY)) || {});
    } catch (e) { this.data = this.defaults(); }
    this.normalize();
  },
  /* 结构归一：图鉴 { chars, generals, charLv, genLv, genStar }（兼容早期扁平结构） */
  normalize() {
    const raw = this.data.codex || {};
    this.data.codex = {
      chars: raw.chars || {},
      generals: raw.generals || (raw.chars ? {} : raw),
      charLv: raw.charLv || {},          // 各字历史最高等级（图鉴等级区分）
      genLv: raw.genLv || {},            // 各神将实战最高等级
      genStar: raw.genStar || {},        // 各神将历史最高星（升星系统）
    };
    if (!this.data.weekly) this.data.weekly = { key: 0, best: 0 };
  },
  write(opts) {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) {}
    // 云同步：本地每次落盘后排队上传（静默写入不触发，避免同步回环）
    if ((!opts || !opts.silent) && typeof CloudSave !== 'undefined' && CloudSave.queue) {
      CloudSave.queue();
    }
  },

  /* ---------- 存档码：导出/导入（Base64(JSON)，前缀 WK1-） ---------- */

  /* 导出为存档码；失败时抛错 */
  exportCode() {
    const json = JSON.stringify(this.data);
    const bytes = new TextEncoder().encode(json);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    const b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return this.EXPORT_PREFIX + b64;
  },

  /* 导入存档码：成功返回 null，失败返回错误消息 */
  importCode(code) {
    try {
      code = (code || '').trim().replace(/\s+/g, '');
      if (!code) return '存档码为空';
      if (code.startsWith(this.EXPORT_PREFIX)) code = code.slice(this.EXPORT_PREFIX.length);
      let b64 = code.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const obj = JSON.parse(new TextDecoder().decode(bytes));
      if (!obj || typeof obj !== 'object' || (!('bestWave' in obj) && !('crystals' in obj))) {
        return '存档码内容无效';
      }
      this.data = Object.assign(this.defaults(), obj);
      this.normalize();
      this.write({ silent: true });   // 本地导入不立刻回传云端
      return null;
    } catch (e) {
      return '存档码解析失败（可能被截断或不完整）';
    }
  },

  /* 云端恢复：强制绑定本次输入的设备码；失败返回错误消息 */
  applyCloud(obj, code, updated) {
    if (!obj || typeof obj !== 'object' || (!('bestWave' in obj) && !('crystals' in obj))) {
      return '云端存档内容无效';
    }
    this.data = Object.assign(this.defaults(), obj);
    this.normalize();
    this.data.cloudCode = code || this.data.cloudCode || '';
    this.data.cloudAt = updated || Date.now();
    this.write({ silent: true });
    return null;
  },
};
