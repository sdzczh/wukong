/* localStorage 存档 */
const Save = {
  KEY: 'wukong_tower_save_v1',
  data: null,
  defaults() {
    return {
      username: '',                       // 道友名号（本地用户模块，无账号体系）
      bestWave: 0, totalKills: 0, crystals: 0,
      sound: true,
      codex: {},                          // 神将图鉴点亮（M3）
      talents: { po: 0, zs: 0, cs: 0 },   // 三系已点层数（M4）
      wukongKills: 0,
    };
  },
  load() {
    try {
      this.data = Object.assign(this.defaults(), JSON.parse(localStorage.getItem(this.KEY)) || {});
    } catch (e) { this.data = this.defaults(); }
    // 图鉴结构归一：{ chars: {}, generals: {} }（兼容早期扁平结构）
    const raw = this.data.codex || {};
    this.data.codex = {
      chars: raw.chars || {},
      generals: raw.generals || (raw.chars ? {} : raw),
    };
  },
  write() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) {}
  },
};
